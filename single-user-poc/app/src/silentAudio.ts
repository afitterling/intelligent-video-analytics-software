import { Audio, InterruptionModeIOS } from "expo-av";

let sound: Audio.Sound | null = null;

export async function startBackgroundAudio(): Promise<void> {
  if (sound) return;
  await Audio.setAudioModeAsync({
    playsInSilentModeIOS: true,
    staysActiveInBackground: true,
    interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
    shouldDuckAndroid: false,
  });
  const { sound: s } = await Audio.Sound.createAsync(
    require("../assets/silence.m4a"),
    { shouldPlay: true, isLooping: true, volume: 0.0 },
  );
  sound = s;
}

export async function stopBackgroundAudio(): Promise<void> {
  if (!sound) return;
  try {
    await sound.stopAsync();
    await sound.unloadAsync();
  } finally {
    sound = null;
  }
}
