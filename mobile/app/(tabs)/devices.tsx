import { Link, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, FlatList, RefreshControl, Text, TextInput, View } from "react-native";
import { useAuth } from "~/auth";

interface Device {
  deviceId: string;
  name: string;
  location?: string;
  status: string;
  lastSeenAt?: string;
}

export default function Devices() {
  const { authedFetch } = useAuth();
  const router = useRouter();
  const [devices, setDevices] = useState<Device[]>([]);
  const [name, setName] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await authedFetch<{ devices: Device[] }>("/devices");
      setDevices(r.devices);
    } catch (e) {
      Alert.alert("failed", e instanceof Error ? e.message : String(e));
    } finally { setRefreshing(false); }
  }, [authedFetch]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!name) return;
    try {
      const r = await authedFetch<{ device: Device; registrationToken: string }>("/devices", {
        method: "POST",
        body: { name },
      });
      setToken(r.registrationToken);
      setName("");
      load();
    } catch (e) {
      Alert.alert("create failed", e instanceof Error ? e.message : String(e));
    }
  };

  if (token) {
    return (
      <View style={{ padding: 20, gap: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: "600" }}>Registration token</Text>
        <Text>Paste this into the macOS agent. It will not be shown again.</Text>
        <Text selectable style={{ fontFamily: "Courier", padding: 12, backgroundColor: "#eee" }}>
          {token}
        </Text>
        <Button title="Done" onPress={() => setToken(null)} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 22, fontWeight: "600" }}>Devices</Text>
      <View style={{ flexDirection: "row", gap: 8, marginVertical: 12 }}>
        <TextInput placeholder="Device name" value={name} onChangeText={setName}
          style={{ flex: 1, borderWidth: 1, borderColor: "#ccc", padding: 8, borderRadius: 6 }} />
        <Button title="+ Add" onPress={create} />
      </View>
      <FlatList
        data={devices}
        keyExtractor={(d) => d.deviceId}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: "#eee" }} />}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: 12 }}>
            <Link href={{ pathname: "/(tabs)/device/[id]", params: { id: item.deviceId } }}>
              <Text style={{ fontSize: 16 }}>{item.name}</Text>
            </Link>
            <Text style={{ color: "#888" }}>{item.status} · {item.lastSeenAt ?? "never seen"}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={{ color: "#888" }}>No devices yet.</Text>}
      />
    </View>
  );
}
