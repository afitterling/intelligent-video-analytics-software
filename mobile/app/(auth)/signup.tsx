import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { Button, Text, TextInput, View } from "react-native";
import { useAuth } from "~/auth";

export default function Signup() {
  const { signup, confirm } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<"signup" | "confirm">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      if (step === "signup") {
        await signup(email, password);
        setStep("confirm");
      } else {
        await confirm(email, code);
        router.replace("/(auth)/login");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally { setBusy(false); }
  };

  return (
    <View style={{ padding: 20, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "600" }}>
        {step === "signup" ? "Create account" : "Confirm email"}
      </Text>
      {step === "signup" ? (
        <>
          <TextInput placeholder="email" autoCapitalize="none" keyboardType="email-address"
            value={email} onChangeText={setEmail} style={input} />
          <TextInput placeholder="password (10+, mixed case, digit)" secureTextEntry
            value={password} onChangeText={setPassword} style={input} />
        </>
      ) : (
        <TextInput placeholder="confirmation code" value={code} onChangeText={setCode} style={input} />
      )}
      {err && <Text style={{ color: "red" }}>{err}</Text>}
      <Button title={busy ? "..." : step === "signup" ? "Sign up" : "Confirm"} onPress={submit} disabled={busy} />
      <Link href="/(auth)/login"><Text>Have an account? Sign in</Text></Link>
    </View>
  );
}

const input = { borderWidth: 1, borderColor: "#ccc", padding: 10, borderRadius: 6 } as const;
