import { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiPut, NativeApiError } from "../../auth/api";
import { GreenButton, OutlineButton } from "../../student/layout";
import { useStudent } from "../../student/StudentContext";
import { useSt, type StudentTokens } from "../../student/theme";
import { uiSounds } from "../../student/uiSounds";

const GOALS = [
  { id: "hypertrophy", label: "Ganhar massa muscular (hipertrofia)" },
  { id: "fat_loss", label: "Perder gordura / definição" },
  { id: "conditioning", label: "Condicionamento físico" }
] as const;

const LEVELS = [
  { id: "beginner", label: "Iniciante", desc: "Pouca ou nenhuma experiência prévia" },
  { id: "intermediate", label: "Intermediário", desc: "Já treina há alguns meses" },
  { id: "advanced", label: "Avançado", desc: "Treina há anos e domina a execução" }
] as const;

const EQUIPMENT = [
  { id: "gym", label: "Academia completa" },
  { id: "dumbbells", label: "Halteres / anilhas" },
  { id: "bodyweight", label: "Peso corporal" },
  { id: "bands", label: "Elásticos / bands" }
] as const;

const DAYS = ["3", "4", "5", "6"] as const;

function useOnboardingStyles() {
  const { st } = useSt();
  return useMemo(() => createOnboardingStyles(st), [st]);
}

function Chip({
  label,
  selected,
  onPress
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const styles = useOnboardingStyles();
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipOn]}>
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

