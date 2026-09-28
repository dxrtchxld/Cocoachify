import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
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
import { api } from "@/src/lib/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ token?: string }>();

  const [token, setToken] = useState(params.token || "");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [manualTokenMode, setManualTokenMode] = useState(Boolean(params.token));

  const handleRequestReset = async () => {
    if (!email.trim()) {
      Alert.alert("Email required", "Please enter your registered email address.");
      return;
    }
    setBusy(true);
    try {
      await api("/auth/forgot-password", {
        method: "POST",
        body: { email: email.trim() },
      });
      setEmailSent(true);
    } catch (e: any) {
      Alert.alert("Notice", e?.message || "If that email is registered, a reset link will be sent.");
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async () => {
    if (!token.trim()) {
      Alert.alert("Token required", "Please enter the reset token from your link or email.");
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert("Password too short", "Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Passwords mismatch", "New password and confirmation do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ message: string }>("/auth/reset-password", {
        method: "POST",
        body: { token: token.trim(), new_password: newPassword },
      });
      Alert.alert("Success", res.message || "Password updated successfully!", [
        { text: "Sign In", onPress: () => router.replace("/login") },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Invalid or expired reset token. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const isResettingWithToken = manualTokenMode || Boolean(params.token);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          testID="back-to-login-btn"
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account Recovery</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.iconCircle}>
            <Ionicons
              name={isResettingWithToken ? "key-outline" : "mail-unread-outline"}
              size={36}
              color={colors.brand}
            />
          </View>

          <Text style={styles.title}>
            {isResettingWithToken ? "Set New Password" : "Reset Your Password"}
          </Text>
          <Text style={styles.subtitle}>
            {isResettingWithToken
              ? "Enter your reset token and choose a strong password of at least 8 characters."
              : "Enter your account email and we will send you a secure link to reset your password."}
          </Text>

          {isResettingWithToken ? (
            <View style={styles.formSection}>
              <View style={styles.field}>
                <Text style={styles.label}>Reset Token</Text>
                <TextInput
                  testID="token-input"
                  style={styles.input}
                  value={token}
                  onChangeText={setToken}
                  placeholder="Paste reset token here"
                  placeholderTextColor={colors.onSurfaceSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>New Password</Text>
                <TextInput
                  testID="new-password-input"
                  style={styles.input}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Min. 8 characters"
                  placeholderTextColor={colors.onSurfaceSecondary}
                  secureTextEntry
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Confirm New Password</Text>
                <TextInput
                  testID="confirm-password-input"
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Repeat new password"
                  placeholderTextColor={colors.onSurfaceSecondary}
                  secureTextEntry
                />
              </View>

              <Button
                testID="submit-reset-btn"
                title="Save New Password"
                onPress={handleResetPassword}
                loading={busy}
                style={{ marginTop: spacing.md }}
              />

              <TouchableOpacity
                onPress={() => setManualTokenMode(false)}
                style={styles.switchModeBtn}
              >
                <Text style={styles.switchModeText}>Need a new reset link instead?</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.formSection}>
              {emailSent ? (
                <View style={styles.sentCard}>
                  <Ionicons name="checkmark-circle" size={32} color={colors.success} />
                  <Text style={styles.sentTitle}>Check your inbox</Text>
                  <Text style={styles.sentBody}>
                    If {email.trim()} matches an account, we sent password reset instructions.
                  </Text>
                  <Button
                    title="I Have a Reset Token"
                    variant="ghost"
                    onPress={() => setManualTokenMode(true)}
                    style={{ marginTop: spacing.md, alignSelf: "stretch" }}
                  />
                </View>
              ) : (
                <>
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

                  <Button
                    testID="send-reset-btn"
                    title="Send Reset Link"
                    onPress={handleRequestReset}
                    loading={busy}
                    style={{ marginTop: spacing.md }}
                  />

                  <TouchableOpacity
                    onPress={() => setManualTokenMode(true)}
                    style={styles.switchModeBtn}
                  >
                    <Text style={styles.switchModeText}>Already have a token? Enter it here</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          <TouchableOpacity
            style={styles.returnBtn}
            onPress={() => router.replace("/login")}
          >
            <Ionicons name="arrow-back-circle-outline" size={18} color={colors.onSurfaceSecondary} />
            <Text style={styles.returnBtnText}>Back to Sign In</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  headerRow: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 17,
    color: colors.onSurface,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    alignItems: "center",
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: `${colors.brand}15`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 24,
    color: colors.onSurface,
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.onSurfaceSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: spacing.xl,
  },
  formSection: {
    width: "100%",
  },
  field: {
    marginBottom: spacing.lg,
  },
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
    paddingHorizontal: spacing.md,
    color: colors.onSurface,
    backgroundColor: colors.surfaceSecondary,
    fontSize: 15,
  },
  sentCard: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
  },
  sentTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.onSurface,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  sentBody: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.onSurfaceSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  switchModeBtn: {
    marginTop: spacing.lg,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  switchModeText: {
    fontFamily: fonts.medium,
    fontSize: 13.5,
    color: colors.brand,
    textDecorationLine: "underline",
  },
  returnBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xxl,
    minHeight: 44,
  },
  returnBtnText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.onSurfaceSecondary,
  },
});
