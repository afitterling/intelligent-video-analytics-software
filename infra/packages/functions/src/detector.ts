import { Resource } from "sst";
import {
  KinesisVideoClient,
  GetDataEndpointCommand,
} from "@aws-sdk/client-kinesis-video";
import {
  KinesisVideoArchivedMediaClient,
  GetImagesCommand,
} from "@aws-sdk/client-kinesis-video-archived-media";
import {
  RekognitionClient,
  DetectLabelsCommand,
  SearchFacesByImageCommand,
  IndexFacesCommand,
} from "@aws-sdk/client-rekognition";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { ScanCommand, QueryCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { ddb } from "./shared/ddb.js";
import type { Rule, RuleAction } from "./rules.js";

const kvs = new KinesisVideoClient({});
const rekog = new RekognitionClient({});
const s3 = new S3Client({});
const ses = new SESv2Client({});

interface DeviceRow {
  userId: string;
  deviceId: string;
  streamName: string;
  streamArn: string;
  status: string;
  email?: string;
}

/**
 * Scheduled every minute. For each "active" device, pull the most recent frame
 * via KVS GetImages, run Rekognition DetectLabels, evaluate the user's rules,
 * persist a detection record, fire any actions.
 */
export const handler = async () => {
  const devices = await listActiveDevices();
  const results = await Promise.allSettled(
    devices.map((d) => processDevice(d)),
  );
  const ok = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - ok;
  return { processed: results.length, ok, failed };
};

const listActiveDevices = async (): Promise<DeviceRow[]> => {
  // Scan is fine for this scope; switch to a GSI if device counts grow.
  const r = await ddb.send(
    new ScanCommand({
      TableName: Resource.Devices.name,
      FilterExpression: "#s = :a",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":a": "active" },
    }),
  );
  return (r.Items ?? []) as DeviceRow[];
};

const processDevice = async (device: DeviceRow) => {
  const rules = await loadRulesForDevice(device);
  if (rules.length === 0) return;

  const frame = await pullLatestFrame(device.streamName);
  if (!frame) return;

  const labels = await detect(frame, rules);
  if (labels.length === 0) return;

  // Persist a detection event keyed by (userId_deviceId, timestamp).
  const timestamp = new Date().toISOString();
  const key = `frames/${device.userId}/${device.deviceId}/${timestamp}.jpg`;
  await s3.send(
    new PutObjectCommand({
      Bucket: Resource.MediaBucket.name,
      Key: key,
      Body: frame,
      ContentType: "image/jpeg",
    }),
  );

  const retentionDays = Number(process.env.DETECTIONS_RETENTION_DAYS ?? "90");
  await ddb.send(
    new PutCommand({
      TableName: Resource.Detections.name,
      Item: {
        deviceId: `${device.userId}_${device.deviceId}`,
        timestamp,
        labels,
        imageKey: key,
        expiresAt: Math.floor(Date.now() / 1000) + retentionDays * 86400,
      },
    }),
  );

  for (const rule of rules) {
    const matches = labels.filter(
      (l) => rule.detect.includes(l.name ?? "") && (l.confidence ?? 0) >= rule.minConfidence,
    );
    if (matches.length === 0) continue;
    await fireAction(device, rule, matches, frame, timestamp);
  }
};

const loadRulesForDevice = async (device: DeviceRow): Promise<Rule[]> => {
  const r = await ddb.send(
    new QueryCommand({
      TableName: Resource.Rules.name,
      KeyConditionExpression: "userId = :u",
      FilterExpression: "(deviceId = :d OR deviceId = :star) AND enabled = :t",
      ExpressionAttributeValues: {
        ":u": device.userId,
        ":d": device.deviceId,
        ":star": "*",
        ":t": true,
      },
    }),
  );
  return (r.Items ?? []) as Rule[];
};

