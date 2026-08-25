import { storage } from "../utils/storage";

export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";
export const TOKEN_KEY = "auth_token";

export async function getToken(): Promise<string | null> {
  const t = await storage.secureGet(TOKEN_KEY, null);
  return typeof t === "string" ? t : null;
}

export async function setToken(token: string | null): Promise<void> {
  if (token) await storage.secureSet(TOKEN_KEY, token);
  else await storage.secureRemove(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T = any>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BACKEND_URL}/api${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      typeof data?.detail === "string" ? data.detail : "Request failed";
    throw new ApiError(detail, res.status);
  }
  return data as T;
}
