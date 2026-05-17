import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { DEFAULTS, loadSettings, saveSettings, type Settings } from "@/settings";

export default function SettingsScreen() {
  const router = useRouter();
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadSettings().then((v) => {
      setS(v);
      setLoaded(true);
    });
  }, []);

  const save = async () => {
    await saveSettings({
      ...s,
      apiUrl: s.apiUrl.trim().replace(/\/$/, ""),
      cameraId: s.cameraId.trim() || "ios",
      intervalMs: Math.max(200, Math.min(10000, Number(s.intervalMs) || 1000)),
      quality: Math.max(0.1, Math.min(1, Number(s.quality) || 0.5)),
    });
    router.back();
  };

  if (!loaded) return null;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#000" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Field label="Backend API URL">
          <TextInput
            value={s.apiUrl}
            onChangeText={(v) => setS({ ...s, apiUrl: v })}
            placeholder="https://xxxx.execute-api.eu-west-1.amazonaws.com"
            placeholderTextColor="#666"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.input}
          />
        </Field>

        <Field label="Camera ID">
          <TextInput
            value={s.cameraId}
            onChangeText={(v) => setS({ ...s, cameraId: v })}
            placeholder="ios"
            placeholderTextColor="#666"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
        </Field>

        <Field label="Frame interval (ms)">
          <TextInput
            value={String(s.intervalMs)}
            onChangeText={(v) => setS({ ...s, intervalMs: Number(v) || 0 })}
            keyboardType="number-pad"
            style={styles.input}
          />
          <Text style={styles.hint}>Min 200, max 10000.</Text>
        </Field>

        <Field label="JPEG quality (0.1–1.0)">
          <TextInput
            value={String(s.quality)}
            onChangeText={(v) => setS({ ...s, quality: Number(v) || 0 })}
            keyboardType="decimal-pad"
            style={styles.input}
          />
        </Field>

        <Pressable style={styles.save} onPress={save}>
          <Text style={styles.saveText}>Save</Text>
        </Pressable>

        <Text style={styles.note}>
          iOS will stop the camera the moment the screen is actually locked. To
          stream continuously, keep the app foreground — IVA prevents auto-lock
          while streaming. Background streaming via the audio entitlement is
          best-effort and not guaranteed by Apple.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16 },
  field: { gap: 6 },
  label: { color: "#9ca3af", fontSize: 13, fontWeight: "600" },
  input: {
    backgroundColor: "#111",
    color: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    fontSize: 16,
  },
  hint: { color: "#6b7280", fontSize: 12 },
  save: {
    backgroundColor: "#2563eb",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  saveText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  note: { color: "#9ca3af", fontSize: 12, marginTop: 16, lineHeight: 18 },
});
