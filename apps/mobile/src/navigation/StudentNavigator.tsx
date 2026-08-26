import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { MusicPlayerScreen } from "../MusicPlayerScreen";
import { FeedScreen } from "../screens/student/FeedScreen";
import {
  ChatScreen,
  DirectMessageScreen,
  LiveScreen,
  MessagesScreen,
  ReelsScreen,
  RequestsScreen
} from "../screens/student/SocialInfraScreens";
import { LiveRoomScreen } from "../screens/student/LiveRoomScreen";
import { ClubScreen } from "../screens/student/ClubScreen";
import { ActivityScreen } from "../screens/student/ActivityScreen";
import { MembershipScreen, PaymentsScreen, ProfileScreen, ProfileSettingsScreen, PurchasesScreen } from "../screens/student/AccountScreens";
import { EventsScreen, LocationsScreen, QrScreen, RatingsScreen, SupportScreen, AiScreen } from "../screens/student/CommunityScreens";
import { AssessmentsScreen, StatusScreen } from "../screens/student/HealthScreens";
import { MenuScreen, NotificationsScreen, SettingsScreen } from "../screens/student/MenuScreens";
import { PlayScreen } from "../screens/student/PlayScreen";
import { CartScreen, OrdersScreen, ProductsScreen } from "../screens/student/ShopScreens";
import {
  HistoryScreen,
  ProgramScreen,
  TrainingCatalogScreen,
  TrainingWorkoutsScreen,
  WorkoutPlayerScreen
} from "../screens/student/TrainingScreens";
import { RunnerIcon } from "../student/RunnerIcon";
import { useStudent } from "../student/StudentContext";
import { navigationThemeFor, tabBarStyleFor, useSt } from "../student/theme";
import { uiSounds } from "../student/uiSounds";
import type {
  ActivityStackParamList,
  ClubStackParamList,
  FeedStackParamList,
  MenuStackParamList,
  PlayStackParamList,
  ShopStackParamList,
  StudentTabParamList,
  TrainingStackParamList
} from "./types";

const FeedStack = createNativeStackNavigator<FeedStackParamList>();
const ClubStack = createNativeStackNavigator<ClubStackParamList>();
const ActivityStack = createNativeStackNavigator<ActivityStackParamList>();
const PlayStack = createNativeStackNavigator<PlayStackParamList>();
const TrainingStack = createNativeStackNavigator<TrainingStackParamList>();
const ShopStack = createNativeStackNavigator<ShopStackParamList>();
const MenuStack = createNativeStackNavigator<MenuStackParamList>();
const Tabs = createBottomTabNavigator<StudentTabParamList>();

function stackOptions(bg: string) {
  return {
    headerShown: false,
    contentStyle: { backgroundColor: bg }
  };
}

function FeedStackScreen() {
  const { st } = useSt();
  return (
    <FeedStack.Navigator screenOptions={stackOptions(st.bg)}>
      <FeedStack.Screen name="Feed" component={FeedScreen} />
      <FeedStack.Screen
        name="Reels"
        component={ReelsScreen}
        options={{ animation: "slide_from_bottom", contentStyle: { backgroundColor: "#000" } }}
      />
      <FeedStack.Screen name="Live" component={LiveScreen} options={{ animation: "slide_from_right" }} />
      <FeedStack.Screen
        name="LiveRoom"
        component={LiveRoomScreen}
        options={{ presentation: "fullScreenModal", animation: "fade" }}
      />
      <FeedStack.Screen name="Messages" component={MessagesScreen} options={{ animation: "slide_from_right" }} />
      <FeedStack.Screen name="DirectMessage" component={DirectMessageScreen} />
      <FeedStack.Screen name="Chat" component={ChatScreen} />
      <FeedStack.Screen name="Requests" component={RequestsScreen} />
    </FeedStack.Navigator>
  );
}

function ClubStackScreen() {
  const { st } = useSt();
  return (
    <ClubStack.Navigator screenOptions={stackOptions(st.bg)}>
      <ClubStack.Screen name="Club" component={ClubScreen} />
    </ClubStack.Navigator>
  );
}

function ActivityStackScreen() {
  const { st } = useSt();
  return (
    <ActivityStack.Navigator screenOptions={stackOptions(st.bg)}>
      <ActivityStack.Screen name="Activity" component={ActivityScreen} />
    </ActivityStack.Navigator>
  );
}

function PlayStackScreen() {
  const { st } = useSt();
  return (
    <PlayStack.Navigator screenOptions={stackOptions(st.playBg)}>
      <PlayStack.Screen name="Play" component={PlayScreen} />
      <PlayStack.Screen name="NowPlaying" options={{ presentation: "modal" }}>
        {({ navigation }) => <MusicPlayerScreen onClose={() => navigation.goBack()} />}
      </PlayStack.Screen>
    </PlayStack.Navigator>
  );
}

