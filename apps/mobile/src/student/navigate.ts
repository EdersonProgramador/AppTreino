import type { StudentTabParamList } from "../navigation/types";

export const FALLBACK_WORKOUT_MODALITY = "Hipertrofia";

type StudentNav = {
  navigate: (name: keyof StudentTabParamList | string, params?: object) => void;
};

function trainingState(routes: Array<{ name: string; params?: object }>, index: number) {
  return { routes, index };
}

export function openTrainingCatalog(navigation: StudentNav) {
  navigation.navigate("TrainingTab", { screen: "Training" });
}

export function openTrainingWorkouts(navigation: StudentNav, modality: string) {
  navigation.navigate("TrainingTab", {
    state: trainingState(
      [{ name: "Training" }, { name: "Workouts", params: { modality } }],
      1
    )
  });
}

export function openTrainingProgram(
  navigation: StudentNav,
  params: { programId: string; modality?: string | null }
) {
  const modality = params.modality?.trim() || FALLBACK_WORKOUT_MODALITY;
  navigation.navigate("TrainingTab", {
    state: trainingState(
      [
        { name: "Training" },
        { name: "Workouts", params: { modality } },
        { name: "Program", params: { programId: params.programId } }
      ],
      2
    )
  });
}

export function navigateStudentTarget(navigation: StudentNav, target?: string | null) {
  switch (target) {
    case "payments":
      navigation.navigate("MenuTab", { screen: "Payments" });
      break;
    case "membership":
      navigation.navigate("MenuTab", { screen: "Membership" });
      break;
    case "status":
      navigation.navigate("MenuTab", { screen: "Status" });
      break;
    case "locations":
      navigation.navigate("MenuTab", { screen: "Locations" });
      break;
    case "support":
      navigation.navigate("MenuTab", { screen: "Support" });
      break;
    case "ratings":
    case "favorites":
      navigation.navigate("MenuTab", { screen: "Ratings" });
      break;
    case "training":
      navigation.navigate("TrainingTab", { screen: "Training" });
      break;
    case "history":
      navigation.navigate("TrainingTab", { screen: "History" });
      break;
    case "assessments":
      navigation.navigate("MenuTab", { screen: "Assessments" });
      break;
    case "products":
      navigation.navigate("ShopTab", { screen: "Products" });
      break;
    case "purchases":
    case "orders":
      navigation.navigate("MenuTab", { screen: "Purchases" });
      break;
    case "events":
      navigation.navigate("MenuTab", { screen: "Events" });
      break;
    case "play":
      navigation.navigate("PlayTab", { screen: "Play" });
      break;
    case "feed":
    case "home":
      navigation.navigate("FeedTab", { screen: "Feed" });
      break;
    case "club":
      navigation.navigate("ClubTab", { screen: "Club" });
      break;
    case "activity":
      navigation.navigate("ActivityTab", { screen: "Activity" });
      break;
    case "cart":
      navigation.navigate("ShopTab", { screen: "Cart" });
      break;
    case "ai":
      navigation.navigate("MenuTab", { screen: "Ai" });
      break;
    case "settings":
      navigation.navigate("MenuTab", { screen: "Settings" });
      break;
    default:
      navigation.navigate("MenuTab", { screen: "Profile" });
  }
}
