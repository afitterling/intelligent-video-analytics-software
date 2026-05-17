/// <reference path="./.sst/platform/config.d.ts" />

/**
 * Intelligent Video Analytics — multi-user.
 *
 *   Web/Mobile ─▶ Cognito (auth) ─▶ API (Remix or REST) ─▶ Devices CRUD
 *     ── per-device Kinesis Video Stream provisioned on demand ──
 *   macOS agent ─▶ /agents/exchange (registration token) ─▶ KVS PutMedia
 *   EventBridge schedule ─▶ Detector Lambda ─▶ Rekognition ─▶ SES alert
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
    // -------------------------------------------------------------------
    //  Auth — Cognito user pool
    // -------------------------------------------------------------------
    const userPool = new sst.aws.CognitoUserPool("UserPool", {
      usernames: ["email"],
      transform: {
        userPool: {
          autoVerifiedAttributes: ["email"],
          accountRecoverySetting: {
            recoveryMechanisms: [
              { name: "verified_email", priority: 1 },
            ],
          },
          passwordPolicy: {
            minimumLength: 10,
            requireLowercase: true,
            requireNumbers: true,
            requireSymbols: false,
            requireUppercase: true,
          },
        },
      },
    });

    const userPoolClient = userPool.addClient("WebClient", {
      transform: {
        client: {
          explicitAuthFlows: [
            "ALLOW_USER_PASSWORD_AUTH",
            "ALLOW_REFRESH_TOKEN_AUTH",
            "ALLOW_USER_SRP_AUTH",
          ],
          preventUserExistenceErrors: "ENABLED",
        },
      },
    });

    // -------------------------------------------------------------------
    //  Storage
    // -------------------------------------------------------------------
    const mediaBucket = new sst.aws.Bucket("MediaBucket");

    new aws.s3.BucketLifecycleConfigurationV2("MediaBucketLifecycle", {
      bucket: mediaBucket.name,
      rules: [
        {
          id: "expire-frames",
          status: "Enabled",
          filter: { prefix: "frames/" },
          expiration: { days: 14 },
        },
      ],
    });

    // Per-user device records
    const devicesTable = new sst.aws.Dynamo("Devices", {
      fields: { userId: "string", deviceId: "string" },
      primaryIndex: { hashKey: "userId", rangeKey: "deviceId" },
    });

    // Single-shot registration tokens (hashed) issued at device-create time
    const tokensTable = new sst.aws.Dynamo("RegistrationTokens", {
      fields: { tokenHash: "string" },
      primaryIndex: { hashKey: "tokenHash" },
      ttl: "expiresAt",
    });

    // Detection rules per user/device
    const rulesTable = new sst.aws.Dynamo("Rules", {
      fields: { userId: "string", ruleId: "string", deviceId: "string" },
      primaryIndex: { hashKey: "userId", rangeKey: "ruleId" },
      globalIndexes: {
        ByDevice: {
          hashKey: "deviceId",
          rangeKey: "ruleId",
        },
      },
    });

    const detectionsTable = new sst.aws.Dynamo("Detections", {
      fields: { deviceId: "string", timestamp: "string" },
      primaryIndex: { hashKey: "deviceId", rangeKey: "timestamp" },
      ttl: "expiresAt",
    });

    const alertCooldown = new sst.aws.Dynamo("AlertCooldown", {
      fields: { deviceId: "string" },
      primaryIndex: { hashKey: "deviceId" },
      ttl: "expiresAt",
    });

    const faceCollection = new aws.rekognition.Collection("FaceCollection", {
      collectionId: `${$app.name}-${$app.stage}-faces`,
    });

    const senderEmail = "info@sp33c.tech";
    new aws.sesv2.EmailIdentity("AlertSender", { emailIdentity: senderEmail });

    // Session secret for Remix cookie encryption
    const sessionSecret = new sst.Secret("SessionSecret", "dev-only-change-me");

    // -------------------------------------------------------------------
    //  Lambda handlers
    // -------------------------------------------------------------------
    const commonLink = [
      userPool,
      userPoolClient,
      devicesTable,
      tokensTable,
      rulesTable,
      detectionsTable,
      alertCooldown,
      mediaBucket,
      sessionSecret,
    ];

    const commonEnv = {
      FACE_COLLECTION_ID: faceCollection.collectionId,
      ALERT_SENDER: senderEmail,
      ALERT_COOLDOWN_SECONDS: "3600",
      DETECTIONS_RETENTION_DAYS: "90",
      KVS_STREAM_PREFIX: `${$app.name}-${$app.stage}-`,
    };

    // Permissions that any function may need to manage streams it owns.
    const kvsAdminPermission = {
      actions: [
        "kinesisvideo:CreateStream",
        "kinesisvideo:DeleteStream",
        "kinesisvideo:DescribeStream",
        "kinesisvideo:ListStreams",
        "kinesisvideo:GetDataEndpoint",
        "kinesisvideo:GetMedia",
        "kinesisvideo:GetImages",
        "kinesisvideo:GetHLSStreamingSessionURL",
        "kinesisvideo:PutMedia",
        "kinesisvideo:UpdateDataRetention",
        "kinesisvideo:TagStream",
      ],
      resources: ["*"],
    };

    const detector = new sst.aws.Function("Detector", {
      handler: "packages/functions/src/detector.handler",
      link: commonLink,
      timeout: "5 minutes",
      memory: "1024 MB",
      environment: commonEnv,
      permissions: [
        kvsAdminPermission,
        {
          actions: [
            "rekognition:DetectLabels",
            "rekognition:DetectFaces",
            "rekognition:SearchFacesByImage",
            "rekognition:IndexFacesCommand",
            "rekognition:IndexFaces",
          ],
          resources: ["*"],
        },
        { actions: ["ses:SendEmail", "ses:SendRawEmail"], resources: ["*"] },
      ],
    });

    // -------------------------------------------------------------------
    //  HTTP API
    // -------------------------------------------------------------------
    const api = new sst.aws.ApiGatewayV2("Api", {
      cors: {
        allowOrigins: ["*"],
        allowHeaders: ["content-type", "authorization"],
        allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      },
    });

    const fn = (handler: string, extra: Record<string, unknown> = {}) => ({
      handler,
      link: commonLink,
      environment: commonEnv,
      permissions: [
        kvsAdminPermission,
        { actions: ["sts:GetFederationToken"], resources: ["*"] },
        { actions: ["ses:SendEmail", "ses:SendRawEmail"], resources: ["*"] },
      ],
      ...extra,
    });

    // ---- Auth (server-side proxy for Cognito so clients only see one API) ----
    api.route("POST /auth/signup",          fn("packages/functions/src/auth.signup"));
    api.route("POST /auth/confirm",         fn("packages/functions/src/auth.confirm"));
    api.route("POST /auth/login",           fn("packages/functions/src/auth.login"));
    api.route("POST /auth/refresh",         fn("packages/functions/src/auth.refresh"));
    api.route("POST /auth/forgot",          fn("packages/functions/src/auth.forgot"));
    api.route("POST /auth/reset",           fn("packages/functions/src/auth.reset"));
    api.route("POST /auth/resend",          fn("packages/functions/src/auth.resend"));

    // ---- Devices (authenticated) ----
    api.route("GET /devices",               fn("packages/functions/src/devices.list"));
    api.route("POST /devices",              fn("packages/functions/src/devices.create"));
    api.route("GET /devices/{id}",          fn("packages/functions/src/devices.get"));
    api.route("PUT /devices/{id}",          fn("packages/functions/src/devices.update"));
    api.route("DELETE /devices/{id}",       fn("packages/functions/src/devices.remove"));
    api.route("POST /devices/{id}/rotate-token", fn("packages/functions/src/devices.rotateToken"));
    api.route("GET /devices/{id}/viewer-url",    fn("packages/functions/src/devices.viewerUrl"));

    // ---- Rules (authenticated) ----
    api.route("GET /rules",                 fn("packages/functions/src/rules.list"));
    api.route("POST /rules",                fn("packages/functions/src/rules.create"));
    api.route("PUT /rules/{id}",            fn("packages/functions/src/rules.update"));
    api.route("DELETE /rules/{id}",         fn("packages/functions/src/rules.remove"));

    // ---- Detections (authenticated) ----
    api.route("GET /detections",            fn("packages/functions/src/detections.list"));

    // ---- macOS / mobile agent: redeem registration token for KVS creds ----
    api.route("POST /agents/exchange",      fn("packages/functions/src/agents.exchange"));
    api.route("POST /agents/refresh",       fn("packages/functions/src/agents.refresh"));

    // -------------------------------------------------------------------
    //  Scheduled detection sweep (every minute)
    // -------------------------------------------------------------------
    new sst.aws.Cron("DetectorSweep", {
      schedule: "rate(1 minute)",
      job: detector.arn,
    });

    return {
      api: api.url,
      userPoolId: userPool.id,
      userPoolClientId: userPoolClient.id,
      region: aws.getRegionOutput().name,
      bucket: mediaBucket.name,
      faceCollection: faceCollection.collectionId,
    };
  },
});
