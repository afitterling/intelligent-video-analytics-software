import { Resource } from "sst";
import { randomUUID } from "node:crypto";
import {
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddb } from "./shared/ddb.js";
import {
  deleteStream,
  ensureStream,
  hlsUrlFor,
  streamNameFor,
} from "./shared/kvs.js";
import { hashToken, newRegistrationToken } from "./shared/tokens.js";
import { ok, fail, parseJson, type Handler } from "./shared/http.js";
import { requireUser, HttpError } from "./shared/auth.js";

const withAuth =
  (handler: (event: Parameters<Handler>[0], user: Awaited<ReturnType<typeof requireUser>>) => ReturnType<Handler>): Handler =>
  async (event) => {
    try {
      const user = await requireUser(event);
      return await handler(event, user);
    } catch (err) {
      if (err instanceof HttpError) return fail(err.message, err.status);
      console.error(err);
      return fail("internal error", 500);
    }
  };

export const list = withAuth(async (_event, user) => {
  const r = await ddb.send(
    new QueryCommand({
      TableName: Resource.Devices.name,
      KeyConditionExpression: "userId = :u",
      ExpressionAttributeValues: { ":u": user.userId },
    }),
  );
  return ok({ devices: r.Items ?? [] });
});

export const get = withAuth(async (event, user) => {
  const id = event.pathParameters?.id;
  if (!id) return fail("device id required");
  const r = await ddb.send(
    new GetCommand({
      TableName: Resource.Devices.name,
      Key: { userId: user.userId, deviceId: id },
    }),
  );
  if (!r.Item) return fail("not found", 404);
  return ok({ device: r.Item });
});

export const create = withAuth(async (event, user) => {
  const { name, location } = parseJson<{ name?: string; location?: string }>(event);
  if (!name) return fail("name required");

  const deviceId = randomUUID();
  const streamName = streamNameFor(user.userId, deviceId);
  const stream = await ensureStream(streamName);

  const { token, hash } = newRegistrationToken();
  const now = new Date().toISOString();
  const tokenTtl = Math.floor(Date.now() / 1000) + 7 * 24 * 3600; // 7 days

  const device = {
    userId: user.userId,
    deviceId,
    name,
    location: location ?? "",
    streamName,
    streamArn: stream.StreamARN!,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };

  await Promise.all([
    ddb.send(new PutCommand({ TableName: Resource.Devices.name, Item: device })),
    ddb.send(
      new PutCommand({
        TableName: Resource.RegistrationTokens.name,
        Item: {
          tokenHash: hash,
          userId: user.userId,
          deviceId,
          expiresAt: tokenTtl,
        },
      }),
    ),
  ]);

  // Plaintext token is returned ONCE, here, for the user to paste into the agent.
  return ok({ device, registrationToken: token, registrationTokenExpiresAt: tokenTtl }, 201);
});

export const update = withAuth(async (event, user) => {
  const id = event.pathParameters?.id;
  if (!id) return fail("device id required");
  const { name, location } = parseJson<{ name?: string; location?: string }>(event);

  const setExpr: string[] = ["updatedAt = :u"];
  const values: Record<string, unknown> = { ":u": new Date().toISOString() };
  if (name !== undefined) {
    setExpr.push("#n = :n");
    values[":n"] = name;
  }
  if (location !== undefined) {
    setExpr.push("#l = :l");
    values[":l"] = location;
  }
  try {
    const r = await ddb.send(
      new UpdateCommand({
        TableName: Resource.Devices.name,
        Key: { userId: user.userId, deviceId: id },
        UpdateExpression: `SET ${setExpr.join(", ")}`,
        ExpressionAttributeNames: { "#n": "name", "#l": "location" },
        ExpressionAttributeValues: values,
        ConditionExpression: "attribute_exists(deviceId)",
        ReturnValues: "ALL_NEW",
      }),
    );
    return ok({ device: r.Attributes });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "name" in err && err.name === "ConditionalCheckFailedException") {
      return fail("not found", 404);
    }
    throw err;
  }
});

export const remove = withAuth(async (event, user) => {
  const id = event.pathParameters?.id;
  if (!id) return fail("device id required");
  const r = await ddb.send(
    new GetCommand({
      TableName: Resource.Devices.name,
      Key: { userId: user.userId, deviceId: id },
    }),
  );
  if (!r.Item) return fail("not found", 404);

  await deleteStream(r.Item.streamName);
  await ddb.send(
    new DeleteCommand({
      TableName: Resource.Devices.name,
      Key: { userId: user.userId, deviceId: id },
    }),
  );
  return ok({ deleted: true });
});

export const rotateToken = withAuth(async (event, user) => {
  const id = event.pathParameters?.id;
  if (!id) return fail("device id required");

  const dev = await ddb.send(
    new GetCommand({
      TableName: Resource.Devices.name,
      Key: { userId: user.userId, deviceId: id },
    }),
  );
  if (!dev.Item) return fail("not found", 404);

  const { token, hash } = newRegistrationToken();
  const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
  await ddb.send(
    new PutCommand({
      TableName: Resource.RegistrationTokens.name,
      Item: { tokenHash: hash, userId: user.userId, deviceId: id, expiresAt },
    }),
  );
  return ok({ registrationToken: token, registrationTokenExpiresAt: expiresAt });
});

export const viewerUrl = withAuth(async (event, user) => {
  const id = event.pathParameters?.id;
  if (!id) return fail("device id required");
  const dev = await ddb.send(
    new GetCommand({
      TableName: Resource.Devices.name,
      Key: { userId: user.userId, deviceId: id },
    }),
  );
  if (!dev.Item) return fail("not found", 404);
  try {
    const url = await hlsUrlFor(dev.Item.streamName);
    return ok({ url });
  } catch (err) {
    console.warn("hls url failed", err);
    return fail("stream not available yet", 503);
  }
});

// Re-export so the hash helper is recognised at compile time.
export const _hash = hashToken;
