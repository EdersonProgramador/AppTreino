import { isExpoGo } from "../trackPlayer";

type WebrtcModule = typeof import("react-native-webrtc");

export type WebrtcRuntime = {
  RTCPeerConnection: WebrtcModule["RTCPeerConnection"];
  RTCIceCandidate: WebrtcModule["RTCIceCandidate"];
  RTCSessionDescription: WebrtcModule["RTCSessionDescription"];
  RTCView: WebrtcModule["RTCView"];
  mediaDevices: WebrtcModule["mediaDevices"];
};

let runtime: WebrtcRuntime | null | undefined;

/**
 * Carrega o react-native-webrtc sob demanda, como `trackPlayer.ts` faz com o
 * player nativo. Importar no topo derrubaria o app inteiro no Expo Go, que não
 * traz o módulo — assim só a tela de live fica indisponível.
 */
export function getWebrtcRuntime(): WebrtcRuntime | null {
  if (runtime !== undefined) return runtime;
  if (isExpoGo()) {
    runtime = null;
    return null;
  }
  try {
    const mod = require("react-native-webrtc") as WebrtcModule;
    runtime = {
      RTCPeerConnection: mod.RTCPeerConnection,
      RTCIceCandidate: mod.RTCIceCandidate,
      RTCSessionDescription: mod.RTCSessionDescription,
      RTCView: mod.RTCView,
      mediaDevices: mod.mediaDevices
    };
    return runtime;
  } catch {
    runtime = null;
    return null;
  }
}
