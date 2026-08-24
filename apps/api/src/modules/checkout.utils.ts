export type SandboxConfirmGateInput = {
  nodeEnv: string;
  enableSandboxConfirm: boolean;
  hasAsaasApiKey: boolean;
  allowManualPaymentConfirmation: boolean;
};

export type SandboxConfirmGateResult =
  | { ok: true }
  | { ok: false; statusCode: 403 | 404; message: string };

/** Mirrors API rules for POST /checkout/confirm-sandbox. */
export function evaluateSandboxConfirmGate(input: SandboxConfirmGateInput): SandboxConfirmGateResult {
  if (input.nodeEnv === "production" || !input.enableSandboxConfirm) {
    return { ok: false, statusCode: 404, message: "Recurso não encontrado." };
  }
  if (input.hasAsaasApiKey && !input.allowManualPaymentConfirmation) {
    return {
      ok: false,
      statusCode: 403,
      message: "Confirmação manual disponível apenas no sandbox local sem Asaas configurado."
    };
  }
  return { ok: true };
}

export function asaasCheckoutItemName(productLabel: string, brandName = "App Treino Social") {
  return `${brandName} - ${productLabel}`;
}

export function asaasCheckoutItemDescription(userName: string, brandName = "App Treino Social") {
  return `Assinatura ${brandName} - ${userName}`;
}
