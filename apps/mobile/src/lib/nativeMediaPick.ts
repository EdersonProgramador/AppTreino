import { Alert, Linking, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Camera } from "expo-camera";
import { uploadPickerAsset } from "./uploadMedia";
import type { NativeCameraCapture } from "../components/NativeCameraModal";

export type PickedUpload = {
  url: string;
  type: "IMAGE" | "VIDEO";
  localUri: string;
};

function openSettingsHint(kind: "camera" | "library" | "mic") {
  const label = kind === "camera" ? "câmera" : kind === "mic" ? "microfone" : "galeria";
  Alert.alert(
    "Permissão necessária",
    `Permita o acesso à ${label} nas configurações do aparelho para continuar.`,
    [
      { text: "Cancelar", style: "cancel" },
      { text: "Abrir ajustes", onPress: () => void Linking.openSettings() }
    ]
  );
}

/** Normalized gallery options — H.264 on iOS, legacy picker on Android Expo Go. */
const videoOptions: ImagePicker.ImagePickerOptions = {
  videoMaxDuration: 60,
  videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
  videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
  preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible
};

function androidLegacyOptions(): Partial<ImagePicker.ImagePickerOptions> {
  return Platform.OS === "android" ? { legacy: true } : {};
}

export async function ensureCameraAccess(needMic: boolean) {
  let camGranted = false;
  try {
    const cam = await Camera.requestCameraPermissionsAsync();
    camGranted = cam.granted;
  } catch {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    camGranted = cam.granted;
  }
  if (!camGranted) {
    openSettingsHint("camera");
    return false;
  }
  if (needMic) {
    let micGranted = false;
    try {
      const mic = await Camera.requestMicrophonePermissionsAsync();
      micGranted = mic.granted;
    } catch {
      micGranted = true;
    }
    if (!micGranted) {
      openSettingsHint("mic");
      return false;
    }
  }
  return true;
}

export async function ensureLibraryAccess() {
  const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!lib.granted) {
    openSettingsHint("library");
    return false;
  }
  return true;
}

export async function pickFeedMedia(params: {
  token: string;
  forStory?: boolean;
  remainingSlots: number;
  uploadPath?: string;
}): Promise<PickedUpload[]> {
  const ok = await ensureLibraryAccess();
  if (!ok) return [];
  const forStory = Boolean(params.forStory);
  let result: ImagePicker.ImagePickerResult;
  try {
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.8,
      allowsMultipleSelection: !forStory,
      selectionLimit: forStory ? 1 : Math.max(1, params.remainingSlots),
      ...videoOptions,
      ...androidLegacyOptions()
    });
  } catch (err) {
    Alert.alert("Galeria", err instanceof Error ? err.message : "Não foi possível abrir a galeria.");
    return [];
  }
  if (result.canceled || !result.assets?.length) return [];

  const uploads: PickedUpload[] = [];
  const path = params.uploadPath || "/student/social/uploads";
  for (const asset of result.assets.slice(0, forStory ? 1 : params.remainingSlots)) {
    try {
      const { uploaded, mediaType } = await uploadPickerAsset<{ file: { url: string } }>(
        path,
        asset,
        params.token,
        forStory ? "story" : "feed"
      );
      uploads.push({ url: uploaded.file.url, type: mediaType, localUri: asset.uri });
    } catch (err) {
      Alert.alert("Upload", err instanceof Error ? err.message : "Falha ao enviar o arquivo.");
    }
  }
  return uploads;
}

/** Upload de captura da NativeCameraModal (in-app). */
export async function uploadCameraCapture(params: {
  token: string;
  capture: NativeCameraCapture;
  forStory?: boolean;
  uploadPath?: string;
  fallbackBase?: string;
}): Promise<PickedUpload | null> {
  try {
    const { uploaded, mediaType } = await uploadPickerAsset<{ file: { url: string } }>(
      params.uploadPath || "/student/social/uploads",
      {
        uri: params.capture.uri,
        fileName: params.capture.fileName,
        mimeType: params.capture.mimeType,
        type: params.capture.type === "VIDEO" ? "video" : "image"
      },
      params.token,
      params.fallbackBase || (params.forStory ? "story-cam" : "camera")
    );
    return { url: uploaded.file.url, type: mediaType, localUri: params.capture.uri };
  } catch (err) {
    Alert.alert("Upload", err instanceof Error ? err.message : "Falha ao enviar a captura.");
    return null;
  }
}
