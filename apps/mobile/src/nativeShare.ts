import { Alert, Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";

function cleanBase64(raw: string) {
  const value = String(raw || "").trim();
  const comma = value.indexOf(",");
  return comma >= 0 ? value.slice(comma + 1) : value.replace(/^data:image\/\w+;base64,/, "");
}

function base64ToBytes(raw: string) {
  const cleaned = cleanBase64(raw).replace(/\s/g, "");
  const binary = globalThis.atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function writeTempPng(base64: string, filename = "treino-pago.png") {
  const safeName = filename.replace(/[^\w.\-]+/g, "_") || "treino-pago.png";
  const uniqueName = `${Date.now()}-${safeName}`;
  const file = new File(Paths.cache, uniqueName);
  file.create();
  // Native write aceita 1 arg (string | Uint8Array); options de encoding quebram no iOS.
  file.write(base64ToBytes(base64));
  return file.uri;
}

export async function downloadWorkoutImage(
  base64: string,
  filename = "treino-pago.png",
  options: { fallbackShare?: boolean; notify?: boolean } = {}
) {
  const path = writeTempPng(base64, filename);
  const permission = await MediaLibrary.requestPermissionsAsync();
  if (permission.granted) {
    await MediaLibrary.saveToLibraryAsync(path);
    if (options.notify !== false) {
      Alert.alert("Imagem salva", "A imagem do treino foi salva na galeria.");
    }
    return;
  }

  if (options.fallbackShare !== false && (await Sharing.isAvailableAsync())) {
    await Sharing.shareAsync(path, {
      mimeType: "image/png",
      UTI: "public.png",
      dialogTitle: "Salvar imagem do treino"
    });
    return;
  }

  throw new Error("Sem permissão para salvar a imagem.");
}

export async function shareWorkoutImage(base64: string, filename = "treino-pago.png", dialogTitle?: string) {
  const path = writeTempPng(base64, filename);
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error(
      Platform.OS === "web"
        ? "Compartilhamento indisponível neste ambiente."
        : "Compartilhamento indisponível neste aparelho."
    );
  }
  await Sharing.shareAsync(path, {
    mimeType: "image/png",
    UTI: "public.png",
    dialogTitle: dialogTitle || "Compartilhar treino"
  });
}
