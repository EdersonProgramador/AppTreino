import { useEffect, useState, type ReactNode } from "react";
import {
  Image,
  StyleSheet,
  View,
  type ImageResizeMode,
  type ImageStyle,
  type StyleProp,
  type ViewStyle
} from "react-native";
import { mediaUrl } from "./media";

/**
 * Imagem remota que degrada sem quebrar o layout: quando a URL falta ou o
 * carregamento falha, ocupa o mesmo espaço com um bloco neutro em vez de sumir.
 */
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

  if (!resolved || failed) {
    return (
      <View style={[style as StyleProp<ViewStyle>, styles.placeholder]}>{fallback}</View>
    );
  }

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

const styles = StyleSheet.create({
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(127,127,127,0.16)",
    overflow: "hidden"
  }
});
