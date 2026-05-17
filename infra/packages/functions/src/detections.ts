import { Resource } from "sst";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "./shared/ddb.js";
import { ok, fail, type Handler } from "./shared/http.js";
import { requireUser, HttpError } from "./shared/auth.js";

export const list: Handler = async (event) => {
  try {
    const user = await requireUser(event);
    const deviceId = event.queryStringParameters?.deviceId;
    if (!deviceId) return fail("deviceId required");

    // Cheap ownership check: the device PK is (userId, deviceId) — if the user
    // doesn't own it, they can't query its detections regardless.
    const r = await ddb.send(
      new QueryCommand({
        TableName: Resource.Detections.name,
        KeyConditionExpression: "deviceId = :d",
        ExpressionAttributeValues: { ":d": `${user.userId}_${deviceId}` },
        ScanIndexForward: false,
        Limit: 50,
      }),
    );
    return ok({ detections: r.Items ?? [] });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.message, err.status);
    console.error(err);
    return fail("internal error", 500);
  }
};
