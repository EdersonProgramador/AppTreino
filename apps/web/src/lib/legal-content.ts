import { brand } from "./brand";

/** Textos legais públicos — revisar CNPJ/endereço antes de operação comercial. */
export const legalMeta = {
  companyName: import.meta.env.VITE_LEGAL_COMPANY_NAME?.trim() || brand.legalName,
  cnpj: import.meta.env.VITE_LEGAL_CNPJ?.trim() || "00.000.000/0001-00",
  contactEmail: import.meta.env.VITE_LEGAL_CONTACT_EMAIL?.trim() || "contato@apptreino.com",
  dpoEmail: import.meta.env.VITE_LEGAL_DPO_EMAIL?.trim() || "privacidade@apptreino.com",
  lastUpdated: "30 de agosto de 2026"
} as const;

export const refundPolicyHighlights = [
  "Assinatura digital: garantia de 7 dias após a primeira cobrança confirmada, mediante solicitação por e-mail.",
  "Produtos físicos da vitrine: troca ou devolução em até 7 dias corridos após o recebimento, conforme CDC, desde que o item esteja intacto.",
  "Reembolsos aprovados são processados no mesmo meio de pagamento em até 10 dias úteis após a confirmação administrativa."
] as const;
