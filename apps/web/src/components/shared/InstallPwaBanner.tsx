import { Download, Smartphone } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { shouldShowPwaInstallBanner, usePwaInstall } from "../../lib/pwa-install";
import { InstallPwaInstructions } from "./InstallPwaInstructions";

const SWIPE_DISMISS_PX = 72;

type Props = {
  /** Troca de aba/seção — banner volta após arrastar para o lado. */
  resetKey?: string;
};

export function InstallPwaBanner({ resetKey }: Props) {
  const pwa = usePwaInstall();
  const [snoozed, setSnoozed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const pointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    setSnoozed(false);
    setExpanded(false);
    setDragX(0);
  }, [resetKey]);

  if (!shouldShowPwaInstallBanner() || snoozed) return null;

  function snoozeBanner() {
    setSnoozed(true);
    setExpanded(false);
    setDragX(0);
  }

  async function handlePrimaryAction() {
    if (pwa.canInstall) {
      const ok = await pwa.promptInstall();
      if (ok) setSnoozed(true);
      return;
    }
    setExpanded(true);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (expanded) return;
    pointerIdRef.current = event.pointerId;
    startXRef.current = event.clientX;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging || pointerIdRef.current !== event.pointerId) return;
    setDragX(event.clientX - startXRef.current);
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerIdRef.current !== event.pointerId) return;
    const delta = event.clientX - startXRef.current;
    setDragging(false);
    pointerIdRef.current = null;
    if (Math.abs(delta) >= SWIPE_DISMISS_PX) {
      snoozeBanner();
      return;
    }
    setDragX(0);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  }

  const summary = pwa.iosInApp
    ? "Abra no Safari — depois Adicionar à Tela de Início."
    : pwa.iosDevice
      ? "Safari → Compartilhar → Adicionar à Tela de Início."
      : "Toque em Baixar app para instalar automaticamente.";

  if (expanded) {
    return (
      <div className="student-pwa-install-banner is-expanded" role="dialog" aria-label="Como instalar o ATLLY">
        <InstallPwaInstructions
          compact
          hints={pwa}
          onInstall={() => void handlePrimaryAction()}
          onClose={() => setExpanded(false)}
        />
        <p className="student-pwa-install-banner-hint">Arraste o aviso para o lado para ocultar por agora.</p>
      </div>
    );
  }

  const dismissStyle =
    Math.abs(dragX) >= SWIPE_DISMISS_PX
      ? { opacity: 0, transform: `translateX(${dragX}px)` }
      : { transform: `translateX(${dragX}px)`, transition: dragging ? "none" : "transform 0.25s ease, opacity 0.25s ease" };

  return (
    <div
      className={`student-pwa-install-banner${dragging ? " is-dragging" : ""}`}
      role="region"
      aria-label="Instalar ATLLY no celular"
      style={dismissStyle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <Smartphone size={20} className="student-pwa-install-banner-icon" aria-hidden="true" />
      <div className="student-pwa-install-banner-copy">
        <strong>Baixar app ATLLY</strong>
        <span>{summary}</span>
        <span className="student-pwa-install-banner-swipe">Arraste para o lado para ocultar</span>
      </div>
      <div className="student-pwa-install-banner-actions">
        <button
          type="button"
          className="student-pwa-install-banner-cta"
          disabled={pwa.installing}
          onClick={(event) => {
            event.stopPropagation();
            void handlePrimaryAction();
          }}
        >
          <Download size={16} aria-hidden="true" />
          {pwa.installing ? "…" : pwa.canInstall ? "Baixar app" : "Como instalar"}
        </button>
      </div>
    </div>
  );
}
