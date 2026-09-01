import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";

import { api, setToken, getToken } from "../lib/api";

WebBrowser.maybeCompleteAuthSession();

export type User = {
  user_id: string;
  email: string;
  name: string;
  picture: string | null;
  role: "coach" | "client" | null;
  coach_specialty: string | null;
  theme_color: string | null;
  brand_logo: string | null;
  is_coach: boolean;
  is_premium: boolean;
  coach_id: string | null;
  onboarding: {
    goal: string;
    experience: string;
    days_per_week: number;
    focus: string | null;
    notes: string | null;
  } | null;
  onboarding_completed: boolean;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

function extractSessionId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/[?#&]session_id=([^&#]+)/);
  return m ? m[1] : null;
}

const processedSessionIds = new Set<string>();

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const capturedUrl = useRef<string | null>(null);

  const exchangeSession = useCallback(async (sessionId: string) => {
    if (processedSessionIds.has(sessionId)) return;
    processedSessionIds.add(sessionId);
    const data = await api<{ session_token: string; user: User }>(
      "/auth/session",
      { method: "POST", body: { session_id: sessionId } },
    );
    await setToken(data.session_token);
    setUser(data.user);
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const cleaned = window.location.href
        .replace(/([?#&])session_id=[^&#]+&?/, "$1")
        .replace(/[?#&]$/, "");
      window.history.replaceState(window.history.state, "", cleaned);
    }
  }, []);

  useEffect(() => {
    const sub = Linking.addEventListener("url", ({ url }) => {
      capturedUrl.current = url;
      const sid = extractSessionId(url);
      if (sid) {
        exchangeSession(sid).catch(() => {});
      }
    });

    (async () => {
      try {
        let sid: string | null = null;
        if (Platform.OS === "web" && typeof window !== "undefined") {
          sid = extractSessionId(window.location.href);
        } else {
          const initial = await Linking.getInitialURL();
          sid = extractSessionId(initial);
        }
        if (sid) {
          await exchangeSession(sid);
        } else {
          const token = await getToken();
          if (token) {
            const me = await api<User>("/auth/me");
            setUser(me);
          }
        }
      } catch {
        await setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();

    return () => sub.remove();
  }, [exchangeSession]);

  const loginWithGoogle = useCallback(async () => {
    const redirectUrl =
      Platform.OS === "web" && typeof window !== "undefined"
        ? window.location.origin + "/"
        : Linking.createURL("");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;

    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.location.href = authUrl;
      return;
    }

    capturedUrl.current = null;
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    let sid: string | null = null;
    if (result.type === "success" && "url" in result) {
      sid = extractSessionId(result.url);
    }
    if (!sid) sid = extractSessionId(capturedUrl.current);
    if (!sid) sid = extractSessionId(await Linking.getInitialURL());
    if (sid) {
      await exchangeSession(sid);
    }
  }, [exchangeSession]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<{ access_token: string; user: User }>(
      "/auth/login",
      { method: "POST", body: { email, password } },
    );
    await setToken(data.access_token);
    setUser(data.user);
  }, []);

  const register = useCallback(
    async (email: string, password: string, name: string) => {
      const data = await api<{ access_token: string; user: User }>(
        "/auth/register",
        { method: "POST", body: { email, password, name: name || undefined } },
      );
      await setToken(data.access_token);
      setUser(data.user);
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      // local cleanup regardless
    }
    await setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const me = await api<User>("/auth/me");
      setUser(me);
    } catch {
      // keep current state
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, loginWithGoogle, login, register, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
