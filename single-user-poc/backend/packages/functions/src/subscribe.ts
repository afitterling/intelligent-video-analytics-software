import { Resource } from "sst";
import { SNSClient, SubscribeCommand } from "@aws-sdk/client-sns";

const sns = new SNSClient({});

export const handler = async (event: { body: string }) => {
  const { protocol, endpoint } = JSON.parse(event.body ?? "{}") as {
    protocol: "email" | "sms" | "https";
    endpoint: string;
  };

  if (!protocol || !endpoint) {
    return { statusCode: 400, body: JSON.stringify({ error: "protocol and endpoint required" }) };
  }

  const result = await sns.send(
    new SubscribeCommand({
      TopicArn: Resource.Alerts.arn,
      Protocol: protocol,
      Endpoint: endpoint,
      ReturnSubscriptionArn: true,
    }),
  );

  return {
    statusCode: 200,
    body: JSON.stringify({ subscriptionArn: result.SubscriptionArn }),
  };
};
