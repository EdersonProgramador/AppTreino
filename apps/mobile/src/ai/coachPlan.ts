/**
 * Coach AppTreino — treino + nutrição.
 *
 * Fase 2 (agora): chat autenticado, dieta por biotipo, treinos de todas as modalidades,
 * clima/ofensiva no contexto, TTS, STT (Whisper se OPENAI_API_KEY; web Speech API).
 * Sem chave OpenAI o especialista local responde. LLM usa tools e a mesma engine.
 */
export const AI_COACH_PLAN = {
  name: "Coach AppTreino",
  modalities: [
    "Musculação",
    "Funcional",
    "HIIT",
    "Corrida",
    "Caminhada",
    "Ciclismo",
    "Cross",
    "Yoga/Mobilidade",
    "Nutrição e biotipo"
  ],
  voice: {
    stt: "Web Speech / Whisper (OPENAI_API_KEY) / gravação expo-av",
    tts: "expo-speech e speechSynthesis"
  },
  tools: [
    "gerar_treino_personalizado",
    "montar_dieta_biotipo",
    "ler_ofensiva_e_metricas",
    "sugerir_modalidade_pelo_clima"
  ]
} as const;
