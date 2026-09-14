import { StyleSheet, Text, View } from "react-native";
import { AtllyPrimaryButton, cinema } from "../auth/atllyAuthUi";
import { formatCpf } from "../lib/cpf";
import type { StudentProfile } from "../types";
import { uiSounds } from "../student/uiSounds";

export function ActivateAccountReview({
  profile,
  planName,
  onContinue
}: {
  profile: StudentProfile;
  planName?: string | null;
  onContinue: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.summary}>
        <SummaryRow label="Nome" value={profile.name ?? "—"} />
        <SummaryRow label="E-mail" value={profile.email ?? "—"} />
        <SummaryRow label="Telefone" value={profile.phone ?? "—"} />
        <SummaryRow label="CPF" value={profile.document ? formatCpf(profile.document) : "—"} />
      </View>
      <Text style={styles.hint}>
        Revise seus dados antes de concluir o pagamento do plano <Text style={styles.strong}>{planName ?? "selecionado"}</Text>.
      </Text>
      <AtllyPrimaryButton
        label="Continuar para pagamento"
        onPress={() => {
          uiSounds.submit();
          onContinue();
        }}
      />
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  summary: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: cinema.line,
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 14,
    gap: 10
  },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  label: { color: cinema.faint, fontSize: 13 },
  value: { color: cinema.text, fontSize: 13, fontWeight: "800", textAlign: "right", flex: 1 },
  hint: { color: cinema.muted, fontSize: 13, lineHeight: 19 },
  strong: { color: cinema.text, fontWeight: "900" }
});
