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
  pdf: "application/pdf",
  mp4: "video/mp4",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  m4a: "audio/m4a",
  wav: "audio/wav",
  csv: "text/csv",
  txt: "text/plain",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** Upload a file (image/pdf/audio/video/doc) into the coach's PRIVATE library. */
export async function uploadPrivateFile(
  file: { uri: string; name: string; mimeType?: string },
  opts: { title?: string; visibility?: "private" | "clients" | "course"; courseId?: string } = {},
): Promise<{ id: string; title: string; kind: string; url: string }> {
  const token = await getToken();
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const type = file.mimeType || MIME_BY_EXT[ext] || "application/octet-stream";

  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(file.uri)).blob();
    form.append("file", blob, file.name);
  } else {
    form.append("file", { uri: file.uri, name: file.name, type } as any);
  }
  form.append("title", opts.title ?? file.name);
  form.append("visibility", opts.visibility ?? "private");
  if (opts.courseId) form.append("course_id", opts.courseId);

  const res = await fetch(`${BACKEND_URL}/api/library/files`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(typeof json?.detail === "string" ? json.detail : "Upload failed", res.status);
  }
  return json;
}

/** Short-lived signed URL for rendering/downloading a private file. */
export async function privateFileUrl(fileId: string): Promise<string> {
  const res = await api<{ url: string }>(`/library/files/${fileId}/link`);
  return `${BACKEND_URL}${res.url}`;
}
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
