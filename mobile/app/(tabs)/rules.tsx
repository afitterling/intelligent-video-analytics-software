import { useEffect, useState } from "react";
import { Alert, Button, FlatList, Switch, Text, TextInput, View } from "react-native";
import { useAuth } from "~/auth";

const LABELS = ["Person", "Vehicle", "Animal", "Pet", "Weapon", "Fire", "Smoke", "Package"];

interface Rule {
  ruleId: string;
  name: string;
  deviceId: string;
  detect: string[];
  minConfidence: number;
  action: { type: "email" | "webhook" | "log"; to?: string; url?: string };
  enabled: boolean;
}

interface Device { deviceId: string; name: string }

export default function Rules() {
  const { authedFetch, session } = useAuth();
  const [rules, setRules] = useState<Rule[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);

  const [name, setName] = useState("");
  const [deviceId, setDeviceId] = useState("*");
  const [detect, setDetect] = useState<string[]>(["Person"]);
  const [minConfidence, setMinConfidence] = useState("75");
  const [actionType, setActionType] = useState<Rule["action"]["type"]>("email");
  const [target, setTarget] = useState(session?.email ?? "");

  const load = async () => {
    const [r, d] = await Promise.all([
      authedFetch<{ rules: Rule[] }>("/rules"),
      authedFetch<{ devices: Device[] }>("/devices"),
    ]);
    setRules(r.rules);
    setDevices(d.devices);
  };

  useEffect(() => { load().catch((e) => Alert.alert("load", String(e))); }, []);

  const toggleDetect = (l: string) =>
    setDetect((cur) => cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l]);

  const create = async () => {
    if (!name || !detect.length) return;
    const action =
      actionType === "email" ? { type: "email", to: target }
      : actionType === "webhook" ? { type: "webhook", url: target }
      : { type: "log" };
    try {
      await authedFetch("/rules", {
        method: "POST",
        body: { name, deviceId, detect, minConfidence: Number(minConfidence), action },
      });
      setName(""); setDetect(["Person"]);
      load();
    } catch (e) { Alert.alert("create", e instanceof Error ? e.message : String(e)); }
  };

  const toggle = async (r: Rule) => {
    await authedFetch(`/rules/${r.ruleId}`, { method: "PUT", body: { enabled: !r.enabled } });
    load();
  };

  const remove = async (r: Rule) => {
    await authedFetch(`/rules/${r.ruleId}`, { method: "DELETE" });
    load();
  };

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 22, fontWeight: "600" }}>Rules</Text>

      <FlatList
        data={rules}
        keyExtractor={(r) => r.ruleId}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: "#eee" }} />}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: 10, flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16 }}>{item.name}</Text>
              <Text style={{ color: "#888" }}>
                {item.detect.join(", ")} → {item.action.type}
                {item.action.type === "email" ? `: ${item.action.to}` : ""}
                {item.action.type === "webhook" ? `: ${item.action.url}` : ""}
              </Text>
            </View>
            <Switch value={item.enabled} onValueChange={() => toggle(item)} />
            <Button title="✕" onPress={() => remove(item)} />
          </View>
        )}
        ListEmptyComponent={<Text style={{ color: "#888" }}>No rules yet.</Text>}
      />

      <Text style={{ fontWeight: "600", marginTop: 12 }}>New rule</Text>
      <TextInput placeholder="Name" value={name} onChangeText={setName} style={input} />

      <Text style={{ marginTop: 6 }}>Device:</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <Chip selected={deviceId === "*"} onPress={() => setDeviceId("*")} label="All" />
        {devices.map((d) => (
          <Chip key={d.deviceId} label={d.name} selected={deviceId === d.deviceId}
            onPress={() => setDeviceId(d.deviceId)} />
        ))}
      </View>

      <Text style={{ marginTop: 6 }}>Detect:</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {LABELS.map((l) => (
          <Chip key={l} label={l} selected={detect.includes(l)} onPress={() => toggleDetect(l)} />
        ))}
      </View>

      <TextInput placeholder="Min confidence" value={minConfidence} keyboardType="numeric"
        onChangeText={setMinConfidence} style={input} />

      <Text style={{ marginTop: 6 }}>Action:</Text>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {(["email","webhook","log"] as const).map((t) => (
          <Chip key={t} label={t} selected={actionType === t} onPress={() => setActionType(t)} />
        ))}
      </View>
      {actionType !== "log" && (
        <TextInput placeholder={actionType === "email" ? "email" : "https://..."}
          value={target} onChangeText={setTarget} style={input} autoCapitalize="none" />
      )}

      <View style={{ marginTop: 10 }}>
        <Button title="Create rule" onPress={create} />
      </View>
    </View>
  );
}

const input = { borderWidth: 1, borderColor: "#ccc", padding: 8, borderRadius: 6, marginTop: 6 } as const;

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Text
      onPress={onPress}
      style={{
        paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
        backgroundColor: selected ? "#3b82f6" : "#eee", color: selected ? "white" : "black",
      }}>
      {label}
    </Text>
  );
}
