import { getCpfFieldValidation, type CpfValidationState } from "@app-treino/shared";

type CpfFieldFeedbackProps = {
  value: string;
  showStatus?: boolean;
  errorMessage?: string | null;
  idleHint?: string;
};

export type CpfFieldTone = "idle" | "valid" | "incomplete" | "invalid";

export function resolveCpfFieldTone(state: CpfValidationState): CpfFieldTone {
  if (state === "valid") return "valid";
  if (state === "incomplete") return "incomplete";
  if (state === "invalid") return "invalid";
  return "idle";
}

export function buildCpfInputClassName(
  baseClass: "ui-input" | "native-checkout__input",
  validation: ReturnType<typeof getCpfFieldValidation>,
  showStatus: boolean
) {
  if (!showStatus) return baseClass;
  const tone = resolveCpfFieldTone(validation.state);
  if (tone === "idle") return baseClass;
  return `${baseClass} ${baseClass}--${tone}`;
}

export function CpfFieldFeedback({
  value,
  showStatus = false,
  errorMessage = null,
  idleHint = "Informe os 11 dígitos do CPF."
}: CpfFieldFeedbackProps) {
  const validation = getCpfFieldValidation(value);
  const resolvedMessage = errorMessage ?? validation.message;
  const tone = resolveCpfFieldTone(validation.state);

  if (!showStatus && !errorMessage) {
    return <span className="cpf-field-feedback cpf-field-feedback--idle">{idleHint}</span>;
  }

  if (tone === "idle") {
    return <span className="cpf-field-feedback cpf-field-feedback--idle">{resolvedMessage}</span>;
  }

  return (
    <span
      className={`cpf-field-feedback cpf-field-feedback--${tone}`}
      role={tone === "valid" ? "status" : "alert"}
      aria-live="polite"
    >
      {resolvedMessage}
    </span>
  );
}
