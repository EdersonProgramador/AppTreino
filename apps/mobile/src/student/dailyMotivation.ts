import AsyncStorage from "@react-native-async-storage/async-storage";

export type DailyMotivation = {
  kicker: string;
  title: string;
  body: string;
  anchor: string;
};

const KEY_PREFIX = "app-treino-motivation-seen-";

const MESSAGES: DailyMotivation[] = [
  {
    kicker: "Identidade de atleta",
    title: "Você não treina para virar atleta. Você treina porque já é.",
    body: "Na PNL, identidade puxa comportamento. Hoje execute o treino como quem já vive esse padrão — um bloco, uma série, um km de cada vez.",
    anchor: "Respire fundo, sinta o peito firme e diga: eu sou o tipo de pessoa que conclui."
  },
  {
    kicker: "Ancoragem de alto desempenho",
    title: "O estado vem antes do resultado.",
    body: "Alta performance começa no corpo. Ombros abertos, olhar no horizonte, ritmo estável. Entra no treino já no estado de quem entrega o melhor.",
    anchor: "Aperte o punho 3 segundos e solte. Esse é o gatilho do seu foco."
  },
  {
    kicker: "Pacing do futuro",
    title: "Veja o você de 90 dias cumprimentando o de hoje.",
    body: "Ele agradece a sessão que você vai terminar agora. Constância não é motivação — é o futuro puxando o presente.",
    anchor: "Imagine o relógio marcando o fim do treino. Sinta o orgulho. Depois comece."
  },
  {
    kicker: "Reenquadramento",
    title: "Cansaço não é sinal de parar. É prova de que você avançou.",
    body: "O cérebro chama de desconforto o que o corpo chama de adaptação. Troque “não aguento” por “estou crescendo agora”.",
    anchor: "Na próxima série difícil, sorria por um segundo. Isso quebra o padrão de fuga."
  },
  {
    kicker: "Modelo de excelência",
    title: "Atletas de elite não esperam o dia perfeito.",
    body: "Eles treinam o dia que existe. Chuva, agenda cheia, sono médio — o padrão vencedor é aparecer mesmo assim.",
    anchor: "Defina o mínimo inegociável de hoje e cumpra. Depois, se puder, faça um pouco mais."
  },
  {
    kicker: "Foco calibrado",
    title: "Uma meta. Um bloco. Zero dispersão.",
    body: "A mente de alta performance reduz opções. Escolha o treino, silencie o resto e deixe o corpo trabalhar no presente.",
    anchor: "Antes de começar, apague notificações por 40 minutos. Proteja o estado."
  },
  {
    kicker: "Linguagem de sucesso",
    title: "Fale como quem já venceu a sessão.",
    body: "“Vou tentar treinar” dilui a identidade. “Eu treino hoje” é comando. Palavras viram fisiologia.",
    anchor: "Diga em voz alta: hoje eu treino. Depois levante e execute."
  },
  {
    kicker: "Progressão composta",
    title: "1% melhor hoje vira outra pessoa em um ano.",
    body: "Ofensiva não é fogo de palha. É o hábito de não zerar a sequência. Marque o dia. O gráfico cuida do resto.",
    anchor: "Visualize o calendário com o ícone de hoje. Agora vá colocá-lo lá."
  }
];

function todayKey() {
  return `${KEY_PREFIX}${new Date().toISOString().slice(0, 10)}`;
}

function indexForToday() {
  const iso = new Date().toISOString().slice(0, 10);
  let hash = 0;
  for (let i = 0; i < iso.length; i += 1) hash = (hash * 31 + iso.charCodeAt(i)) % MESSAGES.length;
  return hash;
}

export function motivationForToday() {
  return MESSAGES[indexForToday()] ?? MESSAGES[0];
}

export async function hasSeenTodayMotivation() {
  try {
    return (await AsyncStorage.getItem(todayKey())) === "1";
  } catch {
    return false;
  }
}

export async function markTodayMotivationSeen() {
  await AsyncStorage.setItem(todayKey(), "1").catch(() => undefined);
}
