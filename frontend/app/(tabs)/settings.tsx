import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Button from "@/src/components/Button";
import { useAuth, User } from "@/src/context/AuthContext";
import { ACCENTS, useTheme } from "@/src/context/ThemeContext";
import { api } from "@/src/lib/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

export default function Settings() {
  const insets = useSafeAreaInsets();
  const { user, logout, refreshUser } = useAuth();
  const { accentColor, setAccent } = useTheme();
  const isCoach = user?.role === "coach";
  const [coach, setCoach] = useState<User | null>(null);
  const [pendingCoach, setPendingCoach] = useState<{ name: string; email: string } | null>(null);
  const [connectMode, setConnectMode] = useState<"code" | "email">("code");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinMsg, setJoinMsg] = useState<string | null>(null);
  const [clientCount, setClientCount] = useState(0);

  // Wearables
  const [strava, setStrava] = useState<{
    configured: boolean;
    connected: boolean;
    athlete_id?: number | null;
    last_synced_at?: string | null;
  } | null>(null);
  const [syncingStrava, setSyncingStrava] = useState(false);
  const [connectingStrava, setConnectingStrava] = useState(false);

  // Account & Security
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [exportingData, setExportingData] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const load = useCallback(async () => {
    try {
      if (isCoach) {
        const clients = await api<User[]>("/coach/clients");
        setClientCount(clients.length);
      } else {
        const c = await api<{ coach: User | null; pending: { name: string; email: string } | null }>("/coach");
        setCoach(c.coach);
        setPendingCoach(c.pending ?? null);
      }
      try {
        const w = await api<{
          strava: {
            configured: boolean;
            connected: boolean;
            athlete_id?: number | null;
            last_synced_at?: string | null;
          };
        }>("/wearables/status");
        setStrava(w.strava);
      } catch {
        // wearables optional
      }
      await refreshUser();
    } catch {
      // ignore
    }
  }, [isCoach, refreshUser]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const connect = async () => {
    const body =
      connectMode === "code" ? { code: code.trim() } : { coach_email: email.trim() };
    if (connectMode === "code" && !code.trim()) return;
    if (connectMode === "email" && !email.trim()) return;
    setJoining(true);
    setJoinMsg(null);
    try {
      const res = await api<{ status: "connected" | "pending"; coach: { name: string; email: string } }>(
        "/invites/accept",
        { method: "POST", body },
      );
      setCode("");
      setEmail("");
      if (res.status === "pending") {
        setPendingCoach({ name: res.coach.name, email: res.coach.email });
        setJoinMsg(null);
      } else {
        setJoinMsg(`Connected to coach ${res.coach.name}!`);
      }
      await load();
    } catch (e: any) {
      setJoinMsg(e?.message || "Couldn't connect");
    } finally {
      setJoining(false);
    }
  };

  const handleConnectStrava = async () => {
    setConnectingStrava(true);
    try {
      const returnTo =
        Platform.OS === "web" && typeof window !== "undefined"
          ? window.location.origin + "/settings"
          : "frontend://settings";
      const res = await api<{ url: string }>(
        `/wearables/strava/connect-url?return_to=${encodeURIComponent(returnTo)}`,
      );
      if (res.url) {
        if (Platform.OS === "web") {
          window.location.href = res.url;
        } else {
          await Linking.openURL(res.url);
        }
      }
    } catch (e: any) {
      Alert.alert("Strava Connection", e?.message || "Could not start Strava connection.");
    } finally {
      setConnectingStrava(false);
    }
  };

  const handleSyncStrava = async () => {
    setSyncingStrava(true);
    try {
      const res = await api<{ imported: number }>("/wearables/strava/sync", { method: "POST" });
      Alert.alert("Strava Synced", `Imported ${res.imported} new activities.`);
      await load();
    } catch (e: any) {
      Alert.alert("Strava Sync", e?.message || "Could not sync activities.");
    } finally {
      setSyncingStrava(false);
    }
  };

  const handleDisconnectStrava = async () => {
    Alert.alert("Disconnect Strava", "Are you sure you want to disconnect Strava?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: async () => {
          try {
            await api("/wearables/strava/disconnect", { method: "POST" });
            Alert.alert("Disconnected", "Strava has been disconnected.");
            await load();
          } catch (e: any) {
            Alert.alert("Error", e?.message || "Could not disconnect Strava.");
          }
        },
      },
    ]);
  };

  const handleChangePassword = async () => {
    if (!currentPassword) {
      Alert.alert("Current password required", "Please enter your current password.");
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert("Password too short", "New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      Alert.alert("Passwords mismatch", "New password and confirmation do not match.");
      return;
    }
    setChangingPassword(true);
    try {
      await api("/auth/change-password", {
        method: "POST",
        body: { current_password: currentPassword, new_password: newPassword },
      });
      Alert.alert("Success", "Password updated successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setChangePasswordOpen(false);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not change password.");
    } finally {
      setChangingPassword(false);
    }
  };

  const handleExportData = async () => {
    setExportingData(true);
    try {
      const data = await api<any>("/auth/me/export");
      const json = JSON.stringify(data, null, 2);
      await Clipboard.setStringAsync(json);
      Alert.alert(
        "Data Exported",
        `Your account archive (${json.length} characters) has been copied to your clipboard.`,
        [
          {
            text: "Share",
            onPress: () => {
              if (Platform.OS !== "web") {
                Share.share({ message: json, title: "Co-Coachify Data Export" });
              }
            },
          },
          { text: "OK" },
        ],
      );
    } catch (e: any) {
      Alert.alert("Export Error", e?.message || "Could not export your data.");
    } finally {
      setExportingData(false);
    }
  };

  const handleDeleteAccount = async () => {
    const doDelete = async () => {
      setDeletingAccount(true);
      try {
        await api("/auth/me/delete", { method: "POST" });
        await logout();
        router.replace("/login");
      } catch (e: any) {
        Alert.alert("Error", e?.message || "Could not delete account.");
      } finally {
        setDeletingAccount(false);
      }
    };

    Alert.alert(
      "Delete Account",
      "Are you sure you want to permanently delete your account? This action cannot be undone and will revoke all your sessions.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete Permanently", style: "destructive", onPress: doDelete },
      ],
    );
  };

  const confirmLogout = () => {
    const doLogout = async () => {
      await logout();
      router.replace("/login");
    };
    if (Platform.OS === "web") {
      doLogout();
    } else {
      Alert.alert("Log out", "Are you sure you want to log out?", [
        { text: "Cancel", style: "cancel" },
        { text: "Log out", style: "destructive", onPress: doLogout },
      ]);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: spacing.xxxl + spacing.xl }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>SETTINGS</Text>

        {/* Profile */}
        <View style={styles.profileCard}>
          {user?.picture ? (
            <Image source={{ uri: user.picture }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>{(user?.name || "U")[0].toUpperCase()}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{user?.name}</Text>
            <Text style={styles.profileEmail}>{user?.email}</Text>
            <Text style={styles.roleText}>{isCoach ? "COACH" : "CLIENT"}</Text>
          </View>
          {user?.is_premium && (
            <View style={styles.premiumBadge}>
              <Ionicons name="star" size={12} color={colors.onBrandTertiary} />
              <Text style={styles.premiumText}>PREMIUM</Text>
            </View>
          )}
        </View>

        {isCoach ? (
          <>
            <Text style={styles.sectionTitle}>COACHING</Text>
            <View style={styles.swatchCard}>
              <Text style={styles.rowTitle}>What kind of coach are you?</Text>
              <Text style={styles.rowSub}>This shapes your dashboard language and defaults.</Text>
              <View style={styles.specRow}>
                {[
                  { id: "fitness", label: "Fitness" },
                  { id: "yoga", label: "Yoga" },
                  { id: "breathwork", label: "Breathwork" },
                  { id: "mobility", label: "Mobility" },
                  { id: "mindfulness", label: "Mindfulness" },
                ].map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    testID={`spec-${s.id}`}
                    style={[
                      styles.specChip,
                      user?.coach_specialty === s.id && { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
                    ]}
                    onPress={async () => {
                      try {
                        await api("/me/role", { method: "POST", body: { role: "coach", specialty: s.id } });
                        await refreshUser();
                      } catch {
                        // ignore
                      }
                    }}
                  >
                    <Text
                      style={[
                        styles.specText,
                        user?.coach_specialty === s.id && { color: colors.onSurface },
                      ]}
                    >
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TouchableOpacity
              testID="invite-client-row"
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => router.push("/invite")}
            >
              <Ionicons name="qr-code" size={20} color={colors.brand} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Invite a client</Text>
                <Text style={styles.rowSub}>Share your QR code or 6-character invite code</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              testID="my-clients-row"
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => router.push("/(tabs)/clients")}
            >
              <Ionicons name="people" size={20} color={colors.brand} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>My clients</Text>
                <Text style={styles.rowSub}>
                  {clientCount} connected client{clientCount === 1 ? "" : "s"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              testID="exercise-library-row"
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => router.push("/exercise-library")}
            >
              <Ionicons name="barbell" size={20} color={colors.brand} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Exercise library</Text>
                <Text style={styles.rowSub}>Reusable exercises & coaching cues</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              testID="workspace-row"
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => router.push("/studio")}
            >
              <Ionicons name="grid" size={20} color={colors.brand} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Coach workspace</Text>
                <Text style={styles.rowSub}>Courses, plans, community, leads & memberships</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              testID="modules-row"
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => router.push("/studio/modules")}
            >
              <Ionicons name="toggle" size={20} color={colors.brand} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Platform modules</Text>
                <Text style={styles.rowSub}>Turn each new feature on or off</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              testID="brand-studio-row"
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => router.push("/brand-studio")}
            >
              <Ionicons name="color-palette" size={20} color={colors.brand} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Brand studio</Text>
                <Text style={styles.rowSub}>Your logo, brand color & client-facing look</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              testID="customize-home-row"
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => router.push("/dashboard-customize")}
            >
              <Ionicons name="options" size={20} color={colors.brand} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Customize home</Text>
                <Text style={styles.rowSub}>Reorder & hide dashboard sections</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
            </TouchableOpacity>
            <View style={styles.row}>
              <Ionicons name="mail" size={20} color={colors.brand} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Clients can also connect by email</Text>
                <Text style={styles.rowSub}>They can enter {user?.email} in their app</Text>
              </View>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.sectionTitle}>YOUR COACH</Text>
            <TouchableOpacity
              testID="my-journey-row"
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => router.push("/portal")}
            >
              <Ionicons name="compass" size={20} color={colors.brand} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>My journey</Text>
                <Text style={styles.rowSub}>Courses, goals, assignments & check-ins</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
            </TouchableOpacity>
            {coach ? (
              <View style={styles.row}>
                <Ionicons name="person-circle" size={22} color={colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{coach.name}</Text>
                  <Text style={styles.rowSub}>{coach.email}</Text>
                </View>
                <View style={styles.connectedChip}>
                  <Text style={styles.connectedText}>Connected</Text>
                </View>
              </View>
            ) : pendingCoach ? (
              <View style={styles.connectCard}>
                <View style={styles.pendingRow}>
                  <Ionicons name="time-outline" size={20} color={colors.warning} />
                  <Text style={styles.connectTitle}>Request pending</Text>
                </View>
                <Text style={styles.connectHint}>
                  We sent a connection request to {pendingCoach.name} ({pendingCoach.email}). They need to
                  approve it before you&apos;ll be connected — this keeps your coach&apos;s shared files private.
                </Text>
              </View>
            ) : (
              <View style={styles.connectCard}>
                <Text style={styles.connectTitle}>Connect to your coach</Text>
                <View style={styles.segment}>
                  <TouchableOpacity
                    testID="mode-code"
                    style={[styles.segmentBtn, connectMode === "code" && styles.segmentBtnActive]}
                    onPress={() => setConnectMode("code")}
                  >
                    <Text style={[styles.segmentText, connectMode === "code" && styles.segmentTextActive]}>
                      Invite Code
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="mode-email"
                    style={[styles.segmentBtn, connectMode === "email" && styles.segmentBtnActive]}
                    onPress={() => setConnectMode("email")}
                  >
                    <Text style={[styles.segmentText, connectMode === "email" && styles.segmentTextActive]}>
                      Coach Email
                    </Text>
                  </TouchableOpacity>
                </View>
                {connectMode === "code" ? (
                  <>
                    <Text style={styles.connectHint}>
                      Ask your coach for their 6-character invite code.
                    </Text>
                    <TextInput
                      testID="coach-code-input"
                      style={styles.codeInput}
                      value={code}
                      onChangeText={setCode}
                      placeholder="••••••"
                      placeholderTextColor={colors.onSurfaceSecondary}
                      autoCapitalize="characters"
                      maxLength={8}
                    />
                  </>
                ) : (
                  <>
                    <Text style={styles.connectHint}>
                      Enter the email your coach uses on Co-Coachify. They&apos;ll need to approve your request.
                    </Text>
                    <TextInput
                      testID="coach-email-input"
                      style={styles.input}
                      value={email}
                      onChangeText={setEmail}
                      placeholder="coach@example.com"
                      placeholderTextColor={colors.onSurfaceSecondary}
                      autoCapitalize="none"
                      keyboardType="email-address"
                    />
                  </>
                )}
                <Button
                  testID="connect-btn"
                  title={connectMode === "code" ? "Connect with Code" : "Connect with Email"}
                  onPress={connect}
                  loading={joining}
                  style={{ marginTop: spacing.lg }}
                />
                {joinMsg && <Text style={styles.joinMsg}>{joinMsg}</Text>}
              </View>
            )}
          </>
        )}

        {/* Appearance */}
        <Text style={styles.sectionTitle}>APPEARANCE</Text>
        <View style={styles.swatchCard}>
          <Text style={styles.rowSub}>Accent color — applies across the whole app</Text>
          <View style={styles.swatchRow}>
            {ACCENTS.map((a) => (
              <TouchableOpacity
                key={a.name}
                testID={`accent-${a.name.replace(" ", "-")}`}
                style={[
                  styles.swatch,
                  { backgroundColor: a.brand },
                  accentColor === a.brand && styles.swatchActive,
                ]}
                onPress={() => setAccent(a)}
              >
                {accentColor === a.brand && (
                  <Ionicons name="checkmark" size={18} color={a.onBrand} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Premium */}
        {!user?.is_premium && (
          <>
            <Text style={styles.sectionTitle}>MEMBERSHIP</Text>
            <TouchableOpacity
              testID="go-premium-row"
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => router.push("/paywall")}
            >
              <Ionicons name="star" size={20} color={colors.brand} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Go Premium</Text>
                <Text style={styles.rowSub}>Unlock the full Co-Coachify experience</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
            </TouchableOpacity>
          </>
        )}

        {/* Connected Apps & Wearables */}
        <Text style={styles.sectionTitle}>CONNECTED APPS & WEARABLES</Text>
        <View style={styles.connectCard}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xs }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <View style={[styles.appIconCircle, { backgroundColor: "#FC4C02" }]}>
                <Ionicons name="bicycle" size={18} color="#FFFFFF" />
              </View>
              <View>
                <Text style={styles.rowTitle}>Strava</Text>
                <Text style={styles.rowSub}>
                  {strava?.connected
                    ? strava.last_synced_at
                      ? `Synced ${new Date(strava.last_synced_at).toLocaleDateString()}`
                      : "Connected"
                    : "Import rides, runs & activities"}
                </Text>
              </View>
            </View>
            {strava?.connected ? (
              <View style={styles.connectedChip}>
                <Text style={styles.connectedText}>Connected</Text>
              </View>
            ) : null}
          </View>

          {strava?.connected ? (
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
              <TouchableOpacity
                testID="strava-sync-btn"
                style={[styles.smallActionBtn, { backgroundColor: colors.surface }]}
                onPress={handleSyncStrava}
                disabled={syncingStrava}
              >
                {syncingStrava ? (
                  <ActivityIndicator size="small" color={colors.brand} />
                ) : (
                  <>
                    <Ionicons name="sync" size={14} color={colors.brand} />
                    <Text style={[styles.smallActionText, { color: colors.brand }]}>Sync Now</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                testID="strava-disconnect-btn"
                style={[styles.smallActionBtn, { backgroundColor: colors.surface }]}
                onPress={handleDisconnectStrava}
              >
                <Text style={[styles.smallActionText, { color: colors.error }]}>Disconnect</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Button
              testID="connect-strava-btn"
              title="Connect Strava"
              variant="ghost"
              onPress={handleConnectStrava}
              loading={connectingStrava}
              style={{ marginTop: spacing.sm }}
            />
          )}

          <View style={styles.wearableUpcomingRow}>
            <Ionicons name="watch-outline" size={16} color={colors.onSurfaceSecondary} />
            <Text style={styles.wearableUpcomingText}>
              Apple Health & Google Health Connect coming soon
            </Text>
          </View>
        </View>

        {/* Account & Security */}
        <Text style={styles.sectionTitle}>ACCOUNT & SECURITY</Text>

        <TouchableOpacity
          testID="toggle-change-password-btn"
          style={styles.row}
          activeOpacity={0.7}
          onPress={() => setChangePasswordOpen(!changePasswordOpen)}
        >
          <Ionicons name="key-outline" size={20} color={colors.brand} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Change Password</Text>
            <Text style={styles.rowSub}>Update your account login password</Text>
          </View>
          <Ionicons
            name={changePasswordOpen ? "chevron-up" : "chevron-forward"}
            size={18}
            color={colors.onSurfaceSecondary}
          />
        </TouchableOpacity>

        {changePasswordOpen && (
          <View style={styles.passwordAccordionCard}>
            <Text style={styles.fieldLabel}>Current Password</Text>
            <TextInput
              testID="current-password-input"
              style={styles.securityInput}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="Enter current password"
              placeholderTextColor={colors.onSurfaceSecondary}
              secureTextEntry
            />
            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>New Password</Text>
            <TextInput
              testID="new-password-input"
              style={styles.securityInput}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Min. 8 characters"
              placeholderTextColor={colors.onSurfaceSecondary}
              secureTextEntry
            />
            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>Confirm New Password</Text>
            <TextInput
              testID="confirm-new-password-input"
              style={styles.securityInput}
              value={confirmNewPassword}
              onChangeText={setConfirmNewPassword}
              placeholder="Repeat new password"
              placeholderTextColor={colors.onSurfaceSecondary}
              secureTextEntry
            />
            <Button
              testID="submit-change-password-btn"
              title="Update Password"
              onPress={handleChangePassword}
              loading={changingPassword}
              style={{ marginTop: spacing.md }}
            />
          </View>
        )}

        <TouchableOpacity
          testID="export-data-btn"
          style={styles.row}
          activeOpacity={0.7}
          onPress={handleExportData}
          disabled={exportingData}
        >
          <Ionicons name="download-outline" size={20} color={colors.brand} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Export My Data</Text>
            <Text style={styles.rowSub}>Download a copy of your personal activity and profile archive</Text>
          </View>
          {exportingData ? (
            <ActivityIndicator size="small" color={colors.brand} />
          ) : (
            <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          testID="delete-account-btn"
          style={styles.row}
          activeOpacity={0.7}
          onPress={handleDeleteAccount}
          disabled={deletingAccount}
        >
          <Ionicons name="trash-outline" size={20} color={colors.error} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: colors.error }]}>Delete Account</Text>
            <Text style={styles.rowSub}>Deactivate your account and delete your session data</Text>
          </View>
          {deletingAccount ? (
            <ActivityIndicator size="small" color={colors.error} />
          ) : (
            <Ionicons name="chevron-forward" size={18} color={colors.error} />
          )}
        </TouchableOpacity>

        {/* About */}
        <Text style={styles.sectionTitle}>ABOUT</Text>
        <View style={styles.row}>
          <Ionicons name="information-circle" size={20} color={colors.onSurfaceSecondary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Co-Coachify</Text>
            <Text style={styles.rowSub}>Version 1.0.0</Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl }}>
          <Button testID="logout-btn" title="Log Out" variant="secondary" onPress={confirmLogout} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  title: {
    fontFamily: fonts.displayBold,
    fontSize: 24,
    color: colors.onSurface,
    letterSpacing: 1,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarFallback: { backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontFamily: fonts.displayBold, fontSize: 22, color: colors.onBrandTertiary },
  profileName: { fontFamily: fonts.bold, fontSize: 17, color: colors.onSurface },
  profileEmail: { fontFamily: fonts.regular, fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 1 },
  roleText: { fontFamily: fonts.bold, fontSize: 10, color: colors.brandSecondary, letterSpacing: 1.5, marginTop: 3 },
  premiumBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  premiumText: { fontFamily: fonts.bold, fontSize: 9, color: colors.onBrandTertiary, letterSpacing: 0.8 },
  sectionTitle: {
    fontFamily: fonts.display,
    fontSize: 13,
    color: colors.brand,
    letterSpacing: 1.2,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    minHeight: 56,
  },
  rowTitle: { fontFamily: fonts.semiBold, fontSize: 15, color: colors.onSurface },
  rowSub: { fontFamily: fonts.regular, fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 1 },
  connectedChip: {
    backgroundColor: "rgba(50,215,75,0.12)",
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  connectedText: { fontFamily: fonts.bold, fontSize: 11, color: colors.success },
  connectCard: {
    marginHorizontal: spacing.xl,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  connectTitle: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.onSurface, marginBottom: spacing.md },
  pendingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  segment: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentBtn: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  segmentBtnActive: { backgroundColor: colors.brandTertiary },
  segmentText: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.onSurfaceSecondary },
  segmentTextActive: { color: colors.onSurface },
  connectHint: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.onSurfaceSecondary, marginTop: spacing.md },
  codeInput: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    color: colors.onSurface,
    fontFamily: fonts.displayBold,
    fontSize: 22,
    letterSpacing: 6,
    textAlign: "center",
    backgroundColor: colors.surface,
    marginTop: spacing.md,
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
    backgroundColor: colors.surface,
    marginTop: spacing.md,
  },
  joinMsg: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.brandSecondary, marginTop: spacing.md, textAlign: "center" },
  swatchCard: {
    marginHorizontal: spacing.xl,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  swatchRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginTop: spacing.md,
    justifyContent: "flex-start",
  },
  swatch: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  swatchActive: { borderWidth: 3, borderColor: "#FFFFFF" },
  specRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  specChip: {
    paddingHorizontal: spacing.md,
    minHeight: 40,
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  specText: { fontFamily: fonts.semiBold, fontSize: 12.5, color: colors.onSurfaceSecondary },
  appIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  smallActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  smallActionText: {
    fontFamily: fonts.semiBold,
    fontSize: 12.5,
  },
  wearableUpcomingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  wearableUpcomingText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.onSurfaceSecondary,
  },
  passwordAccordionCard: {
    marginHorizontal: spacing.xl,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  fieldLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 11.5,
    color: colors.onSurfaceSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  securityInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    color: colors.onSurface,
    backgroundColor: colors.surface,
    marginTop: 4,
    fontSize: 14,
  },
});
