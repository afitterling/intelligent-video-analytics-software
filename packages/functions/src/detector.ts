import { Resource } from "sst";
import {
  RekognitionClient,
  DetectLabelsCommand,
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

  await ddb.send(
    new PutCommand({
      TableName: Resource.Detections.name,
      Item: {
        cameraId: event.cameraId,
        timestamp,
        imageKey: event.key,
        labels,
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
