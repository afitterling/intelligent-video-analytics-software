import { Link } from "expo-router";
import { useState } from "react";
import { Button, Text, TextInput, View } from "react-native";
import { useAuth } from "~/auth";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setBusy(true); setErr(null);
    try { await login(email, password); }
    catch (e) { setErr(e instanceof Error ? e.message : "login failed"); }
    finally { setBusy(false); }
  };

  return (
    <View style={{ padding: 20, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "600" }}>Sign in</Text>
      <TextInput placeholder="email" autoCapitalize="none" keyboardType="email-address"
        value={email} onChangeText={setEmail} style={input} />
      <TextInput placeholder="password" secureTextEntry value={password}
        onChangeText={setPassword} style={input} />
      {err && <Text style={{ color: "red" }}>{err}</Text>}
      <Button title={busy ? "..." : "Sign in"} onPress={onSubmit} disabled={busy} />
      <Link href="/(auth)/signup"><Text>Create account</Text></Link>
      <Link href="/(auth)/forgot"><Text>Forgot password?</Text></Link>
    </View>
  );
}

const input = { borderWidth: 1, borderColor: "#ccc", padding: 10, borderRadius: 6 } as const;
