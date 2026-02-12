import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useSeason } from "../contexts/SeasonContext";
import { useCreateSeason } from "../hooks/useApi";
import { Colors, Spacing, FontSize, FontFamily, Radius } from "../utils/theme";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { SeasonsStackParamList } from "./SeasonsScreen";

const TOTAL_STEPS = 5;

const DURATION_PRESETS = [
  { label: "1 Week", days: 7 },
  { label: "2 Weeks", days: 14 },
  { label: "3 Weeks", days: 21 },
  { label: "1 Month", days: 31 },
];

const CASH_PRESETS = [
  { label: "$10K", value: 10000 },
  { label: "$50K", value: 50000 },
  { label: "$100K", value: 100000 },
  { label: "$500K", value: 500000 },
  { label: "$1M", value: 1000000 },
];

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <View style={styles.dotsContainer}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i === current ? styles.dotActive : i < current ? styles.dotCompleted : null,
          ]}
        />
      ))}
    </View>
  );
}

export default function CreateSeasonScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<SeasonsStackParamList>>();
  const { setSelectedSeasonId } = useSeason();
  const createSeason = useCreateSeason();

  const [step, setStep] = useState(0);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [durationDays, setDurationDays] = useState(14);
  const [startingCash, setStartingCash] = useState(100000);
  const [customCash, setCustomCash] = useState("");
  const [showCustomCash, setShowCustomCash] = useState(false);
  const [limitTrades, setLimitTrades] = useState(false);
  const [maxTrades, setMaxTrades] = useState("");
  const [marginEnabled, setMarginEnabled] = useState(false);
  const [leverageMultiplier, setLeverageMultiplier] = useState(2.0);
  const [marginInterestRate, setMarginInterestRate] = useState(0.08);
  const [maintenanceMarginPct, setMaintenanceMarginPct] = useState(0.30);

  const canNext = () => {
    if (step === 0) return name.trim().length >= 2;
    return true;
  };

  const handleNext = () => {
    if (step < TOTAL_STEPS - 1) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
    } else {
      navigation.goBack();
    }
  };

  const handleCreate = () => {
    const finalCash = showCustomCash && customCash
      ? parseFloat(customCash)
      : startingCash;

    if (isNaN(finalCash) || finalCash < 10000 || finalCash > 1000000) {
      Alert.alert("Invalid amount", "Starting cash must be between $10,000 and $1,000,000.");
      return;
    }

    const tradeLimit = limitTrades && maxTrades
      ? parseInt(maxTrades, 10)
      : null;

    if (tradeLimit !== null && (isNaN(tradeLimit) || tradeLimit < 1 || tradeLimit > 1000)) {
      Alert.alert("Invalid limit", "Trade limit must be between 1 and 1,000.");
      return;
    }

    createSeason.mutate(
      {
        name: name.trim(),
        starting_cash: finalCash,
        duration_days: durationDays,
        max_trades_per_player: tradeLimit,
        description: description.trim() || null,
        margin_enabled: marginEnabled,
        leverage_multiplier: marginEnabled ? leverageMultiplier : undefined,
        margin_interest_rate: marginEnabled ? marginInterestRate : undefined,
        maintenance_margin_pct: marginEnabled ? maintenanceMarginPct : undefined,
      },
      {
        onSuccess: (data) => {
          setSelectedSeasonId(data.id);
          navigation.navigate("SeasonDetail", {
            seasonId: data.id,
            seasonName: data.name,
          });
        },
        onError: (err) => {
          Alert.alert("Error", err.message);
        },
      }
    );
  };

  const endDate = new Date();
  endDate.setDate(endDate.getDate() + durationDays);

  const effectiveCash = showCustomCash && customCash
    ? parseFloat(customCash) || 0
    : startingCash;

  const effectiveTradeLimit = limitTrades && maxTrades
    ? parseInt(maxTrades, 10) || null
    : null;

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <View>
            <Text style={styles.stepTitle}>Name Your Season</Text>
            <Text style={styles.stepSubtitle}>Give it a name players will remember</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Tech Titans Showdown"
              placeholderTextColor={Colors.textMuted}
              value={name}
              onChangeText={setName}
              maxLength={50}
              autoFocus
            />
            <Text style={styles.charCount}>{name.length}/50</Text>
            <Text style={[styles.stepSubtitle, { marginTop: Spacing.xxl }]}>
              Description (optional)
            </Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="What's this season about?"
              placeholderTextColor={Colors.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              maxLength={200}
            />
          </View>
        );

      case 1:
        return (
          <View>
            <Text style={styles.stepTitle}>Set Duration</Text>
            <Text style={styles.stepSubtitle}>How long should the competition run?</Text>
            <View style={styles.presetGrid}>
              {DURATION_PRESETS.map((preset) => (
                <TouchableOpacity
                  key={preset.days}
                  style={[
                    styles.presetButton,
                    durationDays === preset.days && styles.presetButtonActive,
                  ]}
                  onPress={() => setDurationDays(preset.days)}
                >
                  <Text
                    style={[
                      styles.presetButtonText,
                      durationDays === preset.days && styles.presetButtonTextActive,
                    ]}
                  >
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.dateRange}>
              <Ionicons name="calendar-outline" size={16} color={Colors.textSecondary} />
              <Text style={styles.dateRangeText}>
                {formatDate(new Date())} — {formatDate(endDate)}
              </Text>
            </View>
          </View>
        );

      case 2:
        return (
          <View>
            <Text style={styles.stepTitle}>Starting Cash</Text>
            <Text style={styles.stepSubtitle}>How much virtual cash does each player get?</Text>
            <View style={styles.presetGrid}>
              {CASH_PRESETS.map((preset) => (
                <TouchableOpacity
                  key={preset.value}
                  style={[
                    styles.presetButton,
                    !showCustomCash && startingCash === preset.value && styles.presetButtonActive,
                  ]}
                  onPress={() => {
                    setStartingCash(preset.value);
                    setShowCustomCash(false);
                    setCustomCash("");
                  }}
                >
                  <Text
                    style={[
                      styles.presetButtonText,
                      !showCustomCash && startingCash === preset.value && styles.presetButtonTextActive,
                    ]}
                  >
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[
                  styles.presetButton,
                  showCustomCash && styles.presetButtonActive,
                ]}
                onPress={() => setShowCustomCash(true)}
              >
                <Text
                  style={[
                    styles.presetButtonText,
                    showCustomCash && styles.presetButtonTextActive,
                  ]}
                >
                  Custom
                </Text>
              </TouchableOpacity>
            </View>
            {showCustomCash && (
              <View style={styles.customCashRow}>
                <Text style={styles.dollarSign}>$</Text>
                <TextInput
                  style={styles.customCashInput}
                  placeholder="Amount"
                  placeholderTextColor={Colors.textMuted}
                  value={customCash}
                  onChangeText={setCustomCash}
                  keyboardType="numeric"
                  autoFocus
                />
              </View>
            )}
          </View>
        );

      case 3:
        return (
          <View>
            <Text style={styles.stepTitle}>Margin Trading</Text>
            <Text style={styles.stepSubtitle}>
              Advanced — borrowed funds accrue interest
            </Text>

            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => setMarginEnabled(!marginEnabled)}
            >
              <View style={styles.toggleInfo}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="warning-outline" size={16} color={Colors.orange} />
                  <Text style={styles.toggleLabel}>Enable Margin Trading</Text>
                </View>
                <Text style={styles.toggleSubtext}>
                  Players can borrow to amplify gains (and losses)
                </Text>
              </View>
              <View style={[styles.toggle, marginEnabled && styles.toggleActive]}>
                <View style={[styles.toggleKnob, marginEnabled && styles.toggleKnobActive]} />
              </View>
            </TouchableOpacity>

            {marginEnabled && (
              <View style={{ marginTop: Spacing.xl }}>
                <Text style={styles.marginSectionLabel}>Leverage</Text>
                <View style={styles.presetGrid}>
                  {[1.5, 2, 3, 4].map((val) => (
                    <TouchableOpacity
                      key={val}
                      style={[
                        styles.presetButton,
                        leverageMultiplier === val && styles.presetButtonActive,
                      ]}
                      onPress={() => setLeverageMultiplier(val)}
                    >
                      <Text
                        style={[
                          styles.presetButtonText,
                          leverageMultiplier === val && styles.presetButtonTextActive,
                        ]}
                      >
                        {val}x
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.marginSectionLabel, { marginTop: Spacing.xl }]}>
                  Interest Rate (Annual)
                </Text>
                <View style={styles.presetGrid}>
                  {[0.04, 0.08, 0.12].map((val) => (
                    <TouchableOpacity
                      key={val}
                      style={[
                        styles.presetButton,
                        marginInterestRate === val && styles.presetButtonActive,
                      ]}
                      onPress={() => setMarginInterestRate(val)}
                    >
                      <Text
                        style={[
                          styles.presetButtonText,
                          marginInterestRate === val && styles.presetButtonTextActive,
                        ]}
                      >
                        {val * 100}%
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.marginSectionLabel, { marginTop: Spacing.xl }]}>
                  Maintenance Margin
                </Text>
                <View style={styles.presetGrid}>
                  {[0.20, 0.30, 0.40, 0.50].map((val) => (
                    <TouchableOpacity
                      key={val}
                      style={[
                        styles.presetButton,
                        maintenanceMarginPct === val && styles.presetButtonActive,
                      ]}
                      onPress={() => setMaintenanceMarginPct(val)}
                    >
                      <Text
                        style={[
                          styles.presetButtonText,
                          maintenanceMarginPct === val && styles.presetButtonTextActive,
                        ]}
                      >
                        {val * 100}%
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>
        );

      case 4:
        return (
          <View>
            <Text style={styles.stepTitle}>Trade Limits & Confirm</Text>

            {/* Trade limit toggle */}
            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => setLimitTrades(!limitTrades)}
            >
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleLabel}>Limit trades per player?</Text>
                <Text style={styles.toggleSubtext}>
                  Adds strategy — players must choose wisely
                </Text>
              </View>
              <View style={[styles.toggle, limitTrades && styles.toggleActive]}>
                <View style={[styles.toggleKnob, limitTrades && styles.toggleKnobActive]} />
              </View>
            </TouchableOpacity>

            {limitTrades && (
              <View style={styles.tradeLimitInput}>
                <Text style={styles.tradeLimitLabel}>Max trades:</Text>
                <TextInput
                  style={styles.tradeLimitField}
                  placeholder="e.g. 10"
                  placeholderTextColor={Colors.textMuted}
                  value={maxTrades}
                  onChangeText={setMaxTrades}
                  keyboardType="numeric"
                  autoFocus
                />
              </View>
            )}

            {/* Summary card */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Season Summary</Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Name</Text>
                <Text style={styles.summaryValue}>{name || "—"}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Duration</Text>
                <Text style={styles.summaryValue}>
                  {durationDays} days ({formatDate(new Date())} — {formatDate(endDate)})
                </Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Starting Cash</Text>
                <Text style={styles.summaryValue}>
                  ${effectiveCash.toLocaleString()}
                </Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Trade Limit</Text>
                <Text style={styles.summaryValue}>
                  {effectiveTradeLimit ? `${effectiveTradeLimit} trades` : "Unlimited"}
                </Text>
              </View>
              {marginEnabled ? (
                <>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Margin Trading</Text>
                    <Text style={[styles.summaryValue, { color: Colors.orange }]}>
                      {leverageMultiplier}x leverage, {marginInterestRate * 100}% interest
                    </Text>
                  </View>
                </>
              ) : null}
              {description.trim() ? (
                <>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Description</Text>
                    <Text style={[styles.summaryValue, { flex: 1, textAlign: "right" }]} numberOfLines={2}>
                      {description.trim()}
                    </Text>
                  </View>
                </>
              ) : null}
            </View>
          </View>
        );
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Season</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ProgressDots current={step} total={TOTAL_STEPS} />

      {/* Step content */}
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {renderStep()}
      </ScrollView>

      {/* Bottom button */}
      <View style={styles.footer}>
        {step < TOTAL_STEPS - 1 ? (
          <TouchableOpacity
            style={[styles.nextButton, !canNext() && styles.nextButtonDisabled]}
            onPress={handleNext}
            disabled={!canNext()}
          >
            <Text style={styles.nextButtonText}>Next</Text>
            <Ionicons name="arrow-forward" size={18} color={Colors.text} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.createButton, createSeason.isPending && styles.nextButtonDisabled]}
            onPress={handleCreate}
            disabled={createSeason.isPending}
          >
            {createSeason.isPending ? (
              <ActivityIndicator color={Colors.text} />
            ) : (
              <>
                <Ionicons name="sparkles" size={18} color={Colors.text} />
                <Text style={styles.nextButtonText}>Create Season</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.statusBar,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.card,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: FontSize.xl,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  headerSpacer: {
    width: 36,
  },
  dotsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.surface,
  },
  dotActive: {
    backgroundColor: Colors.primary,
    width: 24,
  },
  dotCompleted: {
    backgroundColor: Colors.primary + "60",
  },
  body: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
  },
  bodyContent: {
    paddingBottom: Spacing.lg,
  },
  stepTitle: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.bold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  stepSubtitle: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.textSecondary,
    marginBottom: Spacing.xl,
  },
  input: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    fontSize: FontSize.md,
    fontFamily: FontFamily.regular,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  charCount: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
    textAlign: "right",
    marginTop: Spacing.xs,
  },
  presetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  presetButton: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  presetButtonActive: {
    backgroundColor: Colors.primary + "20",
    borderColor: Colors.primary,
  },
  presetButtonText: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.semiBold,
    color: Colors.textSecondary,
  },
  presetButtonTextActive: {
    color: Colors.primary,
  },
  dateRange: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.xxl,
    backgroundColor: Colors.card,
    padding: Spacing.lg,
    borderRadius: Radius.md,
  },
  dateRangeText: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.regular,
    color: Colors.textSecondary,
  },
  customCashRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.lg,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.lg,
  },
  dollarSign: {
    fontSize: FontSize.xl,
    fontFamily: FontFamily.bold,
    color: Colors.textSecondary,
  },
  customCashInput: {
    flex: 1,
    fontSize: FontSize.xl,
    fontFamily: FontFamily.semiBold,
    color: Colors.text,
    padding: Spacing.lg,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.card,
    padding: Spacing.lg,
    borderRadius: Radius.md,
    marginTop: Spacing.lg,
  },
  toggleInfo: {
    flex: 1,
    marginRight: Spacing.lg,
  },
  toggleLabel: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.semiBold,
    color: Colors.text,
  },
  toggleSubtext: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
    marginTop: 2,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  toggleActive: {
    backgroundColor: Colors.primary,
  },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.textSecondary,
  },
  toggleKnobActive: {
    alignSelf: "flex-end",
    backgroundColor: Colors.text,
  },
  marginSectionLabel: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.semiBold,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  tradeLimitInput: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginTop: Spacing.md,
    backgroundColor: Colors.card,
    padding: Spacing.lg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tradeLimitLabel: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.semiBold,
    color: Colors.textSecondary,
  },
  tradeLimitField: {
    flex: 1,
    fontSize: FontSize.lg,
    fontFamily: FontFamily.semiBold,
    color: Colors.text,
  },
  summaryCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginTop: Spacing.xxl,
    marginBottom: Spacing.xxxl,
  },
  summaryTitle: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.bold,
    color: Colors.text,
    marginBottom: Spacing.lg,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  summaryLabel: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
  },
  summaryValue: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.semiBold,
    color: Colors.text,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
    paddingTop: Spacing.md,
  },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.lg,
    borderRadius: Radius.md,
  },
  nextButtonDisabled: {
    opacity: 0.4,
  },
  nextButtonText: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.accent,
    paddingVertical: Spacing.lg,
    borderRadius: Radius.md,
  },
});
