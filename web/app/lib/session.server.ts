import { createCookieSessionStorage, redirect } from "@remix-run/node";
import { api } from "./api.server.js";

const secret = process.env.SESSION_SECRET ?? "dev-only-secret-change-me";

// The cookie stores only what's small + durable: the refresh token and email.
// Access tokens (and the unused id token) are minted per-request via /auth/refresh.
// Cognito tokens together exceed the 4KB browser cookie limit, so we cannot
// persist them all in a cookie-backed session.
interface PersistedSession {
  refreshToken: string;
  email: string;
}

const storage = createCookieSessionStorage({
  cookie: {
    name: "iva.session",
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    httpOnly: true,
    secrets: [secret],
    maxAge: 60 * 60 * 24 * 30, // 30 days; refresh token validity caps real lifetime
  },
});

export interface SessionData {
  accessToken: string;
  refreshToken: string;
  email: string;
  expiresAt: number; // ms
}

export const getSession = (request: Request) =>
  storage.getSession(request.headers.get("Cookie"));

export const commitSession = storage.commitSession;
export const destroySession = storage.destroySession;

export async function readSession(request: Request): Promise<PersistedSession | null> {
  const s = await getSession(request);
  const data = s.get("data") as PersistedSession | undefined;
  return data ?? null;
}

export async function requireSession(request: Request): Promise<SessionData> {
  const persisted = await readSession(request);
  if (!persisted) throw redirect("/login");

  try {
    const r = await api<{ accessToken: string; expiresIn: number }>(
      "/auth/refresh",
      { method: "POST", body: { refreshToken: persisted.refreshToken } },
    );
    return {
      accessToken: r.accessToken,
      refreshToken: persisted.refreshToken,
      email: persisted.email,
      expiresAt: Date.now() + r.expiresIn * 1000,
    };
  } catch {
    throw redirect("/login");
  }
}

export async function setSession(request: Request, data: PersistedSession) {
  const s = await getSession(request);
  s.set("data", data);
  return await commitSession(s);
}
