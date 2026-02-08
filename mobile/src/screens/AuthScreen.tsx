import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { auth, persistToken } from "../api/client";
import { Colors, Spacing, FontSize, Radius } from "../utils/theme";

interface AuthScreenProps {
  onAuthenticated: () => void;
}

export default function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<"register" | "login">("register");
  const [alias, setAlias] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!alias.trim() || !inviteCode.trim()) {
      Alert.alert("Missing Fields", "Please enter both an alias and invite code.");
      return;
    }

    setLoading(true);
    try {
      const result = await auth.register({
        alias: alias.trim().toLowerCase(),
        invite_code: inviteCode.trim().toUpperCase(),
      });
      await persistToken(result.token);

      Alert.alert(
        "Welcome!",
        `You're in, ${result.alias}! Let's trade.`,
        [{ text: "Let's go", onPress: onAuthenticated }]
      );
    } catch (e: any) {
      Alert.alert("Registration Failed", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!alias.trim() || !token.trim()) {
      Alert.alert("Missing Fields", "Please enter both your alias and token.");
      return;
    }

    setLoading(true);
    try {
      const result = await auth.login({
        alias: alias.trim().toLowerCase(),
        token: token.trim(),
      });
      await persistToken(result.token);
      onAuthenticated();
    } catch (e: any) {
      Alert.alert("Login Failed", e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.content}>
        {/* Logo area */}
        <View style={styles.logoArea}>
          <Ionicons name="trending-up" size={56} color={Colors.primary} />
          <Text style={styles.appName}>Fantasy Trading</Text>
          <Text style={styles.tagline}>Compete. Trade. Win.</Text>
        </View>

        {/* Mode toggle */}
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeButton, mode === "register" && styles.modeButtonActive]}
            onPress={() => setMode("register")}
          >
            <Text style={[styles.modeText, mode === "register" && styles.modeTextActive]}>
              Register
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, mode === "login" && styles.modeButtonActive]}
            onPress={() => setMode("login")}
          >
            <Text style={[styles.modeText, mode === "login" && styles.modeTextActive]}>
              Login
            </Text>
          </TouchableOpacity>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.label}>Player Alias</Text>
          <TextInput
            style={styles.input}
            value={alias}
            onChangeText={setAlias}
            placeholder="e.g., swift tiger"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {mode === "register" ? (
            <>
              <Text style={styles.label}>Invite Code</Text>
              <TextInput
                style={styles.input}
                value={inviteCode}
                onChangeText={setInviteCode}
                placeholder="e.g., BETA-A1B2C3"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </>
          ) : (
            <>
              <Text style={styles.label}>Token</Text>
              <TextInput
                style={styles.input}
                value={token}
                onChangeText={setToken}
                placeholder="Paste your token here"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </>
          )}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={mode === "register" ? handleRegister : handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.text} />
            ) : (
              <Text style={styles.buttonText}>
                {mode === "register" ? "Create Account" : "Log In"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    padding: Spacing.xxl,
  },
  logoArea: {
    alignItems: "center",
    marginBottom: Spacing.xxxl,
  },
  appName: {
    fontSize: FontSize.xxxl,
    fontWeight: "800",
    color: Colors.text,
    marginTop: Spacing.md,
  },
  tagline: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  modeToggle: {
    flexDirection: "row",
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: 4,
    marginBottom: Spacing.xxl,
  },
  modeButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: "center",
    borderRadius: Radius.sm,
  },
  modeButtonActive: {
    backgroundColor: Colors.primary,
  },
  modeText: {
    fontSize: FontSize.md,
    fontWeight: "600",
    color: Colors.textMuted,
  },
  modeTextActive: {
    color: Colors.text,
  },
  form: {
    gap: Spacing.sm,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: "600",
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
  input: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    alignItems: "center",
    marginTop: Spacing.xl,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: FontSize.lg,
    fontWeight: "700",
    color: Colors.text,
  },
});
