import { useMemo, useState } from "react";
import { Alert, Image, Modal, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { apiPost, apiPut, apiUploadFile, NativeApiError } from "../../auth/api";
import { mediaUrl } from "../../lib/media";
import * as ImagePicker from "expo-image-picker";
import {
  assessmentPerimeterKeys,
  assessmentPhotoFields,
  cloneAssessmentForm,
  createEmptyAssessmentForm,
  parseNumber
} from "../../student/assessments";
import { calculateBodyFatEstimate } from "../../student/body-composition";
import { studentLocationLabel } from "../../student/commerce";
import { trainingCopy } from "../../student/copy";
import { BackChip, EmptyState, GreenButton, OutlineButton, SheetHeading, StudentPage } from "../../student/layout";
import { useMenuStyles } from "../../student/menuStyles";
import { useStudent } from "../../student/StudentContext";
import { useSt } from "../../student/theme";
import { uiSounds } from "../../student/uiSounds";
import { formatDate, formatDateTime } from "../../theme";
import type { PhysicalAssessmentForm } from "../../types";

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function calendarCells(year: number, month: number) {
  const first = new Date(year, month - 1, 1);
  const startPad = first.getDay();
  const days = new Date(year, month, 0).getDate();
  const cells: Array<{ day?: number; isoDate?: string }> = Array.from({ length: startPad }, () => ({}));
  for (let day = 1; day <= days; day += 1) {
    const isoDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ day, isoDate });
  }
  return cells;
}

