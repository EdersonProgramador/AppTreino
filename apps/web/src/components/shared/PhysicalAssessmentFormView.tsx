import {
  Check
} from "lucide-react";
import type { FormEvent } from "react";
import type { AssessmentPhotoKey, PhysicalAssessmentForm } from "../../types/shared";
import { assessmentPerimeterKeys, assessmentPhotoFields } from "../../types/admin";
import { mediaUrl } from "../../lib/urls";

﻿export function PhysicalAssessmentFormView({
  form,
  photoPreviews,
  submitting,
  submitLabel,
  submittingLabel = "Salvando...",
  cancelLabel = "Cancelar avaliação",
  namePlaceholder,
  onSubmit,
  onCancel,
  onUpdate,
  onPhotoSelect
}: {
  form: PhysicalAssessmentForm;
  photoPreviews: Record<string, string>;
  submitting: boolean;
  submitLabel: string;
  submittingLabel?: string;
  cancelLabel?: string;
  namePlaceholder: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  onUpdate: (mutate: (draft: PhysicalAssessmentForm) => void) => void;
  onPhotoSelect: (key: AssessmentPhotoKey, file: File | undefined) => void;
}) {
  const data = form.formulario_avaliacao_fisica;

  return (
    <form className="student-assessment-form" onSubmit={onSubmit}>
      <div className="student-assessment-section">
        <h2>Dados pessoais e objetivos</h2>
        <div className="student-assessment-field">
          <label>Nome completo</label>
          <input
            type="text"
            placeholder={namePlaceholder}
            value={data.dados_pessoais_e_objetivos.nome_completo}
            onChange={(event) =>
              onUpdate((draft) => {
                draft.formulario_avaliacao_fisica.dados_pessoais_e_objetivos.nome_completo = event.target.value;
              })
            }
          />
        </div>
        <div className="student-assessment-field">
          <label>Data de nascimento</label>
          <input
            type="date"
            value={data.dados_pessoais_e_objetivos.data_nascimento}
            onChange={(event) =>
              onUpdate((draft) => {
                draft.formulario_avaliacao_fisica.dados_pessoais_e_objetivos.data_nascimento = event.target.value;
              })
            }
          />
        </div>
        {(
          [
            ["genero_biologico", "Gênero biológico"],
            ["objetivo_principal", "Objetivo principal"],
            ["nivel_atividade_atual", "Nível de atividade atual"]
          ] as const
        ).map(([key, label]) => {
          const section = data.dados_pessoais_e_objetivos[key];
          return (
            <div className="student-assessment-field" key={key}>
              <label>{label}</label>
              <select
                value={section.resposta}
                onChange={(event) =>
                  onUpdate((draft) => {
                    draft.formulario_avaliacao_fisica.dados_pessoais_e_objetivos[key].resposta = event.target.value;
                  })
                }
              >
                <option value="">Selecione</option>
                {section.opcoes.map((opcao) => (
                  <option key={opcao} value={opcao}>{opcao}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      <div className="student-assessment-section">
        <h2>Histórico de saúde (anamnese)</h2>
        {(
          [
            ["possui_lesao", "Você possui alguma lesão?"],
            ["medicamento_continuo", "Usa algum medicamento contínuo?"],
            ["restricao_medica_cardiaca", "Alguma restrição médica cardíaca?"]
          ] as const
        ).map(([key, label]) => {
          const field = data.historico_de_saude_anamnese[key];
          return (
            <div className="student-assessment-field" key={key}>
              <label>{label}</label>
              <input
                type="text"
                placeholder={field.descricao}
                value={field.resposta}
                onChange={(event) =>
                  onUpdate((draft) => {
                    draft.formulario_avaliacao_fisica.historico_de_saude_anamnese[key].resposta = event.target.value;
                  })
                }
              />
            </div>
          );
        })}
      </div>

      <div className="student-assessment-section">
        <h2>Composição corporal básica</h2>
        <p className="student-assessment-hint">{data.composicao_corporal_basica.instrucao}</p>
        <div className="student-assessment-inline">
          <div className="student-assessment-field">
            <label>Peso atual (kg)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              placeholder="Ex.: 72,5"
              value={data.composicao_corporal_basica.peso_atual_kg ?? ""}
              onChange={(event) =>
                onUpdate((draft) => {
                  draft.formulario_avaliacao_fisica.composicao_corporal_basica.peso_atual_kg =
                    event.target.value === "" ? null : Number(event.target.value);
                })
              }
            />
          </div>
          <div className="student-assessment-field">
            <label>Altura (cm)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              placeholder="Ex.: 175"
              value={data.composicao_corporal_basica.altura_cm ?? ""}
              onChange={(event) =>
                onUpdate((draft) => {
                  draft.formulario_avaliacao_fisica.composicao_corporal_basica.altura_cm =
                    event.target.value === "" ? null : Number(event.target.value);
                })
              }
            />
          </div>
        </div>
      </div>

      <div className="student-assessment-section">
        <h2>Perímetros corporais (cm)</h2>
        <p className="student-assessment-hint">{data.perimetros_corporais_cm.instrucao}</p>
        <div className="student-assessment-grid">
          {assessmentPerimeterKeys.map((key) => {
            const item = data.perimetros_corporais_cm[key];
            return (
              <div className="student-assessment-field" key={key}>
                <label>{key.replace(/_/g, " ")}</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder={item.detalhe}
                  value={item.valor ?? ""}
                  onChange={(event) =>
                    onUpdate((draft) => {
                      draft.formulario_avaliacao_fisica.perimetros_corporais_cm[key].valor =
                        event.target.value === "" ? null : Number(event.target.value);
                    })
                  }
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="student-assessment-section">
        <h2>Fotos para análise visual</h2>
        <p className="student-assessment-hint">{data.fotos_analise_visual.instrucao}</p>
        <div className="student-assessment-grid">
          {assessmentPhotoFields.map(([key, label]) => {
            const fileName = data.fotos_analise_visual.arquivos[key];
            const preview = photoPreviews[key] || (/^https?:\/\//i.test(fileName) ? mediaUrl(fileName) : "");
            return (
              <div className="student-assessment-field" key={key}>
                <label>{label}</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => onPhotoSelect(key, event.target.files?.[0])}
                />
                {preview && (
                  <div className="student-assessment-photo-confirm">
                    <img src={preview} alt={label} />
                    <div>
                      <strong><Check size={16} /> Foto enviada</strong>
                      <span>{photoPreviews[key] ? fileName : "Imagem atual da avaliação"}</span>
                      <button type="button" onClick={() => onPhotoSelect(key, undefined)}>
                        Remover
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="student-assessment-actions">
        <button className="student-green-button" type="submit" disabled={submitting}>
          {submitting ? submittingLabel : submitLabel}
        </button>
        <button className="student-outline-button" type="button" disabled={submitting} onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </form>
  );
}
