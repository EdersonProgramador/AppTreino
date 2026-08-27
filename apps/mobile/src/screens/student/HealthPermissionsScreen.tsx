import { useEffect, useState } from "react";
import { Alert, Pressable, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { BackChip, GreenButton, OutlineButton, SheetHeading, StudentPage } from "../../student/layout";
import { useMenuStyles } from "../../student/menuStyles";
import { useSt } from "../../student/theme";
import { uiSounds } from "../../student/uiSounds";
import {
  HEALTH_READ_TYPES,
  HEALTH_UPDATE_TYPES,
  denyHealthAccess,
  getHealthGrants,
  hydrateHealthGrants,
  requestHealthAccess,
  subscribeHealthGrants,
  type HealthDataType
} from "../../student/healthPermissions";
import { readTodaySteps } from "../../student/healthBridge";

export function HealthPermissionsScreen() {
  const navigation = useNavigation();
  const { st } = useSt();
  const styles = useMenuStyles();
  const [grants, setGrants] = useState(getHealthGrants());
  const [busy, setBusy] = useState(false);
  const [hrOpen, setHrOpen] = useState(false);
  const [todaySteps, setTodaySteps] = useState<number | null>(null);

  useEffect(() => {
    void hydrateHealthGrants();
    void readTodaySteps().then((snap) => setTodaySteps(snap.steps));
    return subscribeHealthGrants(setGrants);
  }, []);

  async function allowAll() {
    setBusy(true);
    try {
      await requestHealthAccess();
      const snap = await readTodaySteps();
      setTodaySteps(snap.steps);
      uiSounds.success();
    } catch (caught) {
      Alert.alert("Saúde", caught instanceof Error ? caught.message : "Não foi possível pedir as permissões.");
      uiSounds.error();
    } finally {
      setBusy(false);
    }
  }

  async function deny() {
    await denyHealthAccess();
    uiSounds.toggleOff();
  }

  const allowed = Object.values(grants).filter(Boolean).length;

  return (
    <StudentPage>
      <BackChip label="Menu" onPress={() => navigation.goBack()} />
      <SheetHeading
        kicker="Saúde"
        title="O Apptreino deseja acessar e atualizar seus dados de saúde."
        subtitle="Usamos esses dados para treino, corrida e ofensiva. Você controla o que o app pode ler."
      />

      <View style={styles.card}>
        <Text style={styles.gold}>Passos de hoje</Text>
        <Text style={styles.title}>{todaySteps != null ? `${todaySteps} passos` : "Permita o movimento para ler o pedômetro."}</Text>
        <Text style={styles.faint}>
          iOS pede Motion. Android pede reconhecimento de atividade e, para FC, sensores do corpo. HealthKit/Health Connect
          completo entra no rebuild nativo; os passos já são reais.
        </Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.gold}>Permitir que o Apptreino atualize</Text>
        {HEALTH_UPDATE_TYPES.map((item) => (
          <View key={item.id} style={styles.row}>
            <Ionicons name={grants[item.id] ? "checkmark-circle" : "ellipse-outline"} size={18} color={st.gold} />
            <Text style={styles.muted}>{item.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.gold}>Permitir que o Apptreino leia</Text>
        {HEALTH_READ_TYPES.map((item) => (
          <View key={item.id} style={[styles.row, { alignItems: "flex-start" }]}>
            <Switch
              value={grants[item.id]}
              onValueChange={() => {
                uiSounds.itemSelect();
                void requestHealthAccess([item.id as HealthDataType]);
              }}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{item.label}</Text>
              <Text style={styles.faint}>{item.hint}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Pressable
          onPress={() => {
            uiSounds.popupOpen();
            setHrOpen((value) => !value);
          }}
          style={styles.row}
        >
          <Ionicons name="heart-outline" size={22} color={st.coral} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Monitorar FC com o relógio</Text>
            <Text style={styles.muted}>Toque para ver a explicação</Text>
          </View>
        </Pressable>
        {hrOpen ? (
          <Text style={styles.muted}>
            Para monitorar a FC com o seu relógio, precisamos de permissão para acessar o sensor de frequência cardíaca.
          </Text>
        ) : null}
      </View>

      <View style={styles.pad}>
        <GreenButton
          label={busy ? "Solicitando…" : allowed ? "Atualizar permissões" : "Permitir acesso à Saúde"}
          loading={busy}
          onPress={() => void allowAll()}
        />
        <OutlineButton label="Não permitir" onPress={() => void deny()} />
      </View>
    </StudentPage>
  );
}
