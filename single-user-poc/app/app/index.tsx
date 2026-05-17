import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useRouter } from "expo-router";
import { loadSettings, type Settings } from "@/settings";
import { postFrame } from "@/api";
import { registerForPush, subscribeWake } from "@/notifications";
import { startBackgroundAudio, stopBackgroundAudio } from "@/silentAudio";

type Status = "idle" | "streaming" | "error";

export default function Home() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [stats, setStats] = useState({ frames: 0, bytes: 0, lastStatus: 0, errors: 0 });
  const [pushToken, setPushToken] = useState<string | null>(null);

  const cameraRef = useRef<CameraView | null>(null);
  const loopRef = useRef<NodeJS.Timeout | null>(null);
  const busyRef = useRef(false);
  const streamingRef = useRef(false);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  useEffect(() => {
    if (!permission?.granted) return;
    registerForPush().then(setPushToken).catch(() => setPushToken(null));
    const unsub = subscribeWake(() => {
      if (!streamingRef.current) start();
    });
    return unsub;
  }, [permission?.granted]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active" && streamingRef.current === false && settings && permission?.granted) {
        // Resume on foreground if it was meant to be streaming.
      }
    });
    return () => sub.remove();
  }, [settings, permission?.granted]);

  const captureOnce = useCallback(async (s: Settings) => {
    if (busyRef.current || !cameraRef.current) return;
    busyRef.current = true;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: s.quality,
        base64: true,
        skipProcessing: true,
        shutterSound: false,
        exif: false,
      });
      if (!photo?.base64) return;
      const res = await postFrame(s.apiUrl, s.cameraId, photo.base64);
      setStats((p) => ({
        frames: p.frames + 1,
        bytes: p.bytes + res.bytes,
        lastStatus: res.status,
        errors: p.errors + (res.ok ? 0 : 1),
      }));
    } catch {
      setStats((p) => ({ ...p, errors: p.errors + 1 }));
    } finally {
      busyRef.current = false;
    }
  }, []);

  const start = useCallback(async () => {
    if (!settings || !settings.apiUrl) {
      router.push("/settings");
      return;
    }
    if (streamingRef.current) return;
    streamingRef.current = true;
    setStatus("streaming");
    await activateKeepAwakeAsync("iva-stream");
    try {
      await startBackgroundAudio();
    } catch {
      // Non-fatal: keepAwake alone still works while screen is on.
    }
    loopRef.current = setInterval(() => captureOnce(settings), settings.intervalMs);
  }, [settings, captureOnce, router]);

  const stop = useCallback(async () => {
    streamingRef.current = false;
    setStatus("idle");
    if (loopRef.current) {
      clearInterval(loopRef.current);
      loopRef.current = null;
    }
    deactivateKeepAwake("iva-stream");
    await stopBackgroundAudio().catch(() => {});
  }, []);

  useEffect(() => () => void stop(), [stop]);

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>Camera permission is required.</Text>
        <Pressable style={styles.button} onPress={() => requestPermission()}>
          <Text style={styles.buttonText}>Grant access</Text>
        </Pressable>
      </View>
    );
  }

  if (!settings) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        mode="picture"
        active
        autofocus="on"
      />

      <View style={styles.overlay}>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.dot,
              status === "streaming" ? styles.dotOn : styles.dotOff,
            ]}
          />
          <Text style={styles.statusText}>
            {status === "streaming" ? "Streaming" : "Idle"} · {settings.cameraId}
          </Text>
        </View>

        <View style={styles.statsBox}>
          <Text style={styles.stat}>frames: {stats.frames}</Text>
          <Text style={styles.stat}>
            sent: {(stats.bytes / 1024).toFixed(1)} KiB
          </Text>
          <Text style={styles.stat}>
            last: HTTP {stats.lastStatus || "—"} · errors: {stats.errors}
          </Text>
          {pushToken ? (
            <Text style={styles.token} numberOfLines={1}>
              apns: {pushToken}
            </Text>
          ) : (
            <Text style={styles.token}>apns: (not registered)</Text>
          )}
        </View>

        <View style={styles.buttonRow}>
          {status === "streaming" ? (
            <Pressable style={[styles.button, styles.stopButton]} onPress={stop}>
              <Text style={styles.buttonText}>Stop</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.button} onPress={start}>
              <Text style={styles.buttonText}>Start streaming</Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.button, styles.secondary]}
            onPress={() => router.push("/settings")}
          >
            <Text style={styles.buttonText}>Settings</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  center: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
  },
  camera: { ...StyleSheet.absoluteFillObject },
  overlay: {
    flex: 1,
    padding: 16,
    justifyContent: "space-between",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotOn: { backgroundColor: "#22c55e" },
  dotOff: { backgroundColor: "#666" },
  statusText: { color: "#fff", fontWeight: "600" },
  statsBox: {
    backgroundColor: "rgba(0,0,0,0.55)",
    padding: 12,
    borderRadius: 12,
    alignSelf: "flex-start",
    gap: 4,
  },
  stat: { color: "#fff", fontVariant: ["tabular-nums"] },
  token: { color: "#9ca3af", fontSize: 11, maxWidth: 280 },
  buttonRow: { flexDirection: "row", gap: 12 },
  button: {
    flex: 1,
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  stopButton: { backgroundColor: "#dc2626" },
  secondary: { backgroundColor: "#374151" },
  buttonText: { color: "#fff", fontWeight: "700" },
  text: { color: "#fff", textAlign: "center" },
});