export function AssessmentsScreen() {
  const { assessments, profile, session, refresh } = useStudent();
  const { st } = useSt();
  const styles = useMenuStyles();
  const navigation = useNavigation();
  const latest = assessments[0];
  const [form, setForm] = useState<PhysicalAssessmentForm | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);

  function update(mutate: (draft: PhysicalAssessmentForm) => void) {
    setForm((current) => {
      const draft = current ? cloneAssessmentForm(current) : createEmptyAssessmentForm(profile);
      mutate(draft);
      return draft;
    });
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    try {
      if (editingId) await apiPut(`/user/physical-assessments/${editingId}`, form, session.token);
      else await apiPost("/user/physical-assessments", form, session.token);
      setForm(null);
      setEditingId(null);
      await refresh();
      uiSounds.success();
    } catch (caught) {
      Alert.alert("Avaliação", caught instanceof NativeApiError ? caught.message : "Não foi possível salvar.");
      uiSounds.error();
    } finally {
      setBusy(false);
    }
  }

  const data = form?.formulario_avaliacao_fisica;
  const fatEstimate = data
    ? calculateBodyFatEstimate({
        gender: data.dados_pessoais_e_objetivos.genero_biologico.resposta,
        heightCm: data.composicao_corporal_basica.altura_cm,
        neckCm: data.perimetros_corporais_cm.pescoço.valor,
        waistCm: data.perimetros_corporais_cm.cintura.valor,
        hipCm: data.perimetros_corporais_cm.quadril.valor,
        weightKg: data.composicao_corporal_basica.peso_atual_kg,
        birthDate: data.dados_pessoais_e_objetivos.data_nascimento
      })
    : null;
  const latestFat =
    latest?.bodyFatPct ??
    (latest?.details
      ? calculateBodyFatEstimate({
          gender: latest.details.formulario_avaliacao_fisica.dados_pessoais_e_objetivos.genero_biologico.resposta,
          heightCm: latest.heightCm ?? latest.details.formulario_avaliacao_fisica.composicao_corporal_basica.altura_cm,
          neckCm: latest.details.formulario_avaliacao_fisica.perimetros_corporais_cm.pescoço.valor,
          waistCm: latest.waistCm ?? latest.details.formulario_avaliacao_fisica.perimetros_corporais_cm.cintura.valor,
          hipCm: latest.details.formulario_avaliacao_fisica.perimetros_corporais_cm.quadril.valor,
          weightKg: latest.weightKg ?? latest.details.formulario_avaliacao_fisica.composicao_corporal_basica.peso_atual_kg,
          birthDate: latest.details.formulario_avaliacao_fisica.dados_pessoais_e_objetivos.data_nascimento
        })?.value
      : null);

  return (
    <StudentPage>
      <BackChip label="Menu" onPress={() => navigation.goBack()} />
      <SheetHeading
        kicker={trainingCopy.physicalAssessment}
        title="Veja sua evolução"
        subtitle={latest ? formatDateTime(latest.assessedAt) : "Sem avaliação cadastrada"}
      />
      {latest ? (
        <View style={styles.metricGrid}>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{latest.weightKg ?? "—"}</Text>
            <Text style={styles.metricLabel}>kg</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{latest.heightCm ?? "—"}</Text>
            <Text style={styles.metricLabel}>cm</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{latestFat ?? "—"}</Text>
            <Text style={styles.metricLabel}>% gordura</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{latest.waistCm ?? "—"}</Text>
            <Text style={styles.metricLabel}>cm cintura</Text>
          </View>
        </View>
      ) : (
        <EmptyState icon="resize-outline" title="Nenhuma avaliação" text="Solicite sua primeira avaliação com a equipe." />
      )}

      {data ? (
        <>
          <View style={styles.card}>
            <Text style={styles.title}>Seu cadastro</Text>
            <Text style={styles.muted}>{studentLocationLabel(profile)}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.gold}>Dados pessoais e objetivos</Text>
            <TextInput
              value={data.dados_pessoais_e_objetivos.nome_completo}
              onChangeText={(value) => update((draft) => { draft.formulario_avaliacao_fisica.dados_pessoais_e_objetivos.nome_completo = value; })}
              placeholder="Seu nome"
              placeholderTextColor={st.faint}
              style={styles.input}
            />
            <TextInput
              value={data.dados_pessoais_e_objetivos.data_nascimento}
              onChangeText={(value) => update((draft) => { draft.formulario_avaliacao_fisica.dados_pessoais_e_objetivos.data_nascimento = value; })}
              placeholder="AAAA-MM-DD"
              placeholderTextColor={st.faint}
              style={styles.input}
            />
            <TextInput
              value={data.dados_pessoais_e_objetivos.genero_biologico.resposta}
              onChangeText={(value) => update((draft) => { draft.formulario_avaliacao_fisica.dados_pessoais_e_objetivos.genero_biologico.resposta = value; })}
              placeholder="Masculino ou Feminino"
              placeholderTextColor={st.faint}
              style={styles.input}
            />
            <TextInput
              value={data.dados_pessoais_e_objetivos.objetivo_principal.resposta}
              onChangeText={(value) => update((draft) => { draft.formulario_avaliacao_fisica.dados_pessoais_e_objetivos.objetivo_principal.resposta = value; })}
              placeholder="Objetivo"
              placeholderTextColor={st.faint}
              style={styles.input}
            />
            <TextInput
              value={data.dados_pessoais_e_objetivos.nivel_atividade_atual.resposta}
              onChangeText={(value) => update((draft) => { draft.formulario_avaliacao_fisica.dados_pessoais_e_objetivos.nivel_atividade_atual.resposta = value; })}
              placeholder="Nível de atividade"
              placeholderTextColor={st.faint}
              style={styles.input}
            />
          </View>
          <View style={styles.card}>
            <Text style={styles.gold}>Histórico de saúde</Text>
            <TextInput
              value={data.historico_de_saude_anamnese.possui_lesao.resposta}
              onChangeText={(value) => update((draft) => { draft.formulario_avaliacao_fisica.historico_de_saude_anamnese.possui_lesao.resposta = value; })}
              placeholder="Lesões"
              placeholderTextColor={st.faint}
              style={styles.input}
            />
            <TextInput
              value={data.historico_de_saude_anamnese.medicamento_continuo.resposta}
              onChangeText={(value) => update((draft) => { draft.formulario_avaliacao_fisica.historico_de_saude_anamnese.medicamento_continuo.resposta = value; })}
              placeholder="Medicação contínua"
              placeholderTextColor={st.faint}
              style={styles.input}
            />
            <TextInput
              value={data.historico_de_saude_anamnese.restricao_medica_cardiaca.resposta}
              onChangeText={(value) => update((draft) => { draft.formulario_avaliacao_fisica.historico_de_saude_anamnese.restricao_medica_cardiaca.resposta = value; })}
              placeholder="Restrição cardíaca"
              placeholderTextColor={st.faint}
              style={styles.input}
            />
          </View>
          <View style={styles.card}>
            <Text style={styles.gold}>Composição corporal</Text>
            <TextInput
              value={data.composicao_corporal_basica.peso_atual_kg?.toString() ?? ""}
              onChangeText={(value) => update((draft) => { draft.formulario_avaliacao_fisica.composicao_corporal_basica.peso_atual_kg = parseNumber(value); })}
              placeholder="Peso (kg)"
              keyboardType="decimal-pad"
              placeholderTextColor={st.faint}
              style={styles.input}
            />
            <TextInput
              value={data.composicao_corporal_basica.altura_cm?.toString() ?? ""}
              onChangeText={(value) => update((draft) => { draft.formulario_avaliacao_fisica.composicao_corporal_basica.altura_cm = parseNumber(value); })}
              placeholder="Altura (cm)"
              keyboardType="decimal-pad"
              placeholderTextColor={st.faint}
              style={styles.input}
            />
            {fatEstimate ? (
              <Text style={styles.muted}>{`% gordura estimada (${fatEstimate.method}): ${fatEstimate.value}`}</Text>
            ) : (
              <Text style={styles.faint}>Preencha altura, pescoço e cintura para estimar o % de gordura.</Text>
            )}
          </View>
          <View style={styles.card}>
            <Text style={styles.gold}>Perímetros (cm)</Text>
            {assessmentPerimeterKeys.map((key) => (
              <View key={key} style={styles.field}>
                <Text style={styles.label}>{key.replace(/_/g, " ")}</Text>
                <TextInput
                  value={data.perimetros_corporais_cm[key].valor?.toString() ?? ""}
                  onChangeText={(value) =>
                    update((draft) => {
                      draft.formulario_avaliacao_fisica.perimetros_corporais_cm[key].valor = parseNumber(value);
                    })
                  }
                  keyboardType="decimal-pad"
                  placeholderTextColor={st.faint}
                  style={styles.input}
                />
              </View>
            ))}
          </View>
          <View style={styles.card}>
            <Text style={styles.gold}>Fotos (frente, costas e perfil)</Text>
            {assessmentPhotoFields.map(([key, label]) => {
              const raw = data.fotos_analise_visual.arquivos[key];
              const url = mediaUrl(raw);
              return (
                <View key={key} style={{ gap: 6 }}>
                  <Text style={styles.label}>{label}</Text>
                  {url ? (
                    <Pressable
                      onPress={() => {
                        const urls = assessmentPhotoFields
                          .map(([photoKey]) => mediaUrl(data.fotos_analise_visual.arquivos[photoKey]))
                          .filter((item): item is string => Boolean(item));
                        setLightbox({ urls, index: Math.max(0, urls.indexOf(url)) });
                      }}
                    >
                      <Image source={{ uri: url }} style={{ width: "100%", height: 160, borderRadius: 12 }} />
                    </Pressable>
                  ) : null}
                  <OutlineButton
                    label={url ? "Trocar foto" : "Anexar foto"}
                    icon="camera-outline"
                    onPress={() => {
                      void (async () => {
                        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
                        if (result.canceled || !result.assets[0]) return;
                        try {
                          const uploaded = await apiUploadFile<{ file: { url: string } }>(
                            "/user/uploads",
                            result.assets[0].uri,
                            session.token,
                            result.assets[0].fileName ?? `${key}.jpg`
                          );
                          update((draft) => {
                            draft.formulario_avaliacao_fisica.fotos_analise_visual.arquivos[key] = uploaded.file.url;
                          });
                          uiSounds.screenshot();
                        } catch (caught) {
                          Alert.alert("Foto", caught instanceof NativeApiError ? caught.message : "Não foi possível enviar.");
                          uiSounds.error();
                        }
                      })();
                    }}
                  />
                </View>
              );
            })}
          </View>
          <View style={styles.pad}>
            <GreenButton
              label={editingId ? "Atualizar avaliação física" : "Salvar avaliação física"}
              loading={busy}
              onPress={() => void save()}
            />
            <OutlineButton
              label="Cancelar avaliação"
              onPress={() => {
                setForm(null);
                setEditingId(null);
                uiSounds.popupClose();
              }}
            />
          </View>
        </>
      ) : (
        <View style={styles.pad}>
          <OutlineButton
            label="Preencher avaliação física"
            onPress={() => {
              uiSounds.popupOpen();
              setEditingId(null);
              setForm(createEmptyAssessmentForm(profile));
            }}
          />
        </View>
      )}

      {assessments.length > 0 ? (
        <>
          <SheetHeading kicker="Histórico" title="Histórico de avaliações físicas" subtitle={String(assessments.length)} />
          {assessments.map((item) => {
            const formData = item.details?.formulario_avaliacao_fisica;
            const bodyFat = item.bodyFatPct ?? null;
            const waist = item.waistCm ?? formData?.perimetros_corporais_cm.cintura.valor ?? null;
            const open = expandedId === item.id;
            return (
              <View key={item.id} style={styles.card}>
                <Text style={styles.title}>{formatDateTime(item.assessedAt)}</Text>
                <Text style={styles.badge}>{item.source === "ADMIN" ? "Registrada pelo admin" : "Enviada pelo aluno"}</Text>
                <Text style={styles.muted}>{studentLocationLabel(profile)}</Text>
                <Text style={styles.muted}>
                  {`${item.weightKg ?? formData?.composicao_corporal_basica.peso_atual_kg ?? "—"} kg`}
                  {bodyFat != null ? ` · ${bodyFat}% gordura` : ""}
                  {waist != null ? ` · ${waist} cm cintura` : ""}
                </Text>
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  <OutlineButton
                    label={open ? "Ocultar" : "Ver detalhes"}
                    onPress={() => setExpandedId(open ? null : item.id)}
                  />
                  {item.source !== "ADMIN" ? (
                    <OutlineButton
                      label="Editar"
                      icon="pencil-outline"
                      onPress={() => {
                        setEditingId(item.id);
                        setForm(item.details ? cloneAssessmentForm(item.details) : createEmptyAssessmentForm(profile));
                        uiSounds.itemSelect();
                      }}
                    />
                  ) : null}
                </View>
                {open ? (
                  formData ? (
                    <View style={{ gap: 10 }}>
                      <Text style={styles.gold}>Dados pessoais</Text>
                      <Text style={styles.muted}>{`Nome ${formData.dados_pessoais_e_objetivos.nome_completo || "—"}`}</Text>
                      <Text style={styles.muted}>{`Nascimento ${formData.dados_pessoais_e_objetivos.data_nascimento || "—"}`}</Text>
                      <Text style={styles.muted}>{`Gênero ${formData.dados_pessoais_e_objetivos.genero_biologico.resposta || "—"}`}</Text>
                      <Text style={styles.muted}>{`Objetivo ${formData.dados_pessoais_e_objetivos.objetivo_principal.resposta || "—"}`}</Text>
                      <Text style={styles.gold}>Histórico de saúde</Text>
                      <Text style={styles.muted}>{`Lesões ${formData.historico_de_saude_anamnese.possui_lesao.resposta || "Nenhuma informada"}`}</Text>
                      <Text style={styles.muted}>{`Medicação ${formData.historico_de_saude_anamnese.medicamento_continuo.resposta || "Nenhuma informada"}`}</Text>
                      <Text style={styles.muted}>{`Restrição cardíaca ${formData.historico_de_saude_anamnese.restricao_medica_cardiaca.resposta || "Nenhuma informada"}`}</Text>
                      <Text style={styles.gold}>Perímetros (cm)</Text>
                      {assessmentPerimeterKeys.map((key) => (
                        <Text key={key} style={styles.muted}>
                          {`${key.replace(/_/g, " ")} ${formData.perimetros_corporais_cm[key].valor ?? "—"}`}
                        </Text>
                      ))}
                      {assessmentPhotoFields.some(([key]) => formData.fotos_analise_visual.arquivos[key]) ? (
                        <>
                          <Text style={styles.gold}>Fotos anexadas</Text>
                          {assessmentPhotoFields.map(([key, label]) => {
                            const url = mediaUrl(formData.fotos_analise_visual.arquivos[key]);
                            if (!url) return null;
                            return (
                              <View key={key} style={{ gap: 6 }}>
                                <Text style={styles.muted}>{label}</Text>
                                <Pressable
                                  onPress={() => {
                                    const urls = assessmentPhotoFields
                                      .map(([photoKey]) => mediaUrl(formData.fotos_analise_visual.arquivos[photoKey]))
                                      .filter((item): item is string => Boolean(item));
                                    setLightbox({ urls, index: Math.max(0, urls.indexOf(url)) });
                                  }}
                                >
                                  <Image source={{ uri: url }} style={{ width: "100%", height: 180, borderRadius: 12 }} />
                                </Pressable>
                              </View>
                            );
                          })}
                        </>
                      ) : null}
                    </View>
                  ) : (
                    <View style={{ gap: 6 }}>
                      <Text style={styles.muted}>{`Peso ${item.weightKg ?? "—"} kg`}</Text>
                      <Text style={styles.muted}>{`Altura ${item.heightCm ?? "—"} cm`}</Text>
                      <Text style={styles.muted}>{`Gordura ${item.bodyFatPct ?? "—"}%`}</Text>
                      <Text style={styles.muted}>{`Cintura ${item.waistCm ?? "—"} cm`}</Text>
                      {item.notes ? <Text style={styles.muted}>{item.notes}</Text> : null}
                    </View>
                  )
                ) : null}
              </View>
            );
          })}
        </>
      ) : null}
      <Modal visible={Boolean(lightbox)} transparent animationType="fade" onRequestClose={() => setLightbox(null)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "center" }} onPress={() => setLightbox(null)}>
          {lightbox ? (
            <View style={{ padding: 16, gap: 12 }}>
              <Image source={{ uri: lightbox.urls[lightbox.index] }} style={{ width: "100%", aspectRatio: 3 / 4, borderRadius: 12 }} />
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Pressable
                  onPress={() =>
                    setLightbox((current) =>
                      current ? { ...current, index: (current.index - 1 + current.urls.length) % current.urls.length } : current
                    )
                  }
                >
                  <Text style={{ color: "#fff", fontWeight: "800" }}>Anterior</Text>
                </Pressable>
                <Text style={{ color: "#fff", fontWeight: "700" }}>{`${(lightbox.index ?? 0) + 1} / ${lightbox.urls.length}`}</Text>
                <Pressable
                  onPress={() =>
                    setLightbox((current) => (current ? { ...current, index: (current.index + 1) % current.urls.length } : current))
                  }
                >
                  <Text style={{ color: "#fff", fontWeight: "800" }}>Próxima</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </StudentPage>
  );
}

