import * as SecureStore from "expo-secure-store";
import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

interface Session {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  email: string;
  expiresAt: number;
}

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  confirm: (email: string, code: string) => Promise<void>;
  forgot: (email: string) => Promise<void>;
  reset: (email: string, code: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  authedFetch: <T>(path: string, opts?: { method?: string; body?: unknown }) => Promise<T>;
}

const Ctx = createContext<AuthContextValue | null>(null);

const KEY = "iva.session";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    SecureStore.getItemAsync(KEY).then((raw) => {
      if (raw) setSession(JSON.parse(raw));
      setLoading(false);
    });
  }, []);

  const persist = async (s: Session | null) => {
    setSession(s);
    if (s) await SecureStore.setItemAsync(KEY, JSON.stringify(s));
    else await SecureStore.deleteItemAsync(KEY);
  };

  const refresh = async (current: Session): Promise<Session> => {
    const r = await api<{ accessToken: string; idToken: string; expiresIn: number }>(
      "/auth/refresh",
      { method: "POST", body: { refreshToken: current.refreshToken } },
    );
    const next: Session = {
      ...current,
      accessToken: r.accessToken,
      idToken: r.idToken,
      expiresAt: Date.now() + r.expiresIn * 1000,
    };
    await persist(next);
    return next;
  };

  const value: AuthContextValue = {
    session,
    loading,
    async login(email, password) {
      const r = await api<{ accessToken: string; idToken: string; refreshToken: string; expiresIn: number }>(
        "/auth/login",
        { method: "POST", body: { email, password } },
      );
      await persist({
        accessToken: r.accessToken,
        idToken: r.idToken,
        refreshToken: r.refreshToken,
        email,
        expiresAt: Date.now() + r.expiresIn * 1000,
      });
    },
    async signup(email, password) {
      await api("/auth/signup", { method: "POST", body: { email, password } });
    },
    async confirm(email, code) {
      await api("/auth/confirm", { method: "POST", body: { email, code } });
    },
    async forgot(email) {
      await api("/auth/forgot", { method: "POST", body: { email } });
    },
    async reset(email, code, password) {
      await api("/auth/reset", { method: "POST", body: { email, code, password } });
    },
    async logout() {
      await persist(null);
    },
    async authedFetch<T>(path: string, opts?: { method?: string; body?: unknown }) {
      let s = session;
      if (!s) throw new Error("not authenticated");
      if (s.expiresAt - Date.now() < 60_000) s = await refresh(s);
      return api<T>(path, { ...(opts ?? {}), token: s.accessToken });
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
};
