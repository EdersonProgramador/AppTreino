import { useMemo, useState, type ReactNode } from "react";
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AtllyPrimaryButton, AtllySecondaryButton, cinema } from "../auth/atllyAuthUi";
import { WEB_URL } from "../config";
import {
  birthDateFromYear,
  defaultOnboardingValues,
  EQUIPMENT_OPTIONS,
  formatCpf,
  goalLabel,
  levelLabel,
  suggestProgramBlurb,
  TRAINING_GOALS,
  TRAINING_LEVELS,
  validateOnboardingStep,
  type BillingPreference,
  type OnboardingFormValues,
  type OnboardingSubmitPayload
} from "../lib/onboarding";
import { uiSounds } from "../student/uiSounds";

export function WorkoutOnboardingForm({
  selectedPlanName,
  submitting,
  error,
  onSubmit,
  onCancel
}: {
  selectedPlanName?: string | null;
  submitting?: boolean;
  error?: string | null;
  onSubmit: (payload: OnboardingSubmitPayload) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [values, setValues] = useState<OnboardingFormValues>(defaultOnboardingValues);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const styles = useMemo(() => createStyles(), []);

  function patch<K extends keyof OnboardingFormValues>(key: K, value: OnboardingFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[key as string];
      return next;
    });
  }

  function toggleEquipment(id: OnboardingFormValues["equipment"][number]) {
    setValues((current) => {
      const has = current.equipment.includes(id);
      const equipment = has ? current.equipment.filter((item) => item !== id) : [...current.equipment, id];
      return { ...current, equipment };
    });
  }

  function goNext() {
    const errors = validateOnboardingStep(step, values);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      uiSounds.error();
      return;
    }
    uiSounds.toggleOn();
    setStep((current) => (current < 4 ? ((current + 1) as 1 | 2 | 3 | 4) : current));
  }

  async function submitFinal() {
    const errors = validateOnboardingStep(4, values);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      uiSounds.error();
      return;
    }
    uiSounds.submit();
    await onSubmit({
      ...values,
      birthDate: birthDateFromYear(values.birthYear),
      objective: goalLabel(values.goal),
      daysPerWeekNumber: Number(values.daysPerWeek)
    });
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <View style={styles.headCopy}>
          <Text style={styles.headTitle}>Monte seu treino</Text>
          <Text style={styles.headStep}>Etapa {step} de 4</Text>
        </View>
        {onCancel ? (
          <Pressable onPress={onCancel}>
            <Text style={styles.cancel}>Cancelar</Text>
          </Pressable>
        ) : null}
      </View>

      {selectedPlanName ? (
        <View style={styles.planBox}>
          <Text style={styles.planLabel}>Plano selecionado</Text>
          <Text style={styles.planName}>{selectedPlanName}</Text>
        </View>
      ) : null}

      <View style={styles.progress}>
        {[1, 2, 3, 4].map((item) => (
          <View key={item} style={[styles.progressBar, step >= item && styles.progressBarOn]} />
        ))}
      </View>

      {step === 1 ? (
        <View style={styles.step}>
          <Field label="Nome completo" value={values.name} onChangeText={(v) => patch("name", v)} error={fieldErrors.name} />
          <Field
            label="E-mail"
            value={values.email}
            onChangeText={(v) => patch("email", v)}
            keyboardType="email-address"
            autoCapitalize="none"
            error={fieldErrors.email}
          />
          <Field label="Telefone" value={values.phone} onChangeText={(v) => patch("phone", v)} keyboardType="phone-pad" error={fieldErrors.phone} />
          <Field
            label="CPF"
            value={values.document}
            onChangeText={(v) => patch("document", formatCpf(v))}
            keyboardType="number-pad"
            error={fieldErrors.document}
            hint="Informe os 11 dígitos do CPF. Obrigatório para pagamento via Pix."
          />
          <Field label="Senha" value={values.password} onChangeText={(v) => patch("password", v)} secureTextEntry error={fieldErrors.password} />
        </View>
      ) : null}

      {step === 2 ? (
        <View style={styles.step}>
          <Text style={styles.fieldLabel}>Sexo</Text>
          <View style={styles.chips}>
            {(["MALE", "FEMALE"] as const).map((value) => (
              <Pressable key={value} style={[styles.chip, values.gender === value && styles.chipOn]} onPress={() => patch("gender", value)}>
                <Text style={[styles.chipText, values.gender === value && styles.chipTextOn]}>
                  {value === "MALE" ? "Masculino" : "Feminino"}
                </Text>
              </Pressable>
            ))}
          </View>
          {fieldErrors.gender ? <Text style={styles.error}>{fieldErrors.gender}</Text> : null}

          <Field
            label="Ano de nascimento"
            value={values.birthYear}
            onChangeText={(v) => patch("birthYear", v.replace(/\D/g, "").slice(0, 4))}
            keyboardType="number-pad"
            placeholder="Ex.: 1995"
            error={fieldErrors.birthYear}
          />

          <Text style={styles.sectionTitle}>Qual seu objetivo principal?</Text>
          {TRAINING_GOALS.map((item) => (
            <ChoiceRow
              key={item.id}
              label={item.label}
              active={values.goal === item.id}
              onPress={() => patch("goal", item.id)}
            />
          ))}
          {fieldErrors.goal ? <Text style={styles.error}>{fieldErrors.goal}</Text> : null}

          <Text style={styles.fieldLabel}>Dias por semana</Text>
          <View style={styles.chips}>
            {(["3", "4", "5", "6"] as const).map((value) => (
              <Pressable
                key={value}
                style={[styles.chip, values.daysPerWeek === value && styles.chipOn]}
                onPress={() => patch("daysPerWeek", value)}
              >
                <Text style={[styles.chipText, values.daysPerWeek === value && styles.chipTextOn]}>{value} dias</Text>
              </Pressable>
            ))}
          </View>
          {fieldErrors.daysPerWeek ? <Text style={styles.error}>{fieldErrors.daysPerWeek}</Text> : null}
        </View>
      ) : null}

      {step === 3 ? (
        <View style={styles.step}>
          <Text style={styles.sectionTitle}>Qual o seu nível de experiência?</Text>
          {TRAINING_LEVELS.map((item) => (
            <Pressable
              key={item.id}
              style={[styles.levelCard, values.level === item.id && styles.levelCardOn]}
              onPress={() => patch("level", item.id)}
            >
              <Text style={styles.levelTitle}>{item.label}</Text>
              <Text style={styles.levelDesc}>{item.desc}</Text>
            </Pressable>
          ))}
          {fieldErrors.level ? <Text style={styles.error}>{fieldErrors.level}</Text> : null}

          <Text style={styles.sectionTitle}>Quais equipamentos você tem disponíveis?</Text>
          {EQUIPMENT_OPTIONS.map((item) => (
            <ChoiceRow
              key={item.id}
              label={item.label}
              active={values.equipment.includes(item.id)}
              onPress={() => toggleEquipment(item.id)}
            />
          ))}
          {fieldErrors.equipment ? <Text style={styles.error}>{fieldErrors.equipment}</Text> : null}
        </View>
      ) : null}

      {step === 4 ? (
        <View style={styles.step}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryTitle}>Confirmação do perfil</Text>
            <SummaryRow label="Objetivo" value={goalLabel(values.goal)} />
            <SummaryRow label="Nível" value={levelLabel(values.level)} />
            <SummaryRow label="Frequência" value={`${values.daysPerWeek} dias/semana`} />
            <SummaryRow label="Público" value={values.gender === "FEMALE" ? "Feminino" : "Masculino"} />
            <Text style={styles.summaryBlurb}>{suggestProgramBlurb(values)}</Text>
          </View>

          <Text style={styles.fieldLabel}>Pagamento</Text>
          <View style={styles.chips}>
            {(
              [
                { value: "UNDEFINED", label: "Escolher no checkout" },
                { value: "PIX", label: "Pix" },
                { value: "CREDIT_CARD", label: "Cartão" }
              ] as const
            ).map((item) => (
              <Pressable
                key={item.value}
                style={[styles.chip, values.billingType === item.value && styles.chipOn]}
                onPress={() => patch("billingType", item.value as BillingPreference)}
              >
                <Text style={[styles.chipText, values.billingType === item.value && styles.chipTextOn]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.lgpdBox}>
            <Text style={styles.lgpdTitle}>Consentimento (LGPD)</Text>
            <CheckRow
              label={
                <>
                  Li e aceito os{" "}
                  <Text style={styles.link} onPress={() => void Linking.openURL(`${WEB_URL}/termos`)}>
                    Termos de Uso
                  </Text>
                  .
                </>
              }
              checked={values.acceptTerms}
              onToggle={() => patch("acceptTerms", !values.acceptTerms)}
            />
            {fieldErrors.acceptTerms ? <Text style={styles.error}>{fieldErrors.acceptTerms}</Text> : null}
            <CheckRow
              label={
                <>
                  Li e aceito a{" "}
                  <Text style={styles.link} onPress={() => void Linking.openURL(`${WEB_URL}/privacidade`)}>
                    Política de Privacidade
                  </Text>
                  .
                </>
              }
              checked={values.acceptPrivacy}
              onToggle={() => patch("acceptPrivacy", !values.acceptPrivacy)}
            />
            {fieldErrors.acceptPrivacy ? <Text style={styles.error}>{fieldErrors.acceptPrivacy}</Text> : null}
          </View>
        </View>
      ) : null}

      <View style={styles.actions}>
        {step > 1 ? (
          <AtllySecondaryButton label="Voltar" onPress={() => setStep((current) => ((current - 1) as 1 | 2 | 3 | 4))} style={styles.backBtn} />
        ) : null}
        {step < 4 ? (
          <AtllyPrimaryButton label="Avançar" onPress={goNext} disabled={submitting} style={styles.nextBtn} />
        ) : (
          <AtllyPrimaryButton
            label="Criar conta e ir ao pagamento"
            loading={submitting}
            disabled={submitting}
            onPress={() => void submitFinal()}
            style={styles.nextBtn}
          />
        )}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  placeholder,
  error,
  hint
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad" | "number-pad";
  autoCapitalize?: "none" | "sentences";
  placeholder?: string;
  error?: string;
  hint?: string;
}) {
  return (
    <>
      <Text style={fieldStyles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        placeholder={placeholder}
        placeholderTextColor={cinema.faint}
        style={[fieldStyles.input, error ? fieldStyles.inputError : null]}
      />
      {hint && !error ? <Text style={fieldStyles.hint}>{hint}</Text> : null}
      {error ? <Text style={fieldStyles.error}>{error}</Text> : null}
    </>
  );
}

function ChoiceRow({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[choiceStyles.row, active && choiceStyles.rowOn]}>
      <Text style={[choiceStyles.text, active && choiceStyles.textOn]}>{label}</Text>
      {active ? <Ionicons name="checkmark-circle" size={18} color={cinema.gold} /> : null}
    </Pressable>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={summaryStyles.row}>
      <Text style={summaryStyles.label}>{label}</Text>
      <Text style={summaryStyles.value}>{value}</Text>
    </View>
  );
}

