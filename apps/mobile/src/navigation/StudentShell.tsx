import { ActivityIndicator, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { NavigationContainer } from "@react-navigation/native";
import { OnboardingScreen } from "../screens/student/OnboardingScreen";
import { LockedContentsScreen, SubscriptionScreen } from "../screens/student/LockedScreens";
import { SettingsScreen } from "../screens/student/MenuScreens";
import { useStudent } from "../student/StudentContext";
import { navigationThemeFor, tabBarStyleFor, useSt } from "../student/theme";
import { StudentNavigator } from "./StudentNavigator";

const Tabs = createBottomTabNavigator();

function icon(name: keyof typeof Ionicons.glyphMap, focusedName: keyof typeof Ionicons.glyphMap) {
  return ({ color, size, focused }: { color: string; size: number; focused: boolean }) => (
    <Ionicons name={focused ? focusedName : name} size={size} color={color} />
  );
}

function LockedNavigator() {
  const { st, theme } = useSt();
  return (
    <NavigationContainer theme={navigationThemeFor(theme, st)}>
      <Tabs.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: tabBarStyleFor(st),
          tabBarActiveTintColor: st.tabActive,
          tabBarInactiveTintColor: st.faint,
          tabBarLabelStyle: { fontSize: 11, fontWeight: "700" }
        }}
      >
        <Tabs.Screen
          name="Subscription"
          component={SubscriptionScreen}
          options={{ title: "Assinatura", tabBarIcon: icon("card-outline", "card") }}
        />
        <Tabs.Screen
          name="Locked"
          component={LockedContentsScreen}
          options={{ title: "Conteúdos", tabBarIcon: icon("lock-closed-outline", "lock-closed") }}
        />
        <Tabs.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: "Configurações", tabBarIcon: icon("settings-outline", "settings") }}
        />
      </Tabs.Navigator>
    </NavigationContainer>
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
  if (!hasAccess) return <LockedNavigator />;
  return <StudentNavigator />;
}
