import { Resource } from "sst";
import { STSClient, GetFederationTokenCommand } from "@aws-sdk/client-sts";
import {
  KinesisVideoClient,
  GetDataEndpointCommand,
} from "@aws-sdk/client-kinesis-video";

const sts = new STSClient({});
const kvs = new KinesisVideoClient({});

export const handler = async (event: {
  body?: string;
  queryStringParameters?: Record<string, string | undefined>;
}) => {
  const cameraId =
    event.queryStringParameters?.cameraId ??
    (() => {
      try {
        return JSON.parse(event.body ?? "{}").cameraId;
      } catch {
        return undefined;
      }
    })();

  if (!cameraId || !/^[A-Za-z0-9._-]{1,64}$/.test(cameraId)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "valid cameraId required" }),
    };
  }

  const streamArn = Resource.VideoIngest.arn;
  const streamName = Resource.VideoIngest.name;

  // Session policy: PutMedia + the discovery calls a producer needs.
  const sessionPolicy = JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: [
          "kinesisvideo:DescribeStream",
          "kinesisvideo:GetDataEndpoint",
          "kinesisvideo:PutMedia",
        ],
        Resource: streamArn,
      },
    ],
  });

  const [token, endpoint] = await Promise.all([
    sts.send(
      new GetFederationTokenCommand({
        Name: `cam-${cameraId}`.slice(0, 32),
        DurationSeconds: 3600,
        Policy: sessionPolicy,
      }),
    ),
    kvs.send(
      new GetDataEndpointCommand({
        StreamName: streamName,
        APIName: "PUT_MEDIA",
      }),
    ),
  ]);

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      streamName,
      streamArn,
      dataEndpoint: endpoint.DataEndpoint,
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: token.Credentials?.AccessKeyId,
        secretAccessKey: token.Credentials?.SecretAccessKey,
        sessionToken: token.Credentials?.SessionToken,
        expiration: token.Credentials?.Expiration,
      },
    }),
  };
};
