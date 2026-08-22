import { playSound, type LibrarySoundName } from "react-sounds";
import { Howler } from "howler";
import { useUiPrefsStore } from "../stores/uiPrefsStore";

function unlockWebAudio() {
  try {
    const ctx = Howler.ctx;
    if (ctx && ctx.state === "suspended") {
      void ctx.resume();
    }
  } catch {
    // Autoplay ainda bloqueado — o próximo clique tenta de novo.
  }
}

/** Toca som de UI somente se efeitos sonoros estiverem liberados. */
export const playUiSound = (name: LibrarySoundName, volume = 0.45) => {
  if (!useUiPrefsStore.getState().soundEnabled) return;
  unlockWebAudio();
  void playSound(name, { volume }).catch(() => {
    // Ignora falhas de autoplay/CDN — a UI continua sem áudio.
  });
};

export const uiSounds = {
  /** Estado vazio / cancelamento sem efeito. */
  void: () => playUiSound("game/void"),
  error: () => playUiSound("notification/error"),
  popupNotify: () => playUiSound("notification/popup"),
  success: () => playUiSound("notification/success"),
  bootUp: () => playUiSound("system/boot_up"),
  /** Pagamento aprovado / acesso conectado. */
  paymentApproved: () => playUiSound("system/device_connect"),
  /** Pagamento cancelado/recusado ou logout. */
  paymentDisconnected: () => playUiSound("system/device_disconnect"),
  disconnect: () => playUiSound("system/device_disconnect"),
  screenshot: () => playUiSound("system/screenshot"),
  trash: () => playUiSound("system/trash"),
  blocked: () => playUiSound("ui/blocked"),
  /** Aviso suave (ex.: limite de estoque). */
  warning: () => playUiSound("notification/warning"),
  info: () => playUiSound("notification/info"),
  /** Mudança de página genérica. */
  pageChange: () => playUiSound("ui/button_soft"),
  /** Troca de páginas no portal do aluno. */
  studentPage: () => playUiSound("ui/keystroke_soft"),
  itemSelect: () => playUiSound("ui/item_select"),
  itemDeselect: () => playUiSound("ui/item_deselect"),
  popupOpen: () => playUiSound("ui/popup_open"),
  popupClose: () => playUiSound("ui/popup_close"),
  radioSelect: () => playUiSound("ui/radio_select"),
  /** Enviar / submeter treino. */
  submit: () => playUiSound("ui/submit"),
  /** Concluir treino. */
  workoutComplete: () => playUiSound("ui/success_chime"),
  toggleOn: () => playUiSound("ui/toggle_on"),
  toggleOff: () => playUiSound("ui/toggle_off"),
  click: () => playUiSound("ui/button_soft"),
  nav: () => playUiSound("ui/keystroke_soft"),
  open: () => playUiSound("ui/popup_open"),
  close: () => playUiSound("ui/popup_close"),
  complete: () => playUiSound("ui/success_chime"),
  /** Início do arraste na barra de progresso da música. */
  musicSeekStart: () => playUiSound("ui/keystroke_soft", 0.22),
  /** Tick suave ao cruzar marcos durante o arraste. */
  musicSeekTick: () => playUiSound("ui/item_select", 0.16),
  /** Confirmação ao soltar / buscar posição na faixa. */
  musicSeekCommit: () => playUiSound("ui/radio_select", 0.28)
} as const;

export const ALL_UI_SOUND_PRELOAD: LibrarySoundName[] = [
  "game/void",
  "notification/error",
  "notification/popup",
  "notification/success",
  "system/boot_up",
  "system/device_connect",
  "system/device_disconnect",
  "system/screenshot",
  "system/trash",
  "ui/blocked",
  "notification/warning",
  "notification/info",
  "ui/button_soft",
  "ui/item_select",
  "ui/item_deselect",
  "ui/keystroke_soft",
  "ui/popup_close",
  "ui/popup_open",
  "ui/radio_select",
  "ui/submit",
  "ui/success_chime",
  "ui/toggle_on",
  "ui/toggle_off"
];
