import { Resource } from "sst";
import { randomUUID } from "node:crypto";
import {
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddb } from "./shared/ddb.js";
import { ok, fail, parseJson, type Handler } from "./shared/http.js";
import { requireUser, HttpError } from "./shared/auth.js";

export type RuleAction =
  | { type: "email"; to: string }
  | { type: "webhook"; url: string }
  | { type: "log" };

export interface Rule {
  userId: string;
  ruleId: string;
  deviceId: string; // "*" to apply to all of the user's devices
  name: string;
  detect: string[]; // Rekognition labels (e.g. "Person", "Vehicle")
  minConfidence: number;
  action: RuleAction;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

const withAuth =
  (h: (event: Parameters<Handler>[0], user: { userId: string }) => ReturnType<Handler>): Handler =>
  async (event) => {
    try {
      const user = await requireUser(event);
      return await h(event, user);
    } catch (err) {
      if (err instanceof HttpError) return fail(err.message, err.status);
      console.error(err);
      return fail("internal error", 500);
    }
  };

export const list = withAuth(async (_event, user) => {
  const r = await ddb.send(
    new QueryCommand({
      TableName: Resource.Rules.name,
      KeyConditionExpression: "userId = :u",
      ExpressionAttributeValues: { ":u": user.userId },
    }),
  );
  return ok({ rules: r.Items ?? [] });
});

export const create = withAuth(async (event, user) => {
  const body = parseJson<Partial<Rule>>(event);
  if (!body.name || !body.detect?.length || !body.action) {
    return fail("name, detect, action required");
  }
  const ruleId = randomUUID();
  const now = new Date().toISOString();
  const rule: Rule = {
    userId: user.userId,
    ruleId,
    deviceId: body.deviceId ?? "*",
    name: body.name,
    detect: body.detect,
    minConfidence: body.minConfidence ?? 75,
    action: body.action,
    enabled: body.enabled ?? true,
    createdAt: now,
    updatedAt: now,
  };
  await ddb.send(new PutCommand({ TableName: Resource.Rules.name, Item: rule }));
  return ok({ rule }, 201);
});

export const update = withAuth(async (event, user) => {
  const ruleId = event.pathParameters?.id;
  if (!ruleId) return fail("rule id required");
  const body = parseJson<Partial<Rule>>(event);

  const exist = await ddb.send(
    new GetCommand({
      TableName: Resource.Rules.name,
      Key: { userId: user.userId, ruleId },
    }),
  );
  if (!exist.Item) return fail("not found", 404);

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const k of ["name", "deviceId", "detect", "minConfidence", "action", "enabled"] as const) {
    if (body[k] !== undefined) updates[k] = body[k];
  }
  const setExpr = Object.keys(updates).map((k, i) => `#k${i} = :v${i}`).join(", ");
  const ExpressionAttributeNames = Object.fromEntries(
    Object.keys(updates).map((k, i) => [`#k${i}`, k]),
  );
  const ExpressionAttributeValues = Object.fromEntries(
    Object.values(updates).map((v, i) => [`:v${i}`, v]),
  );
  const r = await ddb.send(
    new UpdateCommand({
      TableName: Resource.Rules.name,
      Key: { userId: user.userId, ruleId },
      UpdateExpression: `SET ${setExpr}`,
      ExpressionAttributeNames,
      ExpressionAttributeValues,
      ReturnValues: "ALL_NEW",
    }),
  );
  return ok({ rule: r.Attributes });
});

export const remove = withAuth(async (event, user) => {
  const ruleId = event.pathParameters?.id;
  if (!ruleId) return fail("rule id required");
  await ddb.send(
    new DeleteCommand({
      TableName: Resource.Rules.name,
      Key: { userId: user.userId, ruleId },
    }),
  );
  return ok({ deleted: true });
});
