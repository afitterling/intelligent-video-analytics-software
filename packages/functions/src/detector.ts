import { Resource } from "sst";
import {
  RekognitionClient,
  DetectLabelsCommand,
  SearchFacesByImageCommand,
  IndexFacesCommand,
  type Label,
} from "@aws-sdk/client-rekognition";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import MailComposer from "nodemailer/lib/mail-composer/index.js";

const rekog = new RekognitionClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sns = new SNSClient({});
const s3 = new S3Client({});
const ses = new SESv2Client({});

const ALERT_LABELS = new Set(["Person", "Vehicle", "Weapon", "Fire", "Smoke"]);
const MIN_CONFIDENCE = 75;

export const handler = async (event: {
  bucket: string;
  key: string;
  cameraId: string;
}) => {
  const result = await rekog.send(
    new DetectLabelsCommand({
      Image: { S3Object: { Bucket: event.bucket, Name: event.key } },
      MinConfidence: MIN_CONFIDENCE,
      MaxLabels: 20,
    }),
  );

  const labels = (result.Labels ?? []).map((l: Label) => ({
    name: l.Name,
    confidence: l.Confidence,
  }));

  const timestamp = new Date().toISOString();
  const retentionDays = Number(process.env.DETECTIONS_RETENTION_DAYS ?? "90");
  const expiresAt = Math.floor(Date.now() / 1000) + retentionDays * 86400;

  await ddb.send(
    new PutCommand({
      TableName: Resource.Detections.name,
      Item: {
        cameraId: event.cameraId,
        timestamp,
        imageKey: event.key,
        labels,
        expiresAt,
      },
    }),
  );

  const triggered = labels.filter((l) => l.name && ALERT_LABELS.has(l.name));
  if (triggered.length === 0) {
    return { ok: true, labels: labels.length, alerts: 0 };
  }

  const alertPayload = {
    cameraId: event.cameraId,
    timestamp,
    imageKey: event.key,
    detections: triggered,
  };

  await sns.send(
    new PublishCommand({
      TopicArn: Resource.Alerts.arn,
      Subject: `IVA: detection on ${event.cameraId}`,
      Message: JSON.stringify(alertPayload),
    }),
  );

  await sendEmailWithImage(event, triggered, timestamp);

  return { ok: true, labels: labels.length, alerts: triggered.length };
};

async function sendEmailWithImage(
  event: { bucket: string; key: string; cameraId: string },
  triggered: { name?: string; confidence?: number }[],
  timestamp: string,
) {
  const recipients = Resource.AlertRecipients.value
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);
  if (recipients.length === 0) return;

  const faceId = await identifySubject(event, triggered);
  if (!(await acquireCooldown(event.cameraId, faceId))) {
    console.log(
      `cooldown active for ${event.cameraId} (faceId=${faceId}), skipping email`,
    );
    return;
  }

  const obj = await s3.send(
    new GetObjectCommand({ Bucket: event.bucket, Key: event.key }),
  );
  const imageBytes = await obj.Body!.transformToByteArray();

  const labelList = triggered
    .map(
      (l) => `• ${l.name} (${l.confidence ? l.confidence.toFixed(1) : "?"}%)`,
    )
    .join("\n");

  const subject = `IVA alert: ${triggered.map((l) => l.name).join(", ")} on ${event.cameraId}`;
  const text = `Camera: ${event.cameraId}\nTime: ${timestamp}\n\nDetections:\n${labelList}\n\nImage attached.`;
  const html = `
    <p><strong>Camera:</strong> ${event.cameraId}</p>
    <p><strong>Time:</strong> ${timestamp}</p>
    <p><strong>Detections:</strong></p>
    <ul>${triggered.map((l) => `<li>${l.name} (${l.confidence?.toFixed(1) ?? "?"}%)</li>`).join("")}</ul>
    <p><img src="cid:detection" alt="detection" style="max-width:640px"/></p>
  `;

  const mime = await new MailComposer({
    from: process.env.ALERT_SENDER!,
    to: recipients,
    subject,
    text,
    html,
    attachments: [
      {
        filename: "detection.jpg",
        content: Buffer.from(imageBytes),
        contentType: "image/jpeg",
        cid: "detection",
      },
    ],
  })
    .compile()
    .build();

  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: process.env.ALERT_SENDER!,
      Destination: { ToAddresses: recipients },
      Content: { Raw: { Data: mime } },
    }),
  );
}

// Acquire the email-cooldown slot for a (cameraId, subject) pair.
// Send is allowed if: no prior row, prior row expired, OR the subject differs
// from the one we last alerted on (e.g. a different person on the same camera).
async function acquireCooldown(
  cameraId: string,
  faceId: string,
): Promise<boolean> {
  const nowSec = Math.floor(Date.now() / 1000);
  const cooldownSec = Number(process.env.ALERT_COOLDOWN_SECONDS ?? "3600");
  try {
    await ddb.send(
      new PutCommand({
        TableName: Resource.AlertCooldown.name,
        Item: {
          cameraId,
          expiresAt: nowSec + cooldownSec,
          lastFaceId: faceId,
        },
        ConditionExpression:
          "attribute_not_exists(cameraId) OR expiresAt < :now OR lastFaceId <> :face",
        ExpressionAttributeValues: { ":now": nowSec, ":face": faceId },
      }),
    );
    return true;
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "name" in err &&
      err.name === "ConditionalCheckFailedException"
    ) {
      return false;
    }
    throw err;
  }
}

// Identify the alert subject so the cooldown can distinguish "same person again"
// from "different person". For Person alerts we use the Rekognition face id; for
// non-Person alerts we fall back to the trigger label so categories don't share
// a cooldown slot.
async function identifySubject(
  event: { bucket: string; key: string },
  triggered: { name?: string }[],
): Promise<string> {
  const hasPerson = triggered.some((l) => l.name === "Person");
  if (!hasPerson) {
    const first = triggered.find((l) => l.name)?.name ?? "unknown";
    return `label:${first}`;
  }

  const collectionId = process.env.FACE_COLLECTION_ID!;
  const image = { S3Object: { Bucket: event.bucket, Name: event.key } };

  try {
    const search = await rekog.send(
      new SearchFacesByImageCommand({
        CollectionId: collectionId,
        Image: image,
        FaceMatchThreshold: 80,
        MaxFaces: 1,
      }),
    );
    const match = search.FaceMatches?.[0]?.Face?.FaceId;
    if (match) return match;

    const indexed = await rekog.send(
      new IndexFacesCommand({
        CollectionId: collectionId,
        Image: image,
        MaxFaces: 1,
        QualityFilter: "AUTO",
        DetectionAttributes: [],
      }),
    );
    return indexed.FaceRecords?.[0]?.Face?.FaceId ?? "face:unknown";
  } catch (err: unknown) {
    // SearchFacesByImage throws InvalidParameterException when no face is found.
    console.log("face identify failed, falling back to unknown:", err);
    return "face:unknown";
  }
}
