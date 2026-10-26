import {
  CalendarDays,
  Dumbbell,
  Link2,
  ShieldCheck,
  UserCheck,
  UsersRound,
  Wallet,
  Wrench
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { COACH_PRO_ANNUAL_PLAN_CODE, COACH_PRO_ANNUAL_PRICE_CENTS } from "@app-treino/shared";

export const coachProPlanCode = COACH_PRO_ANNUAL_PLAN_CODE;
export const coachProPriceCents = COACH_PRO_ANNUAL_PRICE_CENTS;

export const coachLandingNav = [
  { href: "#plano", label: "Plano Coach Pro" },
  { href: "#beneficios", label: "Benefícios" },
  { href: "#alunos", label: "Seus alunos" },
  { href: "#estudio", label: "Estúdio" },
  { href: "#comissao", label: "Comissão" },
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#faq", label: "FAQ" }
] as const;

export const coachHeroTrust = [
  "R$ 1.300 / ano",
  "Painel profissional",
  "Treinos exclusivos do coach",
  "Agenda + Estúdio",
  "Selo Coach ATLLY"
] as const;

export const coachProPricingBullets = [
  "Painel profissional em /coach",
  "Estúdio: exercícios, programas e distribuição sob sua marca",
  "Agenda para prescrever e marcar sessões",
  "Cadastro de alunos vinculados à sua operação",
  "Programa de indicação com 8% de comissão"
] as const;

export const coachManagedIncluded = [
  "Treinos e programas exclusivos que você publica",
  "Sessões agendadas e orientadas por você",
  "Execução e histórico dentro do seu acompanhamento",
  "O aluno vê somente o que você liberou"
] as const;

export const coachManagedExcluded = [
  "Contratação de plano pelo próprio aluno no site",
  "Loja e compras fora do que você indicou",
  "Conteúdos e ferramentas que você não publicou",
  "Áreas abertas da plataforma fora da sua operação"
] as const;

export const coachBenefits: Array<{ icon: LucideIcon; title: string; text: string }> = [
  {
    icon: Dumbbell,
    title: "Estúdio de Treinos",
    text: "Crie exercícios, divisões e programas completos e distribua para alunos ou turmas."
  },
  {
    icon: CalendarDays,
    title: "Agenda profissional",
    text: "Organize horários e prescreva sessões — cada aluno recebe treinos exclusivos do seu método."
  },
  {
    icon: UserCheck,
    title: "Cadastro de alunos",
    text: "Cadastre atletas vinculados a você. Eles entram direto na rotina que você montou."
  },
  {
    icon: Wallet,
    title: "Comissão de afiliado",
    text: "Ganhe 8% sobre pagamentos confirmados de indicações pelo seu código."
  },
  {
    icon: Link2,
    title: "Código exclusivo",
    text: "Link e código opaco de 8 caracteres para indicações com rastreio e privacidade."
  },
  {
    icon: ShieldCheck,
    title: "Selo Coach ATLLY",
    text: "Reconhecimento no perfil com Coach Pro ativo e vínculo COACH na organização."
  },
  {
    icon: UsersRound,
    title: "Workspace completo",
    text: "Turmas, atribuições, nutrição (quando aplicável) e visão operacional integrada."
  },
  {
    icon: Wrench,
    title: "Operação anual previsível",
    text: "Plano anual para escalar sua base de alunos com custo fixo e previsível."
  }
];

export const coachStudioSteps = [
  "Cadastre exercícios com vídeo, instruções e tags de equipamento.",
  "Monte divisões (blocos) reutilizáveis para diferentes objetivos.",
  "Publique programas, use a agenda e entregue treinos exclusivos na jornada do aluno."
] as const;

export const coachCommissionBullets = [
  "8% sobre cada pagamento confirmado da indicação",
  "Carência de 14 dias antes de liberar saldo para saque",
  "Saque mínimo de R$ 50 via PIX",
  "Comissão ativa com Coach Pro vigente e papel de coach na organização"
] as const;

export const coachHowItWorks = [
  {
    step: "01",
    title: "Assine Coach Pro",
    text: "Plano anual de R$ 1.300 — painel profissional, estúdio de treinos e cadastro dos seus alunos."
  },
  {
    step: "02",
    title: "Seja promovido",
    text: "A equipe ATLLY vincula sua conta como coach em uma academia, box ou studio parceiro."
  },
  {
    step: "03",
    title: "Cadastre alunos",
    text: "Cada atleta recebe apenas os treinos que você agenda e distribui — experiência fechada à sua operação."
  }
] as const;

export const coachFaq = [
  {
    question: "Quanto custa ser coach ATLLY?",
    answer:
      "O plano Coach Pro é anual: R$ 1.300. Inclui painel profissional, estúdio de treinos e cadastro de alunos na sua operação."
  },
  {
    question: "O que meu aluno acessa na prática?",
    answer:
      "Somente o que você publicar: programas, sessões na agenda e acompanhamento da execução. Treinos exclusivos do coach — o aluno não contrata plano por conta própria."
  },
  {
    question: "Como me torno coach?",
    answer:
      "Assine o Coach Pro e solicite ao admin ATLLY a promoção na sua organização parceira (academia, box ou studio)."
  },
  {
    question: "Perdi a renovação do Coach Pro. O que acontece?",
    answer:
      "Cadastro de novos alunos e benefícios do plano coach ficam pausados até a renovação. Quem já está vinculado a você continua com o mesmo acesso."
  },
  {
    question: "Já uso a plataforma como atleta. Posso virar coach?",
    answer:
      "Sim. Assine o Coach Pro e alinhe com a ATLLY ou sua organização parceira a promoção e os vínculos da sua operação."
  }
] as const;
