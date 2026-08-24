import type { StudentPanelSection } from "../stores/studentSyncStore";

const PANEL_KEY = "apptreino.student.panel";

const SECTIONS: StudentPanelSection[] = [
  "home",
  "feed",
  "club",
  "activity",
  "payments",
  "training",
  "products",
  "cart",
  "menu",
  "subscription",
  "locked",
  "player",
  "status",
  "assessments",
  "events",
  "support",
  "ai",
  "history",
  "profile",
  "profile-settings",
  "peer-profile",
  "settings",
  "membership",
  "purchases",
  "orders",
  "favorites",
  "ratings",
  "locations",
  "play",
  "reels",
  "live",
  "messages",
  "chat",
  "requests"
];

export type StudentPanelPersist = {
  section: StudentPanelSection;
  modality: string | null;
  programId: string | null;
  workoutSessionId: string | null;
  playerSessionActive: boolean;
};

function isSection(value: unknown): value is StudentPanelSection {
  return typeof value === "string" && (SECTIONS as string[]).includes(value);
}

export function readStudentPanel(): StudentPanelPersist | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(PANEL_KEY) ?? "null") as Partial<StudentPanelPersist> | null;
    if (!parsed || !isSection(parsed.section)) return null;
    return {
      section: parsed.section === "home" ? "feed" : parsed.section,
      modality: typeof parsed.modality === "string" ? parsed.modality : null,
      programId: typeof parsed.programId === "string" ? parsed.programId : null,
      workoutSessionId: typeof parsed.workoutSessionId === "string" ? parsed.workoutSessionId : null,
      playerSessionActive: Boolean(parsed.playerSessionActive)
    };
  } catch {
    return null;
  }
}

export function writeStudentPanel(state: StudentPanelPersist) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PANEL_KEY, JSON.stringify(state));
  } catch {
    // quota / private mode
  }
}

export function clearStudentPanel() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(PANEL_KEY);
  } catch {
    // ignore
  }
}
