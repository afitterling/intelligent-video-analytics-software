import AsyncStorage from "@react-native-async-storage/async-storage";

export type Settings = {
  apiUrl: string;
  cameraId: string;
  intervalMs: number;
  quality: number;
};

const KEY = "iva.settings.v1";

export const DEFAULTS: Settings = {
  apiUrl: "",
  cameraId: "ios",
  intervalMs: 1000,
  quality: 0.5,
};

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(s));
}
