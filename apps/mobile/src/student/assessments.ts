import type { AssessmentPhotoKey, PhysicalAssessmentForm, StudentProfile } from "../types";

export const assessmentPerimeterKeys = [
  "pescoço",
  "torax",
  "cintura",
  "abdomen",
  "quadril",
  "braco_direito_relaxado",
  "braco_esquerdo_relaxado",
  "coxa_direita",
  "coxa_esquerda",
  "panturrilha_direita",
  "panturrilha_esquerda"
] as const;

export const assessmentPhotoFields: Array<[AssessmentPhotoKey, string]> = [
  ["foto_frente", "Foto de frente"],
  ["foto_costas", "Foto de costas"],
  ["foto_perfil", "Foto de perfil"]
];

export function createEmptyAssessmentForm(profile?: StudentProfile | null): PhysicalAssessmentForm {
  return {
    formulario_avaliacao_fisica: {
      dados_pessoais_e_objetivos: {
        nome_completo: profile?.name ?? "",
        data_nascimento: profile?.birthDate ? profile.birthDate.slice(0, 10) : "",
        genero_biologico: {
          opcoes: ["Masculino", "Feminino"],
          resposta: profile?.gender === "MALE" ? "Masculino" : profile?.gender === "FEMALE" ? "Feminino" : ""
        },
        objetivo_principal: {
          opcoes: ["Emagrecimento", "Hipertrofia", "Condicionamento/Saúde"],
          resposta: profile?.objective ?? ""
        },
        nivel_atividade_atual: {
          opcoes: ["Sedentário", "Leve", "Moderado", "Intenso"],
          resposta: ""
        }
      },
      historico_de_saude_anamnese: {
        possui_lesao: { descricao: "Joelho, coluna, ombro, etc.", resposta: "" },
        medicamento_continuo: { descricao: "Se sim, qual?", resposta: "" },
        restricao_medica_cardiaca: { descricao: "Se sim, qual?", resposta: "" }
      },
      composicao_corporal_basica: {
        instrucao: "Aferir preferencialmente em jejum, pela manhã",
        peso_atual_kg: null,
        altura_cm: null
      },
      perimetros_corporais_cm: {
        instrucao: "Use uma fita métrica, sem apertar a pele e sem prender a respiração",
        pescoço: { detalhe: "Abaixo do pomo de Adão", valor: null },
        torax: { detalhe: "Na linha dos mamilos", valor: null },
        cintura: { detalhe: "Na parte mais estreita do tronco", valor: null },
        abdomen: { detalhe: "Exatamente sobre a linha do umbigo", valor: null },
        quadril: { detalhe: "Na maior parte dos glúteos", valor: null },
        braco_direito_relaxado: { detalhe: "Linha média do bíceps", valor: null },
        braco_esquerdo_relaxado: { detalhe: "Linha média do bíceps", valor: null },
        coxa_direita: { detalhe: "Na região média da coxa", valor: null },
        coxa_esquerda: { detalhe: "Na região média da coxa", valor: null },
        panturrilha_direita: { detalhe: "Na maior porção do músculo", valor: null },
        panturrilha_esquerda: { detalhe: "Na maior porção do músculo", valor: null }
      },
      fotos_analise_visual: {
        instrucao: "Anexar fotos com roupas leves, postura relaxada e câmera na altura da cintura",
        arquivos: { foto_frente: "", foto_costas: "", foto_perfil: "" }
      }
    }
  };
}

export function cloneAssessmentForm(form: PhysicalAssessmentForm): PhysicalAssessmentForm {
  return JSON.parse(JSON.stringify(form)) as PhysicalAssessmentForm;
}

export function parseNumber(value: string) {
  const normalized = value.replace(",", ".").trim();
  if (!normalized) return null;
  const next = Number(normalized);
  return Number.isFinite(next) ? next : null;
}