const pullLatestFrame = async (streamName: string): Promise<Uint8Array | null> => {
  try {
    const ep = await kvs.send(
      new GetDataEndpointCommand({ StreamName: streamName, APIName: "GET_IMAGES" }),
    );
    const arch = new KinesisVideoArchivedMediaClient({ endpoint: ep.DataEndpoint });
    const now = new Date();
    const r = await arch.send(
      new GetImagesCommand({
        StreamName: streamName,
        ImageSelectorType: "SERVER_TIMESTAMP",
        StartTimestamp: new Date(now.getTime() - 60_000),
        EndTimestamp: now,
        SamplingInterval: 1000,
        Format: "JPEG",
        MaxResults: 1,
      }),
    );
    const img = r.Images?.[0]?.ImageContent;
    if (!img) return null;
    return Buffer.from(img, "base64");
  } catch (err) {
    console.warn("frame pull failed", streamName, err);
    return null;
  }
};

interface DetLabel { name?: string; confidence?: number }

const detect = async (frame: Uint8Array, rules: Rule[]): Promise<DetLabel[]> => {
  const minConf = Math.min(...rules.map((r) => r.minConfidence ?? 75), 75);
  const r = await rekog.send(
    new DetectLabelsCommand({
      Image: { Bytes: frame },
      MinConfidence: minConf,
      MaxLabels: 20,
    }),
  );
  return (r.Labels ?? []).map((l) => ({ name: l.Name, confidence: l.Confidence }));
};

const fireAction = async (
  device: DeviceRow,
  rule: Rule,
  matches: DetLabel[],
  frame: Uint8Array,
  timestamp: string,
) => {
  if (!(await acquireCooldown(device, matches))) return;

  switch (rule.action.type) {
    case "log":
      console.log("rule fired", { device: device.deviceId, rule: rule.ruleId, matches });
      return;
    case "webhook":
      await fetch(rule.action.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deviceId: device.deviceId,
          ruleId: rule.ruleId,
          timestamp,
          matches,
        }),
      }).catch((e) => console.warn("webhook failed", e));
      return;
    case "email":
      await sendEmail(device, rule, matches, frame, timestamp, rule.action.to);
      return;
  }
};

const acquireCooldown = async (device: DeviceRow, matches: DetLabel[]) => {
  const nowSec = Math.floor(Date.now() / 1000);
  const cooldown = Number(process.env.ALERT_COOLDOWN_SECONDS ?? "3600");
  const subject = matches.map((m) => m.name).sort().join(",");
  try {
    await ddb.send(
      new PutCommand({
        TableName: Resource.AlertCooldown.name,
        Item: {
          deviceId: device.deviceId,
          expiresAt: nowSec + cooldown,
          lastSubject: subject,
        },
        ConditionExpression:
          "attribute_not_exists(deviceId) OR expiresAt < :now OR lastSubject <> :s",
        ExpressionAttributeValues: { ":now": nowSec, ":s": subject },
      }),
    );
    return true;
  } catch (err: unknown) {
    if (err && typeof err === "object" && "name" in err && err.name === "ConditionalCheckFailedException") {
      return false;
    }
    throw err;
  }
};

const sendEmail = async (
  device: DeviceRow,
  rule: Rule,
  matches: DetLabel[],
  frame: Uint8Array,
  timestamp: string,
  to: string,
) => {
  const labelList = matches
    .map((l) => `• ${l.name} (${l.confidence ? l.confidence.toFixed(1) : "?"}%)`)
    .join("\n");
  const subject = `IVA ${rule.name}: ${matches.map((l) => l.name).join(", ")}`;
  const text = `Device: ${device.deviceId}\nTime: ${timestamp}\n\nDetections:\n${labelList}`;
  const html = `
    <p><strong>Device:</strong> ${device.deviceId}</p>
    <p><strong>Time:</strong> ${timestamp}</p>
    <p><strong>Rule:</strong> ${rule.name}</p>
    <ul>${matches.map((l) => `<li>${l.name} (${l.confidence?.toFixed(1) ?? "?"}%)</li>`).join("")}</ul>
    <p><img src="cid:detection" alt="detection" style="max-width:640px"/></p>
  `;

  const mime = await new MailComposer({
    from: process.env.ALERT_SENDER!,
    to,
    subject,
    text,
    html,
    attachments: [
      { filename: "detection.jpg", content: Buffer.from(frame), contentType: "image/jpeg", cid: "detection" },
    ],
  })
    .compile()
    .build();

  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: process.env.ALERT_SENDER!,
      Destination: { ToAddresses: [to] },
      Content: { Raw: { Data: mime } },
    }),
  );
};
