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
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { auth, persistToken, persistTokens } from "../api/client";
import { Colors, Spacing, FontSize, Radius, FontFamily } from "../utils/theme";

interface AuthScreenProps {
  onAuthenticated: () => void;
}

type Mode = "register" | "login" | "legacy" | "forgot";

export default function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>("register");
  const [alias, setAlias] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [legacyToken, setLegacyToken] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!alias.trim() || !email.trim() || !password.trim()) {
      Alert.alert("Missing Fields", "Please enter alias, email, and password.");
      return;
    }

    setLoading(true);
    try {
      const result = await auth.registerV2({
        alias: alias.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        password: password,
        invite_code: inviteCode.trim() ? inviteCode.trim().toUpperCase() : undefined,
      });
      await persistTokens(result.access_token, result.refresh_token);

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
    if (!email.trim() || !password.trim()) {
      Alert.alert("Missing Fields", "Please enter your email/alias and password.");
      return;
    }

    setLoading(true);
    try {
      const result = await auth.loginV2({
        email_or_alias: email.trim().toLowerCase(),
        password: password,
      });
      await persistTokens(result.access_token, result.refresh_token);
      onAuthenticated();
    } catch (e: any) {
      Alert.alert("Login Failed", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLegacyLogin = async () => {
    if (!alias.trim() || !legacyToken.trim()) {
      Alert.alert("Missing Fields", "Please enter both your alias and token.");
      return;
    }

    setLoading(true);
    try {
      const result = await auth.login({
        alias: alias.trim().toLowerCase(),
        token: legacyToken.trim(),
      });
      await persistToken(result.token);
      onAuthenticated();
    } catch (e: any) {
      Alert.alert("Login Failed", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      Alert.alert("Missing Field", "Please enter your email address.");
      return;
    }

    setLoading(true);
    try {
      const result = await auth.forgotPassword(email.trim().toLowerCase());
      Alert.alert("Check Your Email", result.message);
      setMode("login");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  const renderForm = () => {
    switch (mode) {
      case "register":
        return (
          <>
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

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Min. 8 characters"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry
            />

            <Text style={styles.label}>Invite Code (optional)</Text>
            <TextInput
              style={styles.input}
              value={inviteCode}
              onChangeText={setInviteCode}
              placeholder="e.g., BETA-A1B2C3"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
            />

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={Colors.text} />
              ) : (
                <Text style={styles.buttonText}>Create Account</Text>
              )}
            </TouchableOpacity>
          </>
        );

      case "login":
        return (
          <>
            <Text style={styles.label}>Email or Alias</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com or alias"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry
            />

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={Colors.text} />
              ) : (
                <Text style={styles.buttonText}>Log In</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => setMode("forgot")}
            >
              <Text style={styles.linkText}>Forgot password?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => setMode("legacy")}
            >
              <Text style={styles.linkText}>Log in with token (legacy)</Text>
            </TouchableOpacity>
          </>
        );

      case "legacy":
        return (
          <>
            <Text style={styles.label}>Player Alias</Text>
            <TextInput
              style={styles.input}
              value={alias}
              onChangeText={setAlias}
              placeholder="Your alias"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>Token</Text>
            <TextInput
              style={styles.input}
              value={legacyToken}
              onChangeText={setLegacyToken}
              placeholder="Paste your token here"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLegacyLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={Colors.text} />
              ) : (
                <Text style={styles.buttonText}>Log In (Legacy)</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => setMode("login")}
            >
              <Text style={styles.linkText}>Back to password login</Text>
            </TouchableOpacity>
          </>
        );

      case "forgot":
        return (
          <>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleForgotPassword}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={Colors.text} />
              ) : (
                <Text style={styles.buttonText}>Send Reset Link</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => setMode("login")}
            >
              <Text style={styles.linkText}>Back to login</Text>
            </TouchableOpacity>
          </>
        );
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo area */}
        <View style={styles.logoArea}>
          <Ionicons name="trending-up" size={56} color={Colors.primary} />
          <Text style={styles.appName}>Fantasy Trading</Text>
          <Text style={styles.tagline}>Compete. Trade. Win.</Text>
        </View>

        {/* Mode toggle (only register/login) */}
        {(mode === "register" || mode === "login") && (
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
        )}

        {/* Sub-mode header for legacy/forgot */}
        {mode === "legacy" && (
          <Text style={styles.subHeader}>Legacy Token Login</Text>
        )}
        {mode === "forgot" && (
          <Text style={styles.subHeader}>Reset Password</Text>
        )}

        {/* Form */}
        <View style={styles.form}>{renderForm()}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: Spacing.xxl,
  },
  logoArea: {
    alignItems: "center",
    marginBottom: Spacing.xxxl,
  },
  appName: {
    fontSize: FontSize.xxxl,
    fontFamily: FontFamily.bold,
    color: Colors.text,
    marginTop: Spacing.md,
  },
  tagline: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.regular,
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
    fontFamily: FontFamily.semiBold,
    color: Colors.textMuted,
  },
  modeTextActive: {
    color: Colors.text,
  },
  subHeader: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.semiBold,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  form: {
    gap: Spacing.sm,
  },
  label: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.semiBold,
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
    fontFamily: FontFamily.regular,
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
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  linkButton: {
    alignItems: "center",
    marginTop: Spacing.md,
    padding: Spacing.sm,
  },
  linkText: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.primary,
  },
});
