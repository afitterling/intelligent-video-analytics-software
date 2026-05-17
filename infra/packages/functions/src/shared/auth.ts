import { Resource } from "sst";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

const issuer = () =>
  `https://cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${Resource.UserPool.id}`;

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
const getJwks = () => {
  jwks ??= createRemoteJWKSet(new URL(`${issuer()}/.well-known/jwks.json`));
  return jwks;
};

export interface AuthedUser {
  userId: string;
  email?: string;
  payload: JWTPayload;
}

export const requireUser = async (event: APIGatewayProxyEventV2): Promise<AuthedUser> => {
  const header =
    event.headers?.authorization ?? event.headers?.Authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new HttpError(401, "missing bearer token");

  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: issuer(),
    });
    if (payload.token_use !== "access" && payload.token_use !== "id") {
      throw new HttpError(401, "wrong token type");
    }
    const userId = (payload.sub as string | undefined) ?? "";
    if (!userId) throw new HttpError(401, "no sub claim");
    return { userId, email: payload.email as string | undefined, payload };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(401, "invalid token");
  }
};

export class HttpError extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
  }
}
