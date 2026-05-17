import { Resource } from "sst";
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  ResendConfirmationCodeCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { ok, fail, parseJson, type Handler } from "./shared/http.js";

const cognito = new CognitoIdentityProviderClient({});

const clientId = () => Resource.WebClient.id;

const safeError = (err: unknown) => {
  if (err && typeof err === "object" && "name" in err) {
    const e = err as { name: string; message?: string };
    return { code: e.name, message: e.message ?? e.name };
  }
  return { code: "UnknownError", message: String(err) };
};

export const signup: Handler = async (event) => {
  const { email, password } = parseJson<{ email?: string; password?: string }>(event);
  if (!email || !password) return fail("email and password required");
  try {
    const r = await cognito.send(
      new SignUpCommand({
        ClientId: clientId(),
        Username: email,
        Password: password,
        UserAttributes: [{ Name: "email", Value: email }],
      }),
    );
    return ok({ userSub: r.UserSub, codeDelivery: r.CodeDeliveryDetails });
  } catch (err) {
    return fail("signup failed", 400, safeError(err));
  }
};

export const confirm: Handler = async (event) => {
  const { email, code } = parseJson<{ email?: string; code?: string }>(event);
  if (!email || !code) return fail("email and code required");
  try {
    await cognito.send(
      new ConfirmSignUpCommand({
        ClientId: clientId(),
        Username: email,
        ConfirmationCode: code,
      }),
    );
    return ok({ confirmed: true });
  } catch (err) {
    return fail("confirm failed", 400, safeError(err));
  }
};

export const resend: Handler = async (event) => {
  const { email } = parseJson<{ email?: string }>(event);
  if (!email) return fail("email required");
  try {
    const r = await cognito.send(
      new ResendConfirmationCodeCommand({ ClientId: clientId(), Username: email }),
    );
    return ok({ codeDelivery: r.CodeDeliveryDetails });
  } catch (err) {
    return fail("resend failed", 400, safeError(err));
  }
};

export const login: Handler = async (event) => {
  const { email, password } = parseJson<{ email?: string; password?: string }>(event);
  if (!email || !password) return fail("email and password required");
  try {
    const r = await cognito.send(
      new InitiateAuthCommand({
        ClientId: clientId(),
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: email, PASSWORD: password },
      }),
    );
    if (!r.AuthenticationResult) return fail("auth incomplete", 401);
    return ok({
      accessToken: r.AuthenticationResult.AccessToken,
      idToken: r.AuthenticationResult.IdToken,
      refreshToken: r.AuthenticationResult.RefreshToken,
      expiresIn: r.AuthenticationResult.ExpiresIn,
    });
  } catch (err) {
    return fail("login failed", 401, safeError(err));
  }
};

export const refresh: Handler = async (event) => {
  const { refreshToken } = parseJson<{ refreshToken?: string }>(event);
  if (!refreshToken) return fail("refreshToken required");
  try {
    const r = await cognito.send(
      new InitiateAuthCommand({
        ClientId: clientId(),
        AuthFlow: "REFRESH_TOKEN_AUTH",
        AuthParameters: { REFRESH_TOKEN: refreshToken },
      }),
    );
    if (!r.AuthenticationResult) return fail("refresh failed", 401);
    return ok({
      accessToken: r.AuthenticationResult.AccessToken,
      idToken: r.AuthenticationResult.IdToken,
      expiresIn: r.AuthenticationResult.ExpiresIn,
    });
  } catch (err) {
    return fail("refresh failed", 401, safeError(err));
  }
};

export const forgot: Handler = async (event) => {
  const { email } = parseJson<{ email?: string }>(event);
  if (!email) return fail("email required");
  try {
    const r = await cognito.send(
      new ForgotPasswordCommand({ ClientId: clientId(), Username: email }),
    );
    return ok({ codeDelivery: r.CodeDeliveryDetails });
  } catch (err) {
    return fail("forgot failed", 400, safeError(err));
  }
};

export const reset: Handler = async (event) => {
  const { email, code, password } = parseJson<{ email?: string; code?: string; password?: string }>(event);
  if (!email || !code || !password) return fail("email, code, password required");
  try {
    await cognito.send(
      new ConfirmForgotPasswordCommand({
        ClientId: clientId(),
        Username: email,
        ConfirmationCode: code,
        Password: password,
      }),
    );
    return ok({ reset: true });
  } catch (err) {
    return fail("reset failed", 400, safeError(err));
  }
};
