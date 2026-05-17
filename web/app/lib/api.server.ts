import "dotenv/config";

const API_URL = process.env.IVA_API_URL;

if (!API_URL) {
  // Crash early with a useful message instead of silently fetching localhost.
  throw new Error(
    "IVA_API_URL is not set. Put it in web/.env (and restart the dev server).",
  );
}

export interface ApiOptions {
  method?: string;
  body?: unknown;
  token?: string;
  query?: Record<string, string | undefined>;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const url = new URL(API_URL + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v) url.searchParams.set(k, v);
  }
  const headers: Record<string, string> = {};
  if (opts.body) headers["content-type"] = "application/json";
  if (opts.token) headers["authorization"] = `Bearer ${opts.token}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch (err) {
    // Network-level failure (DNS, refused, TLS) — surface the cause.
    throw new ApiError(0, `network error calling ${url.host}: ${(err as Error).message}`, null);
  }

  const text = await res.text();
  let json: unknown = {};
  if (text) {
    try { json = JSON.parse(text); }
    catch { json = { error: text.slice(0, 300) }; }
  }
  if (!res.ok) {
    const message =
      (json as { error?: string }).error
      ?? (json as { message?: string }).message
      ?? `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, message, json);
  }
  return json as T;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public payload: unknown) {
    super(message);
  }
}