function CheckRow({
  label,
  checked,
  onToggle
}: {
  label: ReactNode;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable onPress={onToggle} style={fieldStyles.checkRow}>
      <View style={[fieldStyles.checkBox, checked && fieldStyles.checkBoxOn]} />
      <Text style={fieldStyles.checkLabel}>{label}</Text>
    </Pressable>
  );
}

const fieldStyles = StyleSheet.create({
  label: { color: cinema.gold, fontSize: 12, fontWeight: "800", marginTop: 8, textTransform: "uppercase" },
  input: {
    borderWidth: 1,
    borderColor: cinema.lineStrong,
    borderRadius: 12,
    color: cinema.text,
    fontSize: 16,
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: cinema.inputBg
  },
  inputError: { borderColor: "#ffb4a8" },
  hint: { color: cinema.faint, fontSize: 12, lineHeight: 17, marginTop: 4 },
  error: { color: "#ffb4a8", fontSize: 12, fontWeight: "700", marginTop: 4 },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 10 },
  checkBox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: cinema.lineStrong, marginTop: 2 },
  checkBoxOn: { backgroundColor: cinema.coral, borderColor: cinema.coral },
  checkLabel: { color: cinema.muted, flex: 1, fontSize: 13, lineHeight: 18 }
});

const choiceStyles = StyleSheet.create({
  row: {
    borderWidth: 1,
    borderColor: cinema.lineStrong,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  rowOn: { borderColor: cinema.gold, backgroundColor: "rgba(212,175,55,0.08)" },
  text: { color: cinema.muted, flex: 1, fontSize: 14, lineHeight: 20 },
  textOn: { color: cinema.text, fontWeight: "800" }
});

const summaryStyles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  label: { color: cinema.faint, fontSize: 13 },
  value: { color: cinema.text, fontSize: 13, fontWeight: "800", textAlign: "right", flex: 1 }
});

