import { LockKeyhole } from "lucide-react";

interface LockedOverlayProps {
  onCheckout: () => void;
}

export function LockedOverlay({ onCheckout }: LockedOverlayProps) {
  return (
    <article className="locked-overlay">
      <div className="locked-overlay-icon">
        <LockKeyhole size={34} />
      </div>
      <h2>Este treino esta bloqueado</h2>
      <p>Finalize a assinatura pendente para liberar o player e as funcionalidades do aluno.</p>
      <button className="primary-button" onClick={onCheckout}>
        Finalizar meu pagamento pendente
      </button>
    </article>
  );
}
