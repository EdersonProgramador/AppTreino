import {
  Activity,
  Bike,
  Brain,
  Dumbbell,
  Flame,
  Footprints,
  LineChart,
  MapPin,
  Sparkles,
  Target,
  Timer,
  Trophy,
  Users,
  Zap
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const landingNav = [
  { href: "#sistema", label: "O Sistema" },
  { href: "#modalidades", label: "Modalidades" },
  { href: "#performance", label: "Performance" },
  { href: "#comunidade", label: "Comunidade" },
  { href: "#planos", label: "Planos" },
  { href: "#faq", label: "FAQ" }
] as const;

export const heroTrustItems = [
  "Acesso imediato",
  "Dados e histórico centralizados",
  "Diferentes modalidades",
  "Comunidade de atletas",
  "Garantia de 7 dias"
] as const;

export const socialProofMetrics = [
  { icon: Users, value: "+10.000", label: "Atletas na plataforma*", footnote: true },
  { icon: Activity, value: "+500.000", label: "Atividades realizadas*", footnote: true },
  { icon: Trophy, value: "4,9/5", label: "Avaliação da comunidade*", footnote: true },
  { icon: Timer, value: "24/7", label: "Sua evolução registrada", footnote: false }
] as const;

export const withoutSystemItems = [
  "Treinos espalhados e sem histórico centralizado.",
  "Cargas e repetições esquecidas.",
  "Corridas sem conexão com sua rotina de treinamento.",
  "Dificuldade para visualizar constância e progresso.",
  "Pouca clareza sobre o que fazer no próximo treino."
] as const;

export const withSystemItems = [
  "Treinos organizados por modalidade e objetivo.",
  "Histórico de cargas, séries e repetições.",
  "Corrida, caminhada e ciclismo integrados à sua jornada.",
  "Métricas e evolução reunidas em um único perfil.",
  "Mais clareza para executar sua próxima missão."
] as const;

export const modalities: Array<{ icon: LucideIcon; title: string; text: string }> = [
  {
    icon: MapPin,
    title: "Corrida",
    text: "Registre distância, ritmo, velocidade, tempo, frequência cardíaca, calorias, passos, voltas e evolução."
  },
  {
    icon: Footprints,
    title: "Caminhada",
    text: "Transforme movimento diário em atividade mensurável e acompanhe sua constância."
  },
  {
    icon: Bike,
    title: "Ciclismo",
    text: "Registre percursos, distância, velocidade e desempenho."
  },
  {
    icon: Dumbbell,
    title: "Musculação",
    text: "Organize sessões, exercícios, séries, repetições, cargas e intervalos."
  },
  {
    icon: Flame,
    title: "Crossfit",
    text: "Acompanhe sessões e evolução dentro da modalidade."
  },
  {
    icon: Zap,
    title: "HIIT",
    text: "Treinos intensos organizados para otimizar seu tempo e desempenho."
  },
  {
    icon: Target,
    title: "Funcional e outras",
    text: "Construa uma jornada de treinamento compatível com seu objetivo."
  }
];

export const commandCenterPillars = [
  { title: "Readiness", text: "Visualize sua condição para a próxima atividade." },
  { title: "Recovery", text: "Acompanhe recuperação e equilíbrio entre estímulo e descanso." },
  { title: "BioCore", text: "Centralize informações relacionadas ao seu corpo e evolução física." },
  { title: "Performance", text: "Compare períodos e acompanhe tendências da sua performance." },
  { title: "Evolution", text: "Transforme semanas e meses de atividades em uma linha contínua de progresso." }
] as const;

export const workoutPerks = [
  "Séries e repetições",
  "Registro de cargas",
  "Histórico por exercício",
  "Cronômetro de descanso",
  "Vídeos de execução",
  "Sessões organizadas",
  "Progresso atualizado"
] as const;

export const telemetryMetrics = [
  "Distância",
  "Tempo",
  "Ritmo",
  "Velocidade",
  "Calorias",
  "Frequência cardíaca",
  "Passos",
  "Voltas",
  "Frequência de treino",
  "Cargas",
  "Volume",
  "Histórico"
] as const;

export const intelligenceFeatures = [
  {
    icon: Sparkles,
    title: "Planos inteligentes",
    text: "Organização orientada ao seu objetivo e modalidade."
  },
  {
    icon: LineChart,
    title: "Análise de performance",
    text: "Transforme histórico em informações úteis para sua evolução."
  },
  {
    icon: Brain,
    title: "Acompanhamento contínuo",
    text: "Entenda tendências e mudanças ao longo do tempo."
  }
];

export const bioCoreItems = [
  "Peso",
  "Medidas corporais",
  "Composição corporal",
  "Avaliações físicas",
  "Histórico",
  "Fotos de evolução"
] as const;

export const communityFeatures = [
  "Feed",
  "Clubes",
  "Desafios",
  "Eventos",
  "Clipes",
  "Live",
  "Mensagens"
] as const;

export const challengeTypes = [
  "Distância",
  "Frequência",
  "Treinos",
  "Corrida",
  "Ciclismo",
  "Consistência",
  "Performance"
] as const;

export const professionalRoles = [
  { title: "Coaches", text: "Organizam e acompanham programas de treinamento." },
  { title: "Personal trainers", text: "Gerenciam alunos, sessões e evolução." },
  {
    title: "Nutricionistas",
    text: "Podem integrar acompanhamento nutricional à jornada do atleta.*"
  },
  {
    title: "Academias · Boxes · Studios",
    text: "Criam suas comunidades e conectam profissionais e alunos."
  }
] as const;

export const audienceSegments: Array<{ title: string; text: string; featured?: boolean }> = [
  {
    title: "Para quem está começando",
    text: "Tenha clareza desde o primeiro treino e construa consistência sem depender de papel ou memória."
  },
  {
    title: "Para quem já treina",
    text: "Registre cargas, volume, frequência e evolução para parar de treinar no automático.",
    featured: true
  },
  {
    title: "Para corredores",
    text: "Transforme quilômetros em histórico, métricas e evolução."
  },
  {
    title: "Para quem pedala",
    text: "Centralize suas atividades dentro da mesma jornada esportiva."
  },
  {
    title: "Para quem pratica várias modalidades",
    text: "Musculação hoje. Corrida amanhã. HIIT no fim de semana. Seu corpo é um só — seu histórico também deveria ser."
  },
  {
    title: "Para quem quer performance",
    text: "Use dados para entender sua própria evolução."
  }
];

export const testimonials = [
  {
    quote:
      "Eu sempre começava a academia e parava porque ficava perdido. Agora abro o aplicativo e sei exatamente qual é o próximo treino.",
    name: "Lucas M.",
    meta: "28 anos"
  },
  {
    quote:
      "Registrar minhas cargas mudou completamente minha percepção de evolução. Hoje consigo comparar meu desempenho em vez de simplesmente achar que estou melhorando.",
    name: "Juliana R.",
    meta: "34 anos"
  }
] as const;

/** Matriz comparativa alinhada à ordem Start → Pro → Atlly Coach (sortOrder no admin). */
export const planComparisonMatrix = [
  { feature: "Treinos digitais e programas", included: [true, true, true] },
  { feature: "Registro de cargas e séries", included: [true, true, true] },
  { feature: "Avaliação física e BioCore", included: [true, true, true] },
  { feature: "Comunidade e desafios", included: [true, true, true] },
  { feature: "Corrida, caminhada e ciclismo GPS", included: [false, true, true] },
  { feature: "Histórico completo de atividades", included: [false, true, true] },
  { feature: "Acompanhamento de progresso", included: [false, true, true] },
  { feature: "Suporte prioritário", included: [false, true, true] },
  { feature: "ATLLY AI Coach", included: [false, false, true] }
] as const;

export const monthlyPlanPerks = [
  "Acesso à ATLLY",
  "Treinos digitais",
  "Registro de cargas",
  "Histórico e evolução",
  "Recursos da comunidade",
  "Suporte pelo aplicativo",
  "Renovação mensal"
] as const;

export const annualPlanPerks = [
  "Tudo do plano mensal",
  "Acesso por 12 meses",
  "Guia de acompanhamento nutricional",
  "Calculadora de calorias e macros",
  "Melhor condição do período"
] as const;

export const faqItems = [
  {
    question: "A ATLLY serve apenas para musculação?",
    answer:
      "Não. A proposta da ATLLY é funcionar como um sistema de performance com diferentes modalidades, incluindo musculação, corrida, caminhada, ciclismo e outras categorias disponíveis na plataforma."
  },
  {
    question: "Sou iniciante. Posso utilizar?",
    answer:
      "Sim. A experiência foi pensada para oferecer clareza tanto para quem está começando quanto para atletas que já possuem histórico de treinamento."
  },
  {
    question: "Posso registrar minhas cargas?",
    answer:
      "Sim. Você pode acompanhar exercícios, séries, repetições, cargas e histórico de evolução conforme os recursos disponíveis no treino."
  },
  {
    question: "A ATLLY possui corrida?",
    answer: "Sim. A corrida faz parte da experiência esportiva da plataforma, juntamente com outras atividades."
  },
  {
    question: "Posso participar de desafios?",
    answer: "Sim. A área de desafios adiciona metas e experiências competitivas à jornada."
  },
  {
    question: "Existe comunidade?",
    answer:
      "Sim. A ATLLY incorpora recursos sociais para aproximar atletas, comunidades, clubes e organizações."
  },
  {
    question: "Academias e coaches podem participar?",
    answer:
      "A arquitetura da ATLLY contempla organizações e profissionais vinculados aos atletas, conforme os recursos disponibilizados para cada perfil."
  },
  {
    question: "Como recebo meu acesso?",
    answer: "Após a confirmação da assinatura, você recebe as orientações necessárias para acessar sua conta."
  },
  {
    question: "Posso cancelar?",
    answer: "Sim, observando as condições do plano contratado."
  }
];

export const workoutRows = [
  { name: "Supino reto", sets: "4 × 8–10", load: "72 kg" },
  { name: "Tríceps corda", sets: "3 × 12", load: "34 kg" },
  { name: "Desenvolvimento", sets: "3 × 10", load: "28 kg" }
] as const;

export const footerProductLinks = [
  { href: "#sistema", label: "O Sistema" },
  { href: "#modalidades", label: "Modalidades" },
  { href: "#performance", label: "Corrida" },
  { href: "#performance", label: "Treinos" },
  { href: "#comunidade", label: "Desafios" },
  { href: "#comunidade", label: "Comunidade" }
] as const;

export const footerCompanyLinks = [
  { href: "#sistema", label: "Sobre" },
  { href: "#profissionais", label: "Profissionais" },
  { href: "#comunidade", label: "Academias" },
  { href: "#comunidade", label: "Boxes" },
  { href: "#comunidade", label: "Studios" }
] as const;

export const footerSupportLinks = [
  { href: "#faq", label: "Central de Ajuda" },
  { href: "#faq", label: "FAQ" }
] as const;
