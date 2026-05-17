import { randomBytes, createHash } from "node:crypto";

export const newRegistrationToken = () => {
  // 192 bits of entropy, base64url. Short enough to paste, long enough to be safe.
  const raw = randomBytes(24).toString("base64url");
  return { token: raw, hash: hashToken(raw) };
};

export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
