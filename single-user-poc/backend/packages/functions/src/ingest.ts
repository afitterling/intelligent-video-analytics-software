import { Resource } from "sst";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const s3 = new S3Client({});
const lambda = new LambdaClient({});

export const handler = async (event: {
  body: string;
  isBase64Encoded?: boolean;
  queryStringParameters?: Record<string, string | undefined>;
}) => {
  const cameraId = event.queryStringParameters?.cameraId ?? "unknown";
  const key = `incoming/${cameraId}/${Date.now()}.jpg`;

  const body = event.isBase64Encoded
    ? Buffer.from(event.body, "base64")
    : Buffer.from(event.body);

  await s3.send(
    new PutObjectCommand({
      Bucket: Resource.MediaBucket.name,
      Key: key,
      Body: body,
      ContentType: "image/jpeg",
    }),
  );

  await lambda.send(
    new InvokeCommand({
      FunctionName: Resource.Detector.name,
      InvocationType: "Event",
      Payload: Buffer.from(JSON.stringify({ bucket: Resource.MediaBucket.name, key, cameraId })),
    }),
  );

  return { statusCode: 202, body: JSON.stringify({ accepted: true, key }) };
};
