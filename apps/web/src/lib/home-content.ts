import {
  CalendarDays,
  Check,
  CircleDollarSign,
  Clock3,
  Dumbbell,
  LineChart,
  MessageCircle,
  Ruler,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  Timer,
  UserRound,
  X,
  Zap
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const landingNav = [
  { href: "#app", label: "O App" },
  { href: "#para-quem", label: "Para Quem É" },
  { href: "#resultados", label: "Resultados" },
  { href: "#planos", label: "Planos" },
  { href: "#faq", label: "FAQ" }
] as const;

export const socialProofMetrics = [
  { icon: Smartphone, value: "+10.000", label: "usuários ativos" },
  { icon: Dumbbell, value: "+500.000", label: "treinos concluídos" },
  { icon: Star, value: "4.9/5", label: "na App Store e Google Play" },
  { icon: ShieldCheck, value: "100%", label: "satisfação garantida" }
] as const;

export const painSolutionRows = [
  {
    pain: "Perder tempo pensando qual exercício fazer no dia.",
    solution: "Treino pronto e organizado por sessões, focado no seu objetivo."
  },
  {
    pain: "Esquecer a carga da semana passada e não evoluir.",
    solution: "Registro de cargas para progressão constante."
  },
  {
    pain: "Treinar sem saber se o tempo de descanso está certo.",
    solution: "Cronômetro regressivo integrado entre as séries."
  },
  {
    pain: "Faltar por falta de orientação e perder o ritmo.",
    solution: "Clareza total do processo, gerando constância diária."
  }
] as const;

export const audienceSegments: Array<{
  icon: LucideIcon;
  title: string;
  text: string;
}> = [
  {
    icon: UserRound,
    title: "Para quem quer sair do zero",
    text: "Sem dúvida na academia. Saiba exatamente o que fazer, quantas repetições executar e como treinar com segurança."
  },
  {
    icon: LineChart,
    title: "Para quem já treina, mas estagnou",
    text: "Pare de repetir o mesmo treino há meses. Acompanhe progressão real de carga e volume para quebrar o platô."
  },
  {
    icon: Clock3,
    title: "Para quem tem a rotina corrida",
    text: "Treinos otimizados para entregar o máximo no tempo que você tem — 30, 45 ou 60 minutos."
  }
];

export const resources: Array<{
  icon: LucideIcon;
  title: string;
  text: string;
}> = [
  {
    icon: Dumbbell,
    title: "Treino digital interativo",
    text: "Rotina organizada por sessões (A, B, C...), com séries, repetições, vídeos de execução e intervalo de descanso."
  },
  {
    icon: LineChart,
    title: "Gráficos de evolução e frequência",
    text: "Visualize progresso, constância semanal e histórico em um painel simples e direto."
  },
  {
    icon: Ruler,
    title: "Avaliação física no bolso",
    text: "Registre medidas e fotos de antes/depois com privacidade para comparar sua transformação."
  },
  {
    icon: MessageCircle,
    title: "Suporte direto com especialistas",
    text: "Dúvida sobre execução ou ajuste de plano? O time responde você direto no app."
  }
];

export const testimonials = [
  {
    quote:
      "Eu sempre começava a academia e parava em 1 mês porque ficava perdido. Com o App Treino Social, eu só abro o celular e sigo o passo a passo. Já são 5 meses sem faltar!",
    name: "Lucas M.",
    meta: "28 anos"
  },
  {
    quote:
      "A diferença de conseguir registrar a carga de cada exercício foi absurda. Meu corpo mudou mais nos últimos 3 meses do que no ano passado inteiro.",
    name: "Juliana R.",
    meta: "34 anos"
  }
] as const;

export const monthlyPlanPerks = [
  "Acesso ilimitado ao App Treino Social",
  "Acompanhamento de cargas e evolução",
  "Suporte via aplicativo",
  "Renovação mensal automática"
] as const;

export const annualPlanPerks = [
  "Tudo do Plano Mensal",
  "Bônus: Guia de Acompanhamento Nutricional (PDF)",
  "Bônus: Calculadora de Calorias e Macros",
  "Menor preço garantido por 1 ano",
  "Economia de mais de 10% vs. mensal"
] as const;

export const faqItems = [
  {
    question: "O App Treino Social funciona para treino em casa ou só academia?",
    answer:
      "Funciona para ambos. Os treinos são adaptados para o ambiente onde você treina e para os equipamentos que possui."
  },
  {
    question: "E se eu não souber como fazer o exercício?",
    answer:
      "Cada exercício dentro do app possui demonstração visual clara e instruções simples para você não errar a postura."
  },
  {
    question: "Como funciona a cobrança?",
    answer:
      "A cobrança é realizada via cartão de crédito ou PIX de forma segura. No plano mensal, a renovação é mês a mês; no anual, você garante o desconto no valor total."
  },
  {
    question: "Como recebo meu acesso?",
    answer:
      "O acesso é imediato. Assim que o pagamento for confirmado, você recebe as instruções no seu e-mail para entrar no app e começar na hora."
  }
];

export const workoutRows = [
  { name: "Supino reto", sets: "4x 8-10", load: "72 kg", rest: "90s" },
  { name: "Tríceps corda", sets: "3x 12", load: "34 kg", rest: "60s" },
  { name: "Desenvolvimento", sets: "3x 10", load: "28 kg", rest: "75s" }
];

export const trustIcons = [ShieldCheck, Zap, Timer, CircleDollarSign, Check, Sparkles] as const;
