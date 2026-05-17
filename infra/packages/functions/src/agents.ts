import { Resource } from "sst";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "./shared/ddb.js";
import {
  getPutMediaEndpoint,
  issueProducerCredentials,
} from "./shared/kvs.js";
import { hashToken } from "./shared/tokens.js";
import { ok, fail, parseJson, type Handler } from "./shared/http.js";

/**
 * /agents/exchange — first call by the macOS/agent program at install time.
 *   Input:  { registrationToken }
 *   Output: { streamName, dataEndpoint, region, credentials, refreshToken }
 *
 * The refreshToken is the SHA-256 of the registration token; subsequent refreshes
 * use /agents/refresh which validates against the same hash so the device can
 * keep streaming without re-pasting a token.
 */
export const exchange: Handler = async (event) => {
  const { registrationToken } = parseJson<{ registrationToken?: string }>(event);
  if (!registrationToken) return fail("registrationToken required");

  const hash = hashToken(registrationToken);
  const tok = await ddb.send(
    new GetCommand({ TableName: Resource.RegistrationTokens.name, Key: { tokenHash: hash } }),
  );
  if (!tok.Item) return fail("invalid or expired token", 401);
  if (tok.Item.expiresAt && tok.Item.expiresAt < Math.floor(Date.now() / 1000)) {
    return fail("token expired", 401);
  }

  const dev = await ddb.send(
    new GetCommand({
      TableName: Resource.Devices.name,
      Key: { userId: tok.Item.userId, deviceId: tok.Item.deviceId },
    }),
  );
  if (!dev.Item) return fail("device missing", 410);

  await ddb.send(
    new UpdateCommand({
      TableName: Resource.Devices.name,
      Key: { userId: tok.Item.userId, deviceId: tok.Item.deviceId },
      UpdateExpression: "SET #s = :s, lastSeenAt = :t",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":s": "active", ":t": new Date().toISOString() },
    }),
  );

  const [endpoint, creds] = await Promise.all([
    getPutMediaEndpoint(dev.Item.streamName),
    issueProducerCredentials(dev.Item.streamArn, `agent-${dev.Item.deviceId}`),
  ]);

  return ok({
    streamName: dev.Item.streamName,
    streamArn: dev.Item.streamArn,
    dataEndpoint: endpoint,
    region: process.env.AWS_REGION,
    deviceId: dev.Item.deviceId,
    refreshToken: hash, // device stores this and re-uses /agents/refresh
    credentials: {
      accessKeyId: creds.AccessKeyId,
      secretAccessKey: creds.SecretAccessKey,
      sessionToken: creds.SessionToken,
      expiration: creds.Expiration,
    },
  });
};

export const refresh: Handler = async (event) => {
  const { refreshToken } = parseJson<{ refreshToken?: string }>(event);
  if (!refreshToken) return fail("refreshToken required");

  const tok = await ddb.send(
    new GetCommand({ TableName: Resource.RegistrationTokens.name, Key: { tokenHash: refreshToken } }),
  );
  if (!tok.Item) return fail("invalid refresh token", 401);

  const dev = await ddb.send(
    new GetCommand({
      TableName: Resource.Devices.name,
      Key: { userId: tok.Item.userId, deviceId: tok.Item.deviceId },
    }),
  );
  if (!dev.Item) return fail("device missing", 410);

  const [endpoint, creds] = await Promise.all([
    getPutMediaEndpoint(dev.Item.streamName),
    issueProducerCredentials(dev.Item.streamArn, `agent-${dev.Item.deviceId}`),
  ]);
  return ok({
    streamName: dev.Item.streamName,
    streamArn: dev.Item.streamArn,
    dataEndpoint: endpoint,
    region: process.env.AWS_REGION,
    deviceId: dev.Item.deviceId,
    credentials: {
      accessKeyId: creds.AccessKeyId,
      secretAccessKey: creds.SecretAccessKey,
      sessionToken: creds.SessionToken,
      expiration: creds.Expiration,
    },
  });
};
