import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="devices" options={{ title: "Devices" }} />
      <Tabs.Screen name="rules" options={{ title: "Rules" }} />
      <Tabs.Screen name="account" options={{ title: "Account" }} />
    </Tabs>
  );
}
