import { getCpfFieldValidation } from "@app-treino/shared";

type CpfFieldFeedbackProps = {
  value: string;
  showStatus?: boolean;
  errorMessage?: string | null;
  idleHint?: string;
};

export function CpfFieldFeedback({
  value,
  showStatus = false,
  errorMessage = null,
  idleHint = "Informe os 11 dígitos do CPF."
}: CpfFieldFeedbackProps) {
  const validation = getCpfFieldValidation(value);
  const resolvedMessage = errorMessage ?? validation.message;
  const isValid = !errorMessage && validation.isValid;

  if (!showStatus && !errorMessage) {
    return <span className="cpf-field-feedback cpf-field-feedback--idle">{idleHint}</span>;
  }

  return (
    <span
      className={`cpf-field-feedback${isValid ? " cpf-field-feedback--valid" : " cpf-field-feedback--invalid"}`}
      role={isValid ? "status" : "alert"}
      aria-live="polite"
    >
      {resolvedMessage}
    </span>
  );
}
