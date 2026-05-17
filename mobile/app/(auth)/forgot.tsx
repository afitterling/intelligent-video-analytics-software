import { Link } from "expo-router";
import { useState } from "react";
import { Button, Text, TextInput, View } from "react-native";
import { useAuth } from "~/auth";

export default function Forgot() {
  const { forgot, reset } = useAuth();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"request" | "reset" | "done">("request");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      if (step === "request") { await forgot(email); setStep("reset"); }
      else if (step === "reset") { await reset(email, code, password); setStep("done"); }
    } catch (e) { setErr(e instanceof Error ? e.message : "failed"); }
    finally { setBusy(false); }
  };

  if (step === "done") {
    return (
      <View style={{ padding: 20, gap: 12 }}>
        <Text style={{ fontSize: 22 }}>Password updated</Text>
        <Link href="/(auth)/login"><Text>Sign in →</Text></Link>
      </View>
    );
  }

  return (
    <View style={{ padding: 20, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "600" }}>
        {step === "request" ? "Reset password" : "Enter code"}
      </Text>
      <TextInput placeholder="email" autoCapitalize="none" keyboardType="email-address"
        value={email} onChangeText={setEmail} style={input} />
      {step === "reset" && (
        <>
          <TextInput placeholder="code from email" value={code} onChangeText={setCode} style={input} />
          <TextInput placeholder="new password" secureTextEntry
            value={password} onChangeText={setPassword} style={input} />
        </>
      )}
      {err && <Text style={{ color: "red" }}>{err}</Text>}
      <Button title={busy ? "..." : step === "request" ? "Send code" : "Reset"} onPress={submit} disabled={busy} />
    </View>
  );
}

const input = { borderWidth: 1, borderColor: "#ccc", padding: 10, borderRadius: 6 } as const;
