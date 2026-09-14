import { ActivityIndicator, View } from "react-native";
import { ActivateScreen } from "../screens/ActivateScreen";
import { OnboardingScreen } from "../screens/student/OnboardingScreen";
import { useStudent } from "../student/StudentContext";
import { useSt } from "../student/theme";
import { StudentNavigator } from "./StudentNavigator";

function PendingActivationScreen() {
  const { session, refresh, logout, membership, profile, payments } = useStudent();
  return (
    <ActivateScreen
      resumeSession={session}
      resumeProfile={profile}
      resumeMembership={membership}
      resumePayments={payments}
      resumePlanCode={membership?.plan?.code ?? null}
      onLoggedIn={async () => {
        await refresh();
      }}
      onRefresh={refresh}
      onLogout={logout}
    />
  );
}

export function StudentShell() {
  const { loading, profile, hasAccess } = useStudent();
  const { st } = useSt();
  if (loading && !profile) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: st.bg }}>
        <ActivityIndicator color={st.gold} />
      </View>
    );
  }
  const needsOnboarding = Boolean(profile && (!profile.gender || !profile.objective || !profile.level));
  if (needsOnboarding) return <OnboardingScreen />;
  if (!hasAccess) return <PendingActivationScreen />;
  return <StudentNavigator />;
}
