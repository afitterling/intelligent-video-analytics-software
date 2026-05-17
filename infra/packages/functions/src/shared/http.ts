import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";

export type Handler = (
  event: APIGatewayProxyEventV2,
) => Promise<APIGatewayProxyStructuredResultV2>;

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type,authorization",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
};

export const ok = (body: unknown, status = 200): APIGatewayProxyStructuredResultV2 => ({
  statusCode: status,
  headers: { "content-type": "application/json", ...corsHeaders },
  body: JSON.stringify(body),
});

export const fail = (
  message: string,
  status = 400,
  extra: Record<string, unknown> = {},
): APIGatewayProxyStructuredResultV2 => ({
  statusCode: status,
  headers: { "content-type": "application/json", ...corsHeaders },
  body: JSON.stringify({ error: message, ...extra }),
});

export const parseJson = <T = Record<string, unknown>>(event: APIGatewayProxyEventV2): T => {
  if (!event.body) return {} as T;
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf-8")
      : event.body;
    return JSON.parse(raw);
  } catch {
    return {} as T;
  }
};
