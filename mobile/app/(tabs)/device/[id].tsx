import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Button, ScrollView, Text, TextInput, View } from "react-native";
import Video from "react-native-video";
import { useAuth } from "~/auth";

interface Device {
  deviceId: string;
  name: string;
  location?: string;
  status: string;
  streamName: string;
}

export default function DeviceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { authedFetch } = useAuth();
  const [device, setDevice] = useState<Device | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [name, setName] = useState("");

  const load = async () => {
    const r = await authedFetch<{ device: Device }>(`/devices/${id}`);
    setDevice(r.device);
    setName(r.device.name);
  };

  useEffect(() => { load().catch((e) => Alert.alert("load failed", String(e))); }, [id]);

  const watchLive = async () => {
    try {
      const r = await authedFetch<{ url: string }>(`/devices/${id}/viewer-url`);
      setViewerUrl(r.url);
    } catch (e) { Alert.alert("viewer", e instanceof Error ? e.message : String(e)); }
  };

  const save = async () => {
    await authedFetch(`/devices/${id}`, { method: "PUT", body: { name } });
    load();
  };

  const rotate = async () => {
    const r = await authedFetch<{ registrationToken: string }>(`/devices/${id}/rotate-token`, { method: "POST" });
    setNewToken(r.registrationToken);
  };

  const remove = () => {
    Alert.alert("Delete device?", "Stream and detections will be gone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          await authedFetch(`/devices/${id}`, { method: "DELETE" });
          router.back();
        },
      },
    ]);
  };

  if (!device) return <View style={{ padding: 20 }}><Text>Loading…</Text></View>;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "600" }}>{device.name}</Text>
      <Text style={{ color: "#888" }}>{device.status}</Text>

      {viewerUrl ? (
        <Video source={{ uri: viewerUrl }} style={{ width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" }} controls />
      ) : (
        <Button title="Watch live" onPress={watchLive} />
      )}

      <Text style={{ fontWeight: "600", marginTop: 12 }}>Edit</Text>
      <TextInput value={name} onChangeText={setName}
        style={{ borderWidth: 1, borderColor: "#ccc", padding: 8, borderRadius: 6 }} />
      <Button title="Save" onPress={save} />

      <Text style={{ fontWeight: "600", marginTop: 12 }}>Registration token</Text>
      <Button title="Rotate" onPress={rotate} />
      {newToken && (
        <Text selectable style={{ fontFamily: "Courier", padding: 12, backgroundColor: "#eee" }}>
          {newToken}
        </Text>
      )}

      <View style={{ marginTop: 24 }}>
        <Button color="red" title="Delete device" onPress={remove} />
      </View>
    </ScrollView>
  );
}
