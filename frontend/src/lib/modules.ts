/** Module flags + shared types for the modular coaching platform. */
import { useCallback, useEffect, useState } from "react";

import { api } from "./api";

export type ModuleKey =
  | "courses"
  | "coaching"
  | "community"
  | "crm"
  | "landing"
  | "memberships"
  | "assistant"
  | "files";

export type ModuleInfo = {
  key: ModuleKey;
  label: string;
  description: string;
  enabled: boolean;
};

export type ModulesResponse = { editable: boolean; modules: ModuleInfo[] };

export function useModules() {
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [editable, setEditable] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api<ModulesResponse>("/modules");
      setModules(res.modules);
      setEditable(res.editable);
    } catch {
      setModules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const enabled = (key: ModuleKey) => modules.some((m) => m.key === key && m.enabled);

  const toggle = async (key: ModuleKey, value: boolean) => {
    setModules((prev) => prev.map((m) => (m.key === key ? { ...m, enabled: value } : m)));
    try {
      const res = await api<ModulesResponse>("/modules", {
        method: "PUT",
        body: { flags: { [key]: value } },
      });
      setModules(res.modules);
    } catch {
      load();
    }
  };

  return { modules, editable, loading, enabled, toggle, reload: load };
}

export type Course = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  category: string;
  cover_image: string | null;
  pricing_type: "free" | "one_time" | "membership";
  price: number;
  status: "draft" | "published";
  slug: string | null;
  lesson_count?: number;
  enrolled_count?: number;
  completed_count?: number;
  progress_pct?: number;
  access?: string;
  last_lesson_id?: string | null;
};

export type Lesson = {
  id: string;
  course_id: string;
  module_id: string | null;
  title: string;
  summary: string;
  content: string;
  video_url: string | null;
  video_file_id?: string | null;
  duration_minutes: number;
  order: number;
  attachments: string[];
  attachment_files?: { id: string; title: string; kind: string; url: string }[];
  release: { type: "immediate" | "day_offset" | "date"; day_offset: number; date: string | null };
  unlocked?: boolean;
  completed?: boolean;
  course_title?: string;
};

export type Section = { id: string | null; title: string; order: number; lessons: Lesson[] };
