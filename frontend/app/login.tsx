import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Button from "@/src/components/Button";
import { useAuth } from "@/src/context/AuthContext";
import { colors, fonts, logo, radius, spacing } from "@/src/theme";

export default function Login() {
  const { user, loginWithGoogle, login, register } = useAuth();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  useEffect(() => {
    if (user) router.replace("/");
  }, [user]);

  const showError = (msg: string) => {
    if (Platform.OS === "web") {
      alert(msg);
    } else {
      Alert.alert("Sign in failed", msg);
    }
  };

  const handleGoogle = async () => {
    setGoogleBusy(true);
    try {
      await loginWithGoogle();
    } catch {
      showError("Google sign-in didn't complete. Please try again.");
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      showError("Enter your email and password.");
      return;
    }
    if (password.length < 8) {
      showError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signin") await login(email.trim(), password);
      else await register(email.trim(), password, name.trim());
    } catch (e: any) {
      showError(e?.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.brandHeader, { paddingTop: insets.top + spacing.xxl }]}>
        <Image source={logo} style={styles.logo} contentFit="contain" />
        <Text style={styles.brandTitle}>CO-COACHIFY</Text>
        <Text style={styles.tagline}>Your Coaching Assistant</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[styles.form, { paddingBottom: insets.bottom + spacing.xl }]}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            testID="google-signin-btn"
            style={styles.googleBtn}
            activeOpacity={0.85}
            onPress={handleGoogle}
            disabled={googleBusy}
          >
            {googleBusy ? (
              <ActivityIndicator color="#121214" />
            ) : (
              <>
                <Ionicons name="logo-google" size={20} color="#121214" />
                <Text style={styles.googleText}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or with email</Text>
            <View style={styles.divider} />
          </View>

          {mode === "signup" && (
            <View style={styles.field}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                testID="name-input"
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor={colors.onSurfaceSecondary}
                autoCapitalize="words"
              />
            </View>
          )}
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              testID="email-input"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.onSurfaceSecondary}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              testID="password-input"
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Min. 8 characters"
              placeholderTextColor={colors.onSurfaceSecondary}
              secureTextEntry
            />
          </View>

          <Button
            testID="submit-auth-btn"
            title={mode === "signin" ? "Sign In" : "Create Account"}
            onPress={handleSubmit}
            loading={busy}
            style={{ marginTop: spacing.md }}
          />

          <TouchableOpacity
            testID="toggle-auth-mode"
            onPress={() => setMode(mode === "signin" ? "signup" : "signin")}
            style={styles.toggle}
          >
            <Text style={styles.toggleText}>
              {mode === "signin" ? "New here? " : "Already have an account? "}
              <Text style={styles.toggleAccent}>
                {mode === "signin" ? "Create an account" : "Sign in"}
              </Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  brandHeader: { alignItems: "center", paddingBottom: spacing.lg },
  logo: { width: 110, height: 110, borderRadius: 26 },
  brandTitle: {
    fontFamily: fonts.displayBold,
    fontSize: 34,
    color: colors.onSurface,
    letterSpacing: 2,
    marginTop: spacing.md,
  },
  tagline: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.onSurfaceSecondary,
    marginTop: spacing.xs,
  },
  form: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  googleBtn: {
    minHeight: 52,
    backgroundColor: "#F4F4F5",
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  googleText: { fontFamily: fonts.bold, fontSize: 15, color: "#121214" },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginVertical: spacing.xl,
  },
  divider: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { fontFamily: fonts.medium, fontSize: 12, color: colors.onSurfaceSecondary },
  field: { marginBottom: spacing.lg },
  label: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.onSurfaceSecondary,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    color: colors.onSurface,
    fontFamily: fonts.regular,
    fontSize: 15,
    backgroundColor: colors.surfaceSecondary,
  },
  toggle: { alignItems: "center", marginTop: spacing.xl, minHeight: 44, justifyContent: "center" },
  toggleText: { fontFamily: fonts.medium, fontSize: 14, color: colors.onSurfaceSecondary },
  toggleAccent: { color: colors.brand, fontFamily: fonts.bold },
});
