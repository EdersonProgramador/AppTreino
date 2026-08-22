import { useEffect, useState, type ReactNode } from "react";
import { Image, type ImageResizeMode, type ImageStyle, type StyleProp } from "react-native";
import { mediaUrl } from "./media";

export function MediaImage({
  uri,
  style,
  resizeMode = "cover",
  fallback
}: {
  uri?: string | null;
  style?: StyleProp<ImageStyle>;
  resizeMode?: ImageResizeMode;
  fallback?: ReactNode;
}) {
  const resolved = mediaUrl(uri);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [resolved]);

  if (!resolved || failed) return fallback ?? null;

  return (
    <Image
      accessibilityIgnoresInvertColors
      source={{ uri: resolved }}
      style={style}
      resizeMode={resizeMode}
      onError={() => setFailed(true)}
    />
  );
}
