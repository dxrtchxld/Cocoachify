import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import Button from "@/src/components/Button";
import {
  Card,
  EmptyState,
  Field,
  Loading,
  Pill,
  ScreenHeader,
  SectionTitle,
  Sheet,
} from "@/src/components/studio/UI";
import { api } from "@/src/lib/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

type AutomationRule = {
  id: string;
  name: string;
  trigger: {
    type: string;
    course_id?: string | null;
    plan_id?: string | null;
  };
  actions: {
    type: string;
    tag?: string | null;
    stage?: string | null;
    program_id?: string | null;
    course_id?: string | null;
    message?: string;
    subject?: string;
    title?: string;
  }[];
  enabled: boolean;
  created_at?: string;
};

type Meta = {
  triggers: string[];
  actions: string[];
  courses: { id: string; title: string }[];
  programs: { id: string; name: string }[];
  plans: { id: string; name: string }[];
};

const TRIGGER_LABELS: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  client_connected: { label: "Client connects", icon: "person-add" },
  checkin_submitted: { label: "Check-in submitted", icon: "checkmark-circle" },
  lesson_completed: { label: "Lesson completed", icon: "book" },
  course_completed: { label: "Course completed", icon: "school" },
  goal_completed: { label: "Goal completed", icon: "trophy" },
  milestone_completed: { label: "Milestone reached", icon: "flag" },
  membership_started: { label: "Membership started", icon: "card" },
  membership_cancelled: { label: "Membership cancelled", icon: "close-circle" },
};

const ACTION_LABELS: Record<string, string> = {
  send_chat: "Send chat message",
  add_tag: "Add CRM tag",
  remove_tag: "Remove CRM tag",
  move_stage: "Move pipeline stage",
  enroll_course: "Enroll in course",
  assign_program: "Assign workout program",
  send_email: "Send email",
  post_announcement: "Post announcement",
};

