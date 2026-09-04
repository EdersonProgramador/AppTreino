export function normalizeCpfDigits(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 14);
}

export function formatCpf(value: string) {
  const digits = normalizeCpfDigits(value).slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function isValidCpf(raw: string | null | undefined) {
  const cpf = normalizeCpfDigits(raw).slice(0, 11);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1+$/.test(cpf)) return false;

  let sum = 0;
  for (let index = 0; index < 9; index += 1) {
    sum += Number(cpf[index]) * (10 - index);
  }
  let check = (sum * 10) % 11;
  if (check === 10) check = 0;
  if (check !== Number(cpf[9])) return false;

  sum = 0;
  for (let index = 0; index < 10; index += 1) {
    sum += Number(cpf[index]) * (11 - index);
  }
  check = (sum * 10) % 11;
  if (check === 10) check = 0;
  return check === Number(cpf[10]);
}

export type CpfValidationState = "empty" | "incomplete" | "invalid" | "valid";

export function resolveCpfValidationState(raw: string | null | undefined): CpfValidationState {
  const digits = normalizeCpfDigits(raw);
  if (digits.length === 0) return "empty";
  if (digits.length < 11) return "incomplete";
  if (!isValidCpf(digits)) return "invalid";
  return "valid";
}

export function getCpfValidationMessage(state: CpfValidationState, digits = 0) {
  switch (state) {
    case "empty":
      return "Informe seu CPF.";
    case "incomplete": {
      const missing = Math.max(11 - digits, 1);
      return missing === 1
        ? "CPF incompleto — falta 1 dígito."
        : `CPF incompleto — faltam ${missing} dígitos.`;
    }
    case "invalid":
      return "CPF inválido — confira os números digitados.";
    case "valid":
      return "CPF válido.";
  }
}

export function getCpfFieldValidation(raw: string | null | undefined) {
  const digits = normalizeCpfDigits(raw).length;
  const state = resolveCpfValidationState(raw);
  return {
    state,
    message: getCpfValidationMessage(state, digits),
    isValid: state === "valid"
  };
}
