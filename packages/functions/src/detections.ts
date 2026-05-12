import { Resource } from "sst";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (event: {
  queryStringParameters?: Record<string, string | undefined>;
}) => {
  const cameraId = event.queryStringParameters?.cameraId;
  const limit = Number(event.queryStringParameters?.limit ?? 50);

  if (!cameraId) {
    return { statusCode: 400, body: JSON.stringify({ error: "cameraId required" }) };
  }

  const result = await ddb.send(
    new QueryCommand({
      TableName: Resource.Detections.name,
      KeyConditionExpression: "cameraId = :cid",
      ExpressionAttributeValues: { ":cid": cameraId },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items: result.Items ?? [] }),
  };
};
