import { Alert, Linking } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Audio } from "expo-av";
import { uploadPickerAsset } from "./uploadMedia";

export type PickedUpload = {
  url: string;
  type: "IMAGE" | "VIDEO";
  localUri: string;
};

function openSettingsHint(kind: "camera" | "library" | "mic") {
  const label =
    kind === "camera"
      ? "câmera"
      : kind === "mic"
        ? "microfone"
        : "galeria";
  Alert.alert(
    "Permissão necessária",
    `Permita o acesso à ${label} nas configurações do aparelho para continuar.`,
    [
      { text: "Cancelar", style: "cancel" },
      { text: "Abrir ajustes", onPress: () => void Linking.openSettings() }
    ]
  );
}

const videoOptions: ImagePicker.ImagePickerOptions = {
  videoMaxDuration: 60,
  // Force H.264 on iOS instead of HEVC passthrough (breaks Android / many players).
  videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
  videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium
};

export async function ensureCameraAccess(needMic: boolean) {
  const cam = await ImagePicker.requestCameraPermissionsAsync();
  if (!cam.granted) {
    openSettingsHint("camera");
    return false;
  }
  if (needMic) {
    const mic = await Audio.requestPermissionsAsync();
    if (!mic.granted) {
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
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images", "videos"],
    quality: 0.8,
    allowsMultipleSelection: !forStory,
    selectionLimit: forStory ? 1 : Math.max(1, params.remainingSlots),
    ...videoOptions
  });
  if (result.canceled || !result.assets?.length) return [];

  const uploads: PickedUpload[] = [];
  const path = params.uploadPath || "/student/social/uploads";
  for (const asset of result.assets.slice(0, forStory ? 1 : params.remainingSlots)) {
    const { uploaded, mediaType } = await uploadPickerAsset<{ file: { url: string } }>(
      path,
      asset,
      params.token,
      forStory ? "story" : "feed"
    );
    uploads.push({ url: uploaded.file.url, type: mediaType, localUri: asset.uri });
  }
  return uploads;
}

export async function captureFeedMedia(params: {
  token: string;
  kind: "photo" | "video";
  forStory?: boolean;
  uploadPath?: string;
}): Promise<PickedUpload | null> {
  const needMic = params.kind === "video";
  const ok = await ensureCameraAccess(needMic);
  if (!ok) return null;

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: params.kind === "video" ? ["videos"] : ["images"],
    quality: 0.85,
    cameraType: ImagePicker.CameraType.back,
    ...videoOptions
  });
  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  const { uploaded, mediaType } = await uploadPickerAsset<{ file: { url: string } }>(
    params.uploadPath || "/student/social/uploads",
    asset,
    params.token,
    params.forStory ? "story-cam" : "camera"
  );
  return { url: uploaded.file.url, type: mediaType, localUri: asset.uri };
}
