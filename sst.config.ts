/// <reference path="./.sst/platform/config.d.ts" />

/**
 * Intelligent Video Analytics (IVA)
 *
 * Pipeline:
 *   Camera ─▶ Ingest (Kinesis Video Streams)
 *           ─▶ Inference (Rekognition / custom model on Lambda or ECS)
 *           ─▶ Event bus (EventBridge)
 *           ─▶ Notifier (SNS / WebSocket API)
 */
export default $config({
  app(input) {
    return {
      name: "iva",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
    };
  },
  async run() {
    // --- Storage for clips, thumbnails, and detection artifacts ---
    const mediaBucket = new sst.aws.Bucket("MediaBucket");

    new aws.s3.BucketLifecycleConfigurationV2("MediaBucketLifecycle", {
      bucket: mediaBucket.name,
      rules: [
        {
          id: "expire-incoming",
          status: "Enabled",
          filter: { prefix: "incoming/" },
          expiration: { days: 14 },
          abortIncompleteMultipartUpload: { daysAfterInitiation: 1 },
        },
      ],
    });

    // --- Detection event log (DynamoDB) ---
    const detectionsTable = new sst.aws.Dynamo("Detections", {
      fields: {
        cameraId: "string",
        timestamp: "string",
      },
      primaryIndex: { hashKey: "cameraId", rangeKey: "timestamp" },
      stream: "new-and-old-images",
      ttl: "expiresAt",
    });

    // --- User notification topic ---
    const alertsTopic = new sst.aws.SnsTopic("Alerts");

    // --- Per-camera email cooldown (one alert mail per hour per camera) ---
    const alertCooldown = new sst.aws.Dynamo("AlertCooldown", {
      fields: { cameraId: "string" },
      primaryIndex: { hashKey: "cameraId" },
      ttl: "expiresAt",
    });

    // --- Rekognition face collection (so we can detect a *different* person) ---
    const faceCollection = new aws.rekognition.Collection("FaceCollection", {
      collectionId: `${$app.name}-${$app.stage}-faces`,
    });

    // --- Email alert channel (SES) ---
    // AWS sends a verification email to this address on first deploy; click the link.
    const senderEmail = "info@sp33c.tech";
    const senderIdentity = new aws.sesv2.EmailIdentity("AlertSender", {
      emailIdentity: senderEmail,
    });
    // Comma-separated recipient list; set with `sst secret set AlertRecipients ...`.
    const alertRecipients = new sst.Secret("AlertRecipients", senderEmail);

    // --- Video ingest stream ---
    // KVS isn't a first-class SST component; use Pulumi AWS classic and link it.
    const videoStream = new aws.kinesis.VideoStream("VideoIngest", {
      dataRetentionInHours: 24,
      mediaType: "video/h264",
    });

    sst.Linkable.wrap(aws.kinesis.VideoStream, (s) => ({
      properties: { name: s.name, arn: s.arn },
      include: [
        sst.aws.permission({
          actions: [
            "kinesisvideo:DescribeStream",
            "kinesisvideo:GetDataEndpoint",
            "kinesisvideo:GetMedia",
            "kinesisvideo:GetMediaForFragmentList",
            "kinesisvideo:ListFragments",
            "kinesisvideo:PutMedia",
          ],
          resources: [s.arn],
        }),
      ],
    }));

    // --- Detection worker (runs inference on incoming frames/segments) ---
    const detector = new sst.aws.Function("Detector", {
      handler: "packages/functions/src/detector.handler",
      link: [
        mediaBucket,
        detectionsTable,
        alertsTopic,
        videoStream,
        alertRecipients,
        alertCooldown,
      ],
      timeout: "5 minutes",
      memory: "2048 MB",
      environment: {
        ALERT_SENDER: senderEmail,
        ALERT_COOLDOWN_SECONDS: "3600",
        DETECTIONS_RETENTION_DAYS: "90",
        FACE_COLLECTION_ID: faceCollection.collectionId,
      },
      permissions: [
        {
          actions: [
            "rekognition:DetectLabels",
            "rekognition:DetectFaces",
            "rekognition:SearchFacesByImage",
            "rekognition:IndexFaces",
          ],
          resources: ["*"],
        },
        {
          actions: ["ses:SendEmail", "ses:SendRawEmail"],
          resources: ["*"],
        },
      ],
    });

    // --- Public API for cameras to push frames / clients to query events ---
    const api = new sst.aws.ApiGatewayV2("Api");
    api.route("POST /ingest", {
      handler: "packages/functions/src/ingest.handler",
      link: [mediaBucket, detector],
    });
    api.route("GET /detections", {
      handler: "packages/functions/src/detections.handler",
      link: [detectionsTable],
    });
    api.route("POST /subscribe", {
      handler: "packages/functions/src/subscribe.handler",
      link: [alertsTopic],
    });
    api.route("POST /kvs-credentials", {
      handler: "packages/functions/src/kvsCredentials.handler",
      link: [videoStream],
      permissions: [{ actions: ["sts:GetFederationToken"], resources: ["*"] }],
    });

    return {
      api: api.url,
      bucket: mediaBucket.name,
      table: detectionsTable.name,
      alertsTopic: alertsTopic.arn,
      videoStream: videoStream.name,
      videoStreamArn: videoStream.arn,
      alertSender: senderIdentity.emailIdentity,
    };
  },
});