export default function AutomationsScreen() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Form state
  const [ruleName, setRuleName] = useState("");
  const [selectedTrigger, setSelectedTrigger] = useState("client_connected");
  const [selectedAction, setSelectedAction] = useState("send_chat");
  const [actionValue, setActionValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [r, m] = await Promise.all([
        api<AutomationRule[]>("/studio/automations"),
        api<Meta>("/studio/automations/meta").catch(() => null),
      ]);
      setRules(r);
      if (m) setMeta(m);
    } catch {
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const toggleRule = async (rule: AutomationRule) => {
    // Optimistic
    setRules((prev) =>
      prev.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)),
    );
    try {
      await api(`/studio/automations/${rule.id}/toggle`, { method: "PUT" });
    } catch {
      load();
    }
  };

  const deleteRule = (rule: AutomationRule) => {
    Alert.alert("Delete rule", `Are you sure you want to delete "${rule.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api(`/studio/automations/${rule.id}`, { method: "DELETE" });
            load();
          } catch (e: any) {
            Alert.alert("Error", e?.message || "Could not delete rule.");
          }
        },
      },
    ]);
  };

  const openTemplate = (template: {
    name: string;
    trigger: string;
    action: string;
    value: string;
  }) => {
    setRuleName(template.name);
    setSelectedTrigger(template.trigger);
    setSelectedAction(template.action);
    setActionValue(template.value);
    setError("");
    setSheetOpen(true);
  };

  const saveRule = async () => {
    if (!ruleName.trim()) {
      setError("Please provide a name for this automation.");
      return;
    }
    if (
      ["add_tag", "remove_tag", "move_stage", "send_chat", "send_email"].includes(
        selectedAction,
      ) &&
      !actionValue.trim()
    ) {
      setError("Please enter the required action value.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const actionPayload: any = { type: selectedAction };
      if (selectedAction === "add_tag" || selectedAction === "remove_tag") {
        actionPayload.tag = actionValue.trim();
      } else if (selectedAction === "move_stage") {
        actionPayload.stage = actionValue.trim();
      } else if (selectedAction === "send_chat" || selectedAction === "send_email") {
        actionPayload.message = actionValue.trim();
      } else if (selectedAction === "enroll_course") {
        actionPayload.course_id = meta?.courses?.[0]?.id || actionValue.trim();
      } else if (selectedAction === "assign_program") {
        actionPayload.program_id = meta?.programs?.[0]?.id || actionValue.trim();
      }

      await api("/studio/automations", {
        method: "POST",
        body: {
          name: ruleName.trim(),
          trigger: { type: selectedTrigger },
          actions: [actionPayload],
          enabled: true,
        },
      });

      setSheetOpen(false);
      setRuleName("");
      setActionValue("");
      load();
    } catch (e: any) {
      setError(e?.message || "Failed to create automation rule.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Automations"
        subtitle={`${rules.filter((r) => r.enabled).length} active workflows`}
        right={
          <TouchableOpacity
            testID="new-rule-btn"
            style={styles.addBtn}
            onPress={() => {
              setRuleName("");
              setSelectedTrigger("client_connected");
              setSelectedAction("send_chat");
              setActionValue("");
              setError("");
              setSheetOpen(true);
            }}
          >
            <Ionicons name="add" size={24} color={colors.brand} />
          </TouchableOpacity>
        }
      />

      {loading ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Quick template chips */}
          <SectionTitle>PRESET TEMPLATES</SectionTitle>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.templateRow}
          >
            {[
              {
                name: "Welcome Onboarding",
                trigger: "client_connected",
                action: "send_chat",
                value: "Welcome! Excited to start working together. Reach out anytime with questions.",
                label: "Welcome new client",
                icon: "sparkles",
              },
              {
                name: "Course Finisher Tag",
                trigger: "course_completed",
                action: "add_tag",
                value: "course_graduate",
                label: "Tag on course completion",
                icon: "school",
              },
              {
                name: "Check-in Review Flag",
                trigger: "checkin_submitted",
                action: "add_tag",
                value: "submitted_checkin",
                label: "Tag on check-in",
                icon: "checkmark-done",
              },
            ].map((t, idx) => (
              <TouchableOpacity
                key={idx}
                testID={`template-${idx}`}
                style={styles.templateCard}
                onPress={() => openTemplate(t)}
                activeOpacity={0.8}
              >
                <View style={styles.templateIcon}>
                  <Ionicons name={t.icon as any} size={18} color={colors.brand} />
                </View>
                <Text style={styles.templateTitle}>{t.label}</Text>
                <Text style={styles.templateSub}>{t.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Active Rules */}
          <SectionTitle>{`YOUR RULES (${rules.length})`}</SectionTitle>
          {rules.length === 0 ? (
            <EmptyState
              icon="flash-outline"
              title="No automations yet"
              body="Create trigger-action workflows to automate repetitive messages, tagging, and enrollments."
            />
          ) : (
            rules.map((rule) => {
              const trg = TRIGGER_LABELS[rule.trigger.type] || {
                label: rule.trigger.type,
                icon: "flash",
              };
              return (
                <Card key={rule.id} style={styles.ruleCard}>
                  <View style={styles.ruleHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.ruleName}>{rule.name}</Text>
                      <View style={styles.triggerBadgeRow}>
                        <Ionicons name={trg.icon} size={14} color={colors.brand} />
                        <Text style={styles.triggerBadgeText}>When: {trg.label}</Text>
                      </View>
                    </View>
                    <Switch
                      testID={`toggle-rule-${rule.id}`}
                      value={rule.enabled}
                      onValueChange={() => toggleRule(rule)}
                      trackColor={{ false: colors.border, true: colors.brand }}
                      thumbColor="#FFFFFF"
                    />
                  </View>

                  <View style={styles.actionsBox}>
                    {rule.actions.map((act, ai) => (
                      <View key={ai} style={styles.actionItem}>
                        <Ionicons name="arrow-forward" size={12} color={colors.onSurfaceSecondary} />
                        <Text style={styles.actionDesc}>
                          {ACTION_LABELS[act.type] || act.type}
                          {act.tag ? `: "${act.tag}"` : ""}
                          {act.stage ? `: "${act.stage}"` : ""}
                          {act.message ? `: "${act.message.slice(0, 40)}${act.message.length > 40 ? "..." : ""}"` : ""}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.ruleFooter}>
                    <Pill
                      label={rule.enabled ? "Active" : "Disabled"}
                      tone={rule.enabled ? "good" : "neutral"}
                    />
                    <TouchableOpacity
                      testID={`delete-rule-${rule.id}`}
                      onPress={() => deleteRule(rule)}
                      style={styles.deleteBtn}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                </Card>
              );
            })
          )}
        </ScrollView>
      )}

      {/* New Rule Sheet */}
      <Sheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Create Automation Rule"
      >
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Field
            testID="rule-name-input"
            label="Rule Name"
            placeholder="e.g. Welcome message to new clients"
            value={ruleName}
            onChangeText={setRuleName}
          />

          <Text style={styles.sheetSectionLabel}>WHEN THIS HAPPENS (TRIGGER)</Text>
          <View style={styles.chipsContainer}>
            {Object.entries(TRIGGER_LABELS).map(([k, v]) => (
              <TouchableOpacity
                key={k}
                testID={`trigger-chip-${k}`}
                style={[
                  styles.selectChip,
                  selectedTrigger === k && styles.selectChipActive,
                ]}
                onPress={() => setSelectedTrigger(k)}
              >
                <Ionicons
                  name={v.icon}
                  size={14}
                  color={selectedTrigger === k ? colors.onBrand : colors.onSurfaceSecondary}
                />
                <Text
                  style={[
                    styles.selectChipText,
                    selectedTrigger === k && styles.selectChipTextActive,
                  ]}
                >
                  {v.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.sheetSectionLabel, { marginTop: spacing.sm }]}>
            THEN DO THIS (ACTION)
          </Text>
          <View style={styles.chipsContainer}>
            {Object.entries(ACTION_LABELS).map(([k, v]) => (
              <TouchableOpacity
                key={k}
                testID={`action-chip-${k}`}
                style={[
                  styles.selectChip,
                  selectedAction === k && styles.selectChipActive,
                ]}
                onPress={() => setSelectedAction(k)}
              >
                <Text
                  style={[
                    styles.selectChipText,
                    selectedAction === k && styles.selectChipTextActive,
                  ]}
                >
                  {v}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {["send_chat", "send_email"].includes(selectedAction) ? (
            <Field
              testID="action-message-input"
              label="Message text"
              placeholder="Hi there! Welcome to the group..."
              value={actionValue}
              onChangeText={setActionValue}
              multiline
            />
          ) : ["add_tag", "remove_tag"].includes(selectedAction) ? (
            <Field
              testID="action-tag-input"
              label="Tag name"
              placeholder="e.g. vip, lead, completed_phase1"
              value={actionValue}
              onChangeText={setActionValue}
            />
          ) : selectedAction === "move_stage" ? (
            <Field
              testID="action-stage-input"
              label="Stage name"
              placeholder="e.g. active, enrolled, lost"
              value={actionValue}
              onChangeText={setActionValue}
            />
          ) : (
            <Field
              testID="action-value-input"
              label="Target Identifier or Name"
              placeholder="Enter name or ID"
              value={actionValue}
              onChangeText={setActionValue}
            />
          )}

          <Button
            testID="save-rule-btn"
            title="Create Automation"
            onPress={saveRule}
            loading={saving}
            style={{ marginTop: spacing.md }}
          />
        </ScrollView>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  addBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  templateRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  templateCard: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    width: 170,
    gap: 4,
  },
  templateIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  templateTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.onSurface,
  },
  templateSub: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.onSurfaceSecondary,
  },
  ruleCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  ruleHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  ruleName: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.onSurface,
  },
  triggerBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  triggerBadgeText: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: colors.brand,
  },
  actionsBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  actionDesc: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    color: colors.onSurfaceSecondary,
    flex: 1,
  },
  ruleFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  deleteBtn: {
    padding: 6,
  },
  sheetSectionLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.onSurfaceSecondary,
    letterSpacing: 0.8,
  },
  chipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  selectChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selectChipActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  selectChipText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.onSurfaceSecondary,
  },
  selectChipTextActive: {
    color: colors.onBrand,
    fontFamily: fonts.semiBold,
  },
  errorText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.error,
  },
});
