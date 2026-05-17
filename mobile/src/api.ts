import Constants from "expo-constants";

const apiUrl: string = Constants.expoConfig?.extra?.apiUrl ?? "";

export interface ApiOptions {
  method?: string;
  body?: unknown;
  token?: string;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  if (!apiUrl) throw new Error("expoConfig.extra.apiUrl not set");
  const headers: Record<string, string> = {};
  if (opts.body) headers["content-type"] = "application/json";
  if (opts.token) headers["authorization"] = `Bearer ${opts.token}`;
  const res = await fetch(apiUrl + path, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new ApiError(res.status, (json as { error?: string }).error ?? res.statusText);
  }
  return json as T;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
