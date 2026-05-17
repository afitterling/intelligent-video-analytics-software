import {
  KinesisVideoClient,
  CreateStreamCommand,
  DeleteStreamCommand,
  DescribeStreamCommand,
  GetDataEndpointCommand,
  GetHLSStreamingSessionURLCommand,
} from "@aws-sdk/client-kinesis-video";
import { KinesisVideoArchivedMediaClient } from "@aws-sdk/client-kinesis-video-archived-media";
import { STSClient, GetFederationTokenCommand } from "@aws-sdk/client-sts";

const kvs = new KinesisVideoClient({});
const sts = new STSClient({});

export const streamNameFor = (userId: string, deviceId: string) => {
  // KVS allows [a-zA-Z0-9_.-], <= 256 chars. userId is a Cognito UUID.
  return `${process.env.KVS_STREAM_PREFIX}${userId}_${deviceId}`;
};

export const ensureStream = async (name: string) => {
  try {
    const desc = await kvs.send(new DescribeStreamCommand({ StreamName: name }));
    return desc.StreamInfo!;
  } catch (err: unknown) {
    if (err && typeof err === "object" && "name" in err && err.name === "ResourceNotFoundException") {
      await kvs.send(
        new CreateStreamCommand({
          StreamName: name,
          DataRetentionInHours: 24,
          MediaType: "video/h264",
        }),
      );
      const desc = await kvs.send(new DescribeStreamCommand({ StreamName: name }));
      return desc.StreamInfo!;
    }
    throw err;
  }
};

export const deleteStream = async (name: string) => {
  try {
    const desc = await kvs.send(new DescribeStreamCommand({ StreamName: name }));
    if (desc.StreamInfo?.StreamARN) {
      await kvs.send(new DeleteStreamCommand({ StreamARN: desc.StreamInfo.StreamARN }));
    }
  } catch (err: unknown) {
    if (!(err && typeof err === "object" && "name" in err && err.name === "ResourceNotFoundException")) {
      throw err;
    }
  }
};

export const getPutMediaEndpoint = async (streamName: string) => {
  const r = await kvs.send(new GetDataEndpointCommand({ StreamName: streamName, APIName: "PUT_MEDIA" }));
  return r.DataEndpoint!;
};

export const issueProducerCredentials = async (
  streamArn: string,
  sessionName: string,
) => {
  const policy = JSON.stringify({
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
  const r = await sts.send(
    new GetFederationTokenCommand({
      Name: sessionName.slice(0, 32).replace(/[^A-Za-z0-9+=,.@-]/g, "_"),
      DurationSeconds: 3600,
      Policy: policy,
    }),
  );
  return r.Credentials!;
};

export const hlsUrlFor = async (streamName: string, expiresSeconds = 300) => {
  // GetHLSStreamingSessionURL is served via the archived-media endpoint resolved per stream.
  const ep = await kvs.send(
    new GetDataEndpointCommand({ StreamName: streamName, APIName: "GET_HLS_STREAMING_SESSION_URL" }),
  );
  const archived = new KinesisVideoArchivedMediaClient({ endpoint: ep.DataEndpoint });
  // The archived client speaks the same HLS command shape.
  const r = await archived.send(
    new GetHLSStreamingSessionURLCommand({
      StreamName: streamName,
      PlaybackMode: "LIVE",
      Expires: expiresSeconds,
    }) as never,
  );
  return (r as unknown as { HLSStreamingSessionURL: string }).HLSStreamingSessionURL;
};