function createStyles() {
  return StyleSheet.create({
    wrap: { gap: 12 },
    headRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, alignItems: "flex-start" },
    headCopy: { gap: 2, flex: 1 },
    headTitle: { color: cinema.gold, fontSize: 20, fontWeight: "900" },
    headStep: { color: cinema.faint, fontSize: 12, fontWeight: "700" },
    cancel: { color: cinema.gold, fontWeight: "800", paddingVertical: 4 },
    planBox: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: "rgba(212,175,55,0.28)",
      backgroundColor: "rgba(212,175,55,0.08)",
      padding: 12,
      gap: 4
    },
    planLabel: { color: cinema.faint, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
    planName: { color: cinema.text, fontSize: 16, fontWeight: "900" },
    progress: { flexDirection: "row", gap: 6 },
    progressBar: { flex: 1, height: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.12)" },
    progressBarOn: { backgroundColor: cinema.gold },
    step: { gap: 8 },
    fieldLabel: { color: cinema.gold, fontSize: 12, fontWeight: "800", marginTop: 4, textTransform: "uppercase" },
    sectionTitle: { color: cinema.text, fontSize: 14, fontWeight: "900", marginTop: 8 },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
    chip: { borderWidth: 1, borderColor: cinema.lineStrong, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
    chipOn: { backgroundColor: cinema.coral, borderColor: cinema.coral },
    chipText: { color: cinema.text, fontWeight: "800", fontSize: 12 },
    chipTextOn: { color: "#fff" },
    levelCard: {
      borderWidth: 1,
      borderColor: cinema.lineStrong,
      borderRadius: 12,
      padding: 12,
      gap: 4
    },
    levelCardOn: { borderColor: cinema.gold, backgroundColor: "rgba(212,175,55,0.08)" },
    levelTitle: { color: cinema.text, fontSize: 14, fontWeight: "900" },
    levelDesc: { color: cinema.faint, fontSize: 12, lineHeight: 17 },
    summaryBox: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: "rgba(212,175,55,0.28)",
      backgroundColor: "rgba(212,175,55,0.08)",
      padding: 14,
      gap: 8
    },
    summaryTitle: { color: cinema.text, fontSize: 16, fontWeight: "900" },
    summaryBlurb: { color: cinema.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
    lgpdBox: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: cinema.line,
      padding: 14,
      gap: 4,
      marginTop: 4
    },
    lgpdTitle: { color: cinema.text, fontSize: 14, fontWeight: "900", marginBottom: 4 },
    link: { color: cinema.gold, textDecorationLine: "underline", fontWeight: "800" },
    actions: { flexDirection: "row", gap: 10, marginTop: 8 },
    backBtn: { width: "34%" },
    nextBtn: { flex: 1 },
    error: { color: cinema.error, fontWeight: "700" }
  });
}
