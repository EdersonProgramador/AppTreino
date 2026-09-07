import { Dumbbell, Link2, ShieldCheck, UsersRound, Wallet, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const coachLandingNav = [
  { href: "#beneficios", label: "Benefícios" },
  { href: "#estudio", label: "Estúdio" },
  { href: "#comissao", label: "Comissão" },
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#faq", label: "FAQ" }
] as const;

export const coachHeroTrust = [
  "Assinatura ATLLY ativa",
  "Painel profissional",
  "Estúdio de treinos",
  "Comissão de 8%",
  "Selo Coach ATLLY"
] as const;

export const coachBenefits: Array<{ icon: LucideIcon; title: string; text: string }> = [
  {
    icon: Dumbbell,
    title: "Estúdio de Treinos",
    text: "Crie exercícios, divisões e programas completos e distribua para seus alunos na plataforma."
  },
  {
    icon: Wallet,
    title: "Comissão de afiliado",
    text: "Ganhe 8% sobre pagamentos confirmados de alunos que entrarem pelo seu código de indicação."
  },
  {
    icon: Link2,
    title: "Código exclusivo",
    text: "Link e código opaco de 8 caracteres — privacidade para você, clareza para quem você indica."
  },
  {
    icon: ShieldCheck,
    title: "Selo Coach ATLLY",
    text: "Reconhecimento visível no perfil enquanto sua assinatura estiver ativa e você for coach vinculado."
  },
  {
    icon: UsersRound,
    title: "Dual access",
    text: "Continue treinando como aluno em /aluno e gerencie sua operação profissional em /coach."
  },
  {
    icon: Wrench,
    title: "Workspace da organização",
    text: "Turmas, alunos, nutrição e visão operacional integrados ao ecossistema ATLLY."
  }
];

export const coachStudioSteps = [
  "Cadastre exercícios com vídeo, instruções e tags de equipamento.",
  "Monte divisões (blocos) reutilizáveis para diferentes objetivos.",
  "Publique programas e distribua a alunos ou turmas da sua organização."
] as const;

export const coachCommissionBullets = [
  "8% sobre cada pagamento confirmado do aluno indicado",
  "Carência de 14 dias antes de liberar saldo para saque",
  "Saque mínimo de R$ 50 via PIX",
  "Comissão ativa somente enquanto você mantiver assinatura ATLLY vigente"
] as const;

export const coachHowItWorks = [
  {
    step: "01",
    title: "Assine a ATLLY",
    text: "Torne-se aluno com plano ativo. Coach ATLLY é um perfil profissional sobre a base de assinante."
  },
  {
    step: "02",
    title: "Seja promovido",
    text: "A equipe ATLLY vincula sua conta como coach em uma academia, box ou studio parceiro."
  },
  {
    step: "03",
    title: "Ative seu painel",
    text: "Acesse /coach, use o Estúdio, compartilhe seu código e acompanhe receitas de afiliado."
  }
] as const;

export const coachFaq = [
  {
    question: "Preciso pagar a ATLLY para ser coach?",
    answer:
      "Sim. Coach ativo exige assinatura ATLLY vigente como aluno. Você treina na plataforma e, ao mesmo tempo, opera como profissional."
  },
  {
    question: "Como me torno coach?",
    answer:
      "Após assinar, a promoção é feita pelo admin ATLLY no painel administrativo, vinculando você a uma organização parceira."
  },
  {
    question: "Perdi a assinatura. O que acontece?",
    answer:
      "Seu link de indicação é pausado, comissões novas param de entrar e o selo de coach fica inativo até a renovação."
  },
  {
    question: "Posso indicar alunos sem ser coach?",
    answer: "Não. Apenas coaches ativos (papel + assinatura) recebem código de indicação e direito a comissão."
  },
  {
    question: "Já sou aluno ATLLY. E agora?",
    answer: "Entre em contato ou fale com sua organização parceira para solicitar a promoção a coach no admin."
  }
] as const;
