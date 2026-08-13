import { useEffect } from "react";
import { LockKeyhole } from "lucide-react";
import { uiSounds } from "../../lib/ui-sounds";

interface LockedOverlayProps {
  onCheckout: () => void;
}

export const LockedOverlay = ({ onCheckout }: LockedOverlayProps) => {
  useEffect(() => {
    uiSounds.blocked();
  }, []);

  return (
    <article className="student-locked-hero mb-[18px] grid max-w-[760px] justify-items-center gap-3 rounded-xl border border-brand-gold/25 bg-[color:var(--app-panel)] p-[clamp(24px,5vw,38px)] text-center shadow-soft">
      <div className="grid h-[72px] w-[72px] place-items-center rounded-full border border-brand-gold/35 bg-brand-gold/10 text-brand-gold">
        <LockKeyhole size={34} />
      </div>
      <h2 className="font-display m-0 text-[clamp(28px,4vw,42px)] leading-tight text-sand">
        Este treino esta bloqueado
      </h2>
      <p className="mb-2 max-w-[520px] text-sand-muted leading-relaxed">
        Finalize a assinatura pendente para liberar o player e as funcionalidades do aluno.
      </p>
      <button
        className="primary-button"
        onClick={() => {
          uiSounds.click();
          onCheckout();
        }}
      >
        Finalizar meu pagamento pendente
      </button>
    </article>
  );
};
