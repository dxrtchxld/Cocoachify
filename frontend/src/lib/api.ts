import { Platform } from "react-native";

import { storage } from "../utils/storage";

export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";
export const TOKEN_KEY = "auth_token";

/** Resolve a stored media reference (absolute URL or "/api/files/..") to a loadable URL. */
export function mediaUrl(u?: string | null): string | null {
  if (!u) return null;
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/")) return `${BACKEND_URL}${u}`;
  return u;
}

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

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

/** Upload a local image (from expo-image-picker) and return its stored relative URL. */
export async function uploadImage(uri: string): Promise<string> {
  const token = await getToken();
  const ext = (uri.split("?")[0].split(".").pop() || "jpg").toLowerCase();
  const type = MIME_BY_EXT[ext] || "image/jpeg";
  const name = `upload.${ext}`;

  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append("file", blob, name);
  } else {
    form.append("file", { uri, name, type } as any);
  }

  const res = await fetch(`${BACKEND_URL}/api/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(typeof json?.detail === "string" ? json.detail : "Upload failed", res.status);
  }
  return json.url as string;
}
