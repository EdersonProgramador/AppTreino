import { brand } from "./brand";

const PLACEHOLDER_CNPJ_DIGITS = "00000000000100";

function normalizeCnpj(value: string) {
  return value.replace(/\D/g, "");
}

/** CNPJ real configurado em VITE_LEGAL_CNPJ (vazio ou placeholder = oculto no site). */
export function isLegalIdentityPublic(cnpj = legalMeta.cnpj) {
  const digits = normalizeCnpj(cnpj);
  return digits.length > 0 && digits !== PLACEHOLDER_CNPJ_DIGITS;
}

/** Nome exibido publicamente: razão social quando regularizado, senão a marca do produto. */
export function legalPublicOperatorName() {
  return isLegalIdentityPublic() ? legalMeta.companyName : brand.name;
}

/** Linha de metadados das páginas legais (sem CNPJ enquanto não regularizado). */
export function legalDocumentSubtitle() {
  const parts = [legalPublicOperatorName()];
  if (isLegalIdentityPublic()) {
    parts.push(`CNPJ ${legalMeta.cnpj}`);
  }
  parts.push(`Atualizado em ${legalMeta.lastUpdated}`);
  return parts.join(" · ");
}

/** Textos legais públicos — preencher VITE_LEGAL_* após regularização societária. */
export const legalMeta = {
  companyName: import.meta.env.VITE_LEGAL_COMPANY_NAME?.trim() || brand.legalName,
  cnpj: import.meta.env.VITE_LEGAL_CNPJ?.trim() || "",
  contactEmail: import.meta.env.VITE_LEGAL_CONTACT_EMAIL?.trim() || "contato@atlly.com.br",
  dpoEmail: import.meta.env.VITE_LEGAL_DPO_EMAIL?.trim() || "privacidade@atlly.com.br",
  lastUpdated: "30 de agosto de 2026"
} as const;

export const refundPolicyHighlights = [
  "Assinatura digital: garantia de 7 dias após a primeira cobrança confirmada, mediante solicitação por e-mail.",
  "Produtos físicos da vitrine: troca ou devolução em até 7 dias corridos após o recebimento, conforme CDC, desde que o item esteja intacto.",
  "Reembolsos aprovados são processados no mesmo meio de pagamento em até 10 dias úteis após a confirmação administrativa."
] as const;