export function StatusScreen() {
  const { attendance, consistency, streak } = useStudent();
  const navigation = useNavigation();
  const { st } = useSt();
  const styles = useMenuStyles();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const year = now.getFullYear();
  const completed = useMemo(
    () => new Set((consistency?.completedDates ?? consistency?.historyDates ?? []).map((item) => item.slice(0, 10))),
    [consistency]
  );
  const cells = calendarCells(year, month);
  const doneThisMonth = cells.filter((cell) => cell.isoDate && completed.has(cell.isoDate)).length;
  const todayIso = now.toISOString().slice(0, 10);
  const attendanceThisMonth = attendance.filter((item) => {
    const date = new Date(item.date);
    return date.getMonth() + 1 === now.getMonth() + 1 && date.getFullYear() === now.getFullYear();
  }).length;
  const workoutsDone = consistency?.completedWorkoutCount ?? 0;
  const totalDays = consistency?.totalWorkoutDays ?? 0;

  return (
    <StudentPage>
      <BackChip label="Menu" onPress={() => navigation.goBack()} />
      <SheetHeading kicker="Frequência" title="Acessos e ofensiva" subtitle="Sua constância na academia, dia a dia." />
      <View style={styles.metricGrid}>
        <View style={styles.metric}>
          <Text style={styles.metricValue}>{streak}</Text>
          <Text style={styles.metricLabel}>dias de ofensiva</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricValue}>{`${workoutsDone}/${totalDays}`}</Text>
          <Text style={styles.metricLabel}>treinos feitos</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricValue}>{attendanceThisMonth}</Text>
          <Text style={styles.metricLabel}>acessos no mês</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricValue}>{attendance.length}</Text>
          <Text style={styles.metricLabel}>acessos registrados</Text>
        </View>
      </View>
      <View style={styles.card}>
        <View style={styles.row}>
          <Pressable disabled={month <= 1} onPress={() => setMonth((value) => Math.max(1, value - 1))}>
            <Ionicons name="chevron-back" size={20} color={month <= 1 ? st.faint : st.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.faint}>Treinos concluídos</Text>
            <Text style={styles.title}>{monthLabel(year, month)}</Text>
          </View>
          <Pressable disabled={month >= now.getMonth() + 1} onPress={() => setMonth((value) => Math.min(now.getMonth() + 1, value + 1))}>
            <Ionicons name="chevron-forward" size={20} color={month >= now.getMonth() + 1 ? st.faint : st.text} />
          </Pressable>
          <Text style={styles.faint}>{doneThisMonth} treino(s) no mês</Text>
        </View>
        <View style={styles.calendarGrid}>
          {WEEKDAYS.map((day, index) => (
            <View key={`${day}-${index}`} style={styles.calendarCell}>
              <Text style={styles.faint}>{day}</Text>
            </View>
          ))}
          {cells.map((cell, index) => {
            const done = Boolean(cell.isoDate && completed.has(cell.isoDate));
            const today = cell.isoDate === todayIso;
            return (
              <View key={`${cell.isoDate ?? "empty"}-${index}`} style={styles.calendarCell}>
                {cell.day ? (
                  <View style={[done && styles.calendarDone, today && styles.calendarToday]}>
                    <Text style={[styles.calendarDay, done && { color: "#fff" }]}>{cell.day}</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
        <Text style={styles.muted}>Dias marcados representam treinos concluídos. O calendário mostra o mês atual e meses anteriores.</Text>
      </View>
      <SheetHeading kicker="Acessos" title="Registros de acesso" />
      {attendance.length === 0 ? (
        <EmptyState icon="calendar-outline" title="Nenhum acesso registrado" text="Registre sua presença com o QR de check-in na recepção." />
      ) : (
        attendance.map((item) => (
          <View key={item.id} style={styles.card}>
            <Text style={styles.title}>{formatDate(item.date)}</Text>
            <Text style={styles.muted}>Presença registrada</Text>
          </View>
        ))
      )}
    </StudentPage>
  );
}
