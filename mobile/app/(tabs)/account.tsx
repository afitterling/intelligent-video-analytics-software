import { Button, Text, View } from "react-native";
import { useAuth } from "~/auth";

export default function Account() {
  const { session, logout } = useAuth();
  return (
    <View style={{ padding: 20, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "600" }}>Account</Text>
      <Text>{session?.email}</Text>
      <Button title="Sign out" onPress={logout} />
    </View>
  );
}
