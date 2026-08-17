type NativeBridgeWindow = Window & {
  ReactNativeWebView?: { postMessage: (message: string) => void };
};

export function isNativeAppShell() {
  if (typeof document === "undefined" || typeof navigator === "undefined") return false;
  return (
    document.documentElement.classList.contains("is-native-app") ||
    /AppTreinoMobile/i.test(navigator.userAgent || "")
  );
}

export function postNativeMessage(payload: Record<string, unknown>) {
  const bridge = (window as NativeBridgeWindow).ReactNativeWebView;
  if (!bridge?.postMessage) return false;
  bridge.postMessage(JSON.stringify(payload));
  return true;
}

export async function blobToBase64(blob: Blob) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler imagem."));
    reader.readAsDataURL(blob);
  });
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}