function TrainingStackScreen() {
  const { st } = useSt();
  return (
    <TrainingStack.Navigator screenOptions={stackOptions(st.bg)}>
      <TrainingStack.Screen name="Training" component={TrainingCatalogScreen} />
      <TrainingStack.Screen name="Workouts" component={TrainingWorkoutsScreen} />
      <TrainingStack.Screen name="Program" component={ProgramScreen} />
      <TrainingStack.Screen name="History" component={HistoryScreen} />
      <TrainingStack.Screen
        name="Player"
        component={WorkoutPlayerScreen}
        options={{ animation: "slide_from_right", gestureEnabled: false }}
      />
    </TrainingStack.Navigator>
  );
}

function ShopStackScreen() {
  const { st } = useSt();
  return (
    <ShopStack.Navigator screenOptions={stackOptions(st.bg)}>
      <ShopStack.Screen name="Products" component={ProductsScreen} />
      <ShopStack.Screen name="Cart" component={CartScreen} />
      <ShopStack.Screen name="Orders" component={OrdersScreen} />
    </ShopStack.Navigator>
  );
}

function MenuStackScreen() {
  const { st } = useSt();
  return (
    <MenuStack.Navigator screenOptions={stackOptions(st.bg)}>
      <MenuStack.Screen name="Menu" component={MenuScreen} />
      <MenuStack.Screen name="Profile" component={ProfileScreen} />
      <MenuStack.Screen name="ProfileSettings" component={ProfileSettingsScreen} />
      <MenuStack.Screen name="Notifications" component={NotificationsScreen} />
      <MenuStack.Screen name="Membership" component={MembershipScreen} />
      <MenuStack.Screen name="Payments" component={PaymentsScreen} />
      <MenuStack.Screen name="Assessments" component={AssessmentsScreen} />
      <MenuStack.Screen name="Status" component={StatusScreen} />
      <MenuStack.Screen name="Events" component={EventsScreen} />
      <MenuStack.Screen name="Locations" component={LocationsScreen} />
      <MenuStack.Screen name="Support" component={SupportScreen} />
      <MenuStack.Screen name="Ratings" component={RatingsScreen} />
      <MenuStack.Screen name="Purchases" component={PurchasesScreen} />
      <MenuStack.Screen name="Settings" component={SettingsScreen} />
      <MenuStack.Screen name="Qr" component={QrScreen} />
      <MenuStack.Screen name="Ai" component={AiScreen} />
    </MenuStack.Navigator>
  );
}

function icon(name: keyof typeof Ionicons.glyphMap, focusedName: keyof typeof Ionicons.glyphMap) {
  return ({ color, size, focused }: { color: string; size: number; focused: boolean }) => (
    <Ionicons name={focused ? focusedName : name} size={size} color={color} />
  );
}

export function StudentNavigator() {
  const { st, theme } = useSt();
  const { profile } = useStudent();

  return (
    <NavigationContainer theme={navigationThemeFor(theme, st)}>
      <Tabs.Navigator
        initialRouteName="TrainingTab"
        screenListeners={{
          tabPress: () => {
            uiSounds.studentPage();
            uiSounds.pageChange();
          }
        }}
        screenOptions={{
          headerShown: false,
          tabBarStyle: tabBarStyleFor(st),
          tabBarActiveTintColor: st.tabActive,
          tabBarInactiveTintColor: st.faint,
          tabBarLabelStyle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.2 }
        }}
      >
        <Tabs.Screen
          name="FeedTab"
          component={FeedStackScreen}
          options={{ title: "Feed", tabBarIcon: icon("home-outline", "home") }}
        />
        <Tabs.Screen
          name="ActivityTab"
          component={ActivityStackScreen}
          options={{
            title: "Corrida",
            tabBarIcon: ({ color, size }) => (
              <RunnerIcon size={size} color={color} gender={profile?.gender} />
            )
          }}
        />
        <Tabs.Screen
          name="TrainingTab"
          component={TrainingStackScreen}
          options={{ title: "Treino", tabBarIcon: icon("barbell-outline", "barbell") }}
          listeners={({ navigation }) => ({
            tabPress: () => {
              navigation.navigate("TrainingTab", { screen: "Training" });
            }
          })}
        />
        <Tabs.Screen
          name="ClubTab"
          component={ClubStackScreen}
          options={{ title: "Desafios", tabBarIcon: icon("trophy-outline", "trophy") }}
        />
        <Tabs.Screen
          name="MenuTab"
          component={MenuStackScreen}
          options={{ title: "Menu", tabBarIcon: icon("menu-outline", "menu") }}
        />
        <Tabs.Screen
          name="PlayTab"
          component={PlayStackScreen}
          options={{
            title: "Play",
            tabBarIcon: icon("musical-notes-outline", "musical-notes"),
            tabBarButton: () => null,
            tabBarItemStyle: { display: "none" }
          }}
        />
        <Tabs.Screen
          name="ShopTab"
          component={ShopStackScreen}
          options={{
            title: "Vitrine",
            tabBarIcon: icon("bag-outline", "bag"),
            tabBarButton: () => null,
            tabBarItemStyle: { display: "none" }
          }}
        />
      </Tabs.Navigator>
    </NavigationContainer>
  );
}
