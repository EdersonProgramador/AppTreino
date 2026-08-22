import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "apptreino.music.liked";

export async function readLikedIds() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [] as string[];
  }
}

export async function writeLikedIds(ids: string[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(ids));
}

export function toggleLikedId(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}
