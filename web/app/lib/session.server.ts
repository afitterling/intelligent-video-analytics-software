import { createCookieSessionStorage, redirect } from "@remix-run/node";
import { api } from "./api.server.js";

const secret = process.env.SESSION_SECRET ?? "dev-only-secret-change-me";

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
  idToken: string;
  email: string;
  expiresAt: number; // ms
}

export const getSession = (request: Request) =>
  storage.getSession(request.headers.get("Cookie"));

export const commitSession = storage.commitSession;
export const destroySession = storage.destroySession;

export async function readSession(request: Request): Promise<SessionData | null> {
  const s = await getSession(request);
  const data = s.get("data") as SessionData | undefined;
  return data ?? null;
}

export async function requireSession(request: Request): Promise<SessionData> {
  const data = await readSession(request);
  if (!data) throw redirect("/login");

  if (data.expiresAt - Date.now() < 60_000) {
    try {
      const r = await api<{ accessToken: string; idToken: string; expiresIn: number }>(
        "/auth/refresh",
        { method: "POST", body: { refreshToken: data.refreshToken } },
      );
      const next: SessionData = {
        ...data,
        accessToken: r.accessToken,
        idToken: r.idToken,
        expiresAt: Date.now() + r.expiresIn * 1000,
      };
      const s = await getSession(request);
      s.set("data", next);
      // Note: we can't set cookies from a regular loader without re-throwing,
      // so the caller refreshes by reload if needed. Token is still usable here.
      return next;
    } catch {
      throw redirect("/login");
    }
  }

  return data;
}

export async function setSession(request: Request, data: SessionData) {
  const s = await getSession(request);
  s.set("data", data);
  return await commitSession(s);
}