export function OnboardingScreen() {
  const { profile, session, refresh, logout } = useStudent();
  const styles = useOnboardingStyles();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(profile?.name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [gender, setGender] = useState<"MALE" | "FEMALE" | "">(profile?.gender ?? "");
  const [birthYear, setBirthYear] = useState(
    profile?.birthDate ? String(new Date(profile.birthDate).getUTCFullYear()) : ""
  );
  const [goal, setGoal] = useState<(typeof GOALS)[number]["id"]>("hypertrophy");
  const [daysPerWeek, setDaysPerWeek] = useState<(typeof DAYS)[number]>("4");
  const [level, setLevel] = useState<(typeof LEVELS)[number]["id"]>("beginner");
  const [equipment, setEquipment] = useState<string[]>(
    profile?.equipmentTags?.length ? profile.equipmentTags : ["gym"]
  );
  const genderLocked = Boolean(profile?.gender);

  const blurb = useMemo(() => {
    const audience = gender === "FEMALE" ? "feminino" : "masculino";
    const goalLabel = GOALS.find((item) => item.id === goal)?.label ?? goal;
    const levelLabel = LEVELS.find((item) => item.id === level)?.label ?? level;
    return `Com base no seu perfil (${levelLabel.toLowerCase()}, ${daysPerWeek}x/semana, foco em ${goalLabel.toLowerCase()}), liberaremos os treinos publicados da academia para o público ${audience}.`;
  }, [daysPerWeek, gender, goal, level]);

  function toggleEquipment(id: string) {
    setEquipment((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function submit() {
    if (name.trim().length < 2) {
      Alert.alert("Perfil", "Informe seu nome.");
      uiSounds.error();
      return;
    }
    if (!gender) {
      Alert.alert("Perfil", "Selecione o sexo.");
      uiSounds.error();
      return;
    }
    if (equipment.length === 0) {
      Alert.alert("Perfil", "Selecione ao menos um equipamento.");
      uiSounds.error();
      return;
    }
    setBusy(true);
    try {
      const year = Number(birthYear);
      const current = new Date().getFullYear();
      const birthDate =
        year >= current - 100 && year <= current - 12 ? `${year}-01-01T12:00:00.000Z` : undefined;
      await apiPut(
        "/user/profile",
        {
          name: name.trim(),
          phone: phone.trim() || undefined,
          ...(profile?.gender ? {} : { gender }),
          birthDate,
          objective: GOALS.find((item) => item.id === goal)?.label,
          level: LEVELS.find((item) => item.id === level)?.label,
          daysPerWeek: Number(daysPerWeek),
          equipmentTags: equipment
        },
        session.token
      );
      uiSounds.success();
      await refresh();
    } catch (caught) {
      Alert.alert("Perfil", caught instanceof NativeApiError ? caught.message : "Não foi possível concluir o onboarding.");
      uiSounds.error();
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "right", "bottom", "left"]}>
      <Text style={styles.kicker}>Personalização</Text>
      <Text style={styles.title}>Complete seu perfil de treino</Text>
      <Text style={styles.copy}>Faltam alguns dados para liberar os treinos certos para o seu perfil.</Text>

      {step === 1 ? (
        <View style={styles.card}>
          <Text style={styles.label}>Nome completo</Text>
          <TextInput value={name} onChangeText={setName} style={styles.input} />
          <Text style={styles.label}>E-mail</Text>
          <TextInput editable={false} value={profile?.email ?? ""} style={[styles.input, { opacity: 0.7 }]} />
          <Text style={styles.label}>Telefone</Text>
          <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={styles.input} />
        </View>
      ) : null}

      {step === 2 ? (
        <View style={styles.card}>
          <Text style={styles.label}>Sexo</Text>
          <View style={styles.row}>
            <Chip label="Masculino" selected={gender === "MALE"} onPress={() => !genderLocked && setGender("MALE")} />
            <Chip label="Feminino" selected={gender === "FEMALE"} onPress={() => !genderLocked && setGender("FEMALE")} />
          </View>
          {genderLocked ? <Text style={styles.hint}>Definido no cadastro · só a academia altera</Text> : null}
          <Text style={styles.label}>Ano de nascimento</Text>
          <TextInput value={birthYear} onChangeText={setBirthYear} keyboardType="number-pad" maxLength={4} style={styles.input} />
          <Text style={styles.label}>Objetivo</Text>
          {GOALS.map((item) => (
            <Chip key={item.id} label={item.label} selected={goal === item.id} onPress={() => setGoal(item.id)} />
          ))}
          <Text style={styles.label}>Dias por semana</Text>
          <View style={styles.row}>
            {DAYS.map((item) => (
              <Chip key={item} label={`${item}x`} selected={daysPerWeek === item} onPress={() => setDaysPerWeek(item)} />
            ))}
          </View>
        </View>
      ) : null}

      {step === 3 ? (
        <View style={styles.card}>
          <Text style={styles.label}>Nível</Text>
          {LEVELS.map((item) => (
            <Pressable key={item.id} onPress={() => setLevel(item.id)} style={[styles.level, level === item.id && styles.chipOn]}>
              <Text style={[styles.chipText, level === item.id && styles.chipTextOn]}>{item.label}</Text>
              <Text style={styles.hint}>{item.desc}</Text>
            </Pressable>
          ))}
          <Text style={styles.label}>Equipamento</Text>
          {EQUIPMENT.map((item) => (
            <Chip key={item.id} label={item.label} selected={equipment.includes(item.id)} onPress={() => toggleEquipment(item.id)} />
          ))}
          <Text style={styles.copy}>{blurb}</Text>
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        {step < 3 ? (
          <GreenButton
            label="Continuar"
            onPress={() => {
              uiSounds.pageChange();
              setStep((value) => value + 1);
            }}
          />
        ) : (
          <GreenButton label="Concluir perfil" loading={busy} onPress={() => void submit()} />
        )}
        {step > 1 ? <OutlineButton label="Voltar" onPress={() => setStep((value) => value - 1)} /> : null}
        <OutlineButton label="Sair" onPress={logout} />
      </View>
    </SafeAreaView>
  );
}

function createOnboardingStyles(st: StudentTokens) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: st.bg, padding: 20, gap: 12 },
    kicker: { color: st.goldUi, fontSize: 11, fontWeight: "800", letterSpacing: 1.4, textTransform: "uppercase" },
    title: { color: st.text, fontSize: 28, fontWeight: "900" },
    copy: { color: st.muted, fontSize: 14, lineHeight: 20 },
    card: { gap: 10, backgroundColor: st.card, borderRadius: 16, borderWidth: 1, borderColor: st.line, padding: 16 },
    label: { color: st.goldUi, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
    input: { borderWidth: 1, borderColor: st.line, borderRadius: 12, padding: 12, color: st.text, backgroundColor: st.inputBg },
    row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: { borderWidth: 1, borderColor: st.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: st.inputBg },
    chipOn: { backgroundColor: st.coral, borderColor: st.coral },
    chipText: { color: st.text, fontWeight: "800", fontSize: 13 },
    chipTextOn: { color: "#fff" },
    hint: { color: st.faint, fontSize: 12 },
    level: { borderWidth: 1, borderColor: st.line, borderRadius: 14, padding: 12, gap: 4, backgroundColor: st.inputBg }
  });
}
