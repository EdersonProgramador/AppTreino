import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DarkTheme, DefaultTheme } from "@react-navigation/native";
import { getTheme, subscribeTheme, type UiTheme } from "./prefs";

const brand = {
  gold: "#f2b461",
  goldUi: "#c48a28",
  coral: "#df663c",
  ember: "#c73d2e",
  white: "#ffffff",
  danger: "#df3838",
  headerFrom: "#be3027",
  headerTo: "#165f47",
  playBg: "#0a0c10"
} as const;

export const lightSt = {
  ...brand,
  goldUi: "#c48a28",
  bg: "#f7f2ea",
  bgSoft: "#ebe4d8",
  card: "#ffffff",
  text: "#0e1116",
  muted: "#44403a",
  faint: "#605a52",
  line: "rgba(21,26,34,0.12)",
  lineStrong: "rgba(21,26,34,0.2)",
  fill: "rgba(21,26,34,0.04)",
  ink: "#15100b",
  tabActive: "#8a5a12",
  cardSoft: "rgba(255,255,255,0.92)",
  inputBg: "#ffffff",
  emptyBg: "rgba(255,255,255,0.92)",
  chatThem: "#f3eee6",
  avatarBg: "#f3eee6",
  highlight: "#fff8ee",
  tabBarBg: "rgba(255,255,255,0.94)",
  tabBarBorder: "rgba(21,26,34,0.12)",
  panelBg: "#ffffff"
};

export const darkSt: typeof lightSt = {
  ...brand,
  goldUi: "#f0b45a",
  bg: "#07080a",
  bgSoft: "#10131a",
  card: "#1a202a",
  text: "#f4ebe0",
  muted: "#c9bbaa",
  faint: "#8f8376",
  line: "rgba(255,255,255,0.12)",
  lineStrong: "rgba(255,255,255,0.2)",
  fill: "rgba(255,255,255,0.05)",
  ink: "#f4ebe0",
  tabActive: "#f2b461",
  cardSoft: "rgba(26,32,42,0.92)",
  inputBg: "rgba(7,8,10,0.72)",
  emptyBg: "rgba(26,32,42,0.92)",
  chatThem: "#151a22",
  avatarBg: "#151a22",
  highlight: "rgba(242,180,97,0.12)",
  tabBarBg: "rgba(16,19,26,0.96)",
  tabBarBorder: "rgba(255,255,255,0.12)",
  panelBg: "#1a202a"
};

export type StudentTokens = typeof lightSt;
/** Default light tokens for module-level StyleSheets that do not subscribe to theme. */
export const st = lightSt;

export function tokensFor(theme: UiTheme): StudentTokens {
  return theme === "dark" ? darkSt : lightSt;
}

export function navigationThemeFor(theme: UiTheme, tokens: StudentTokens) {
  const base = theme === "dark" ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark: theme === "dark",
    colors: {
      ...base.colors,
      background: tokens.bg,
      card: tokens.card,
      primary: tokens.tabActive,
      text: tokens.text,
      border: tokens.line,
      notification: tokens.gold
    }
  };
}

export function tabBarStyleFor(tokens: StudentTokens) {
  return {
    backgroundColor: tokens.tabBarBg,
    borderTopColor: tokens.tabBarBorder,
    borderTopWidth: 0.5,
    elevation: 12,
    shadowColor: "#2d2418",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -8 }
  };
}

export const studentTabBarStyle = tabBarStyleFor(lightSt);

type ThemeValue = { theme: UiTheme; st: StudentTokens };

const ThemeCtx = createContext<ThemeValue>({ theme: "light", st: lightSt });

export function StudentThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState(getTheme);
  useEffect(() => subscribeTheme(setTheme), []);
  const value = useMemo<ThemeValue>(() => ({ theme, st: tokensFor(theme) }), [theme]);
  return createElement(ThemeCtx.Provider, { value }, children);
}

export function useSt() {
  return useContext(ThemeCtx);
}

export function moduleOn(config: Record<string, string>, key: string) {
  return config[key] !== "false";
}

export function studentCodeFromName(name?: string | null) {
  if (!name) return 1;
  return name.length * 193 + 1;
}

export function streakFromDates(dates: string[]) {
  const streakDateSet = new Set(dates);
  const date = new Date();
  const todayKey = date.toISOString().slice(0, 10);

  if (!streakDateSet.has(todayKey)) {
    date.setDate(date.getDate() - 1);
    const yesterdayKey = date.toISOString().slice(0, 10);
    if (!streakDateSet.has(yesterdayKey)) return 0;
  }

  let streak = 0;
  while (streakDateSet.has(date.toISOString().slice(0, 10))) {
    streak += 1;
    date.setDate(date.getDate() - 1);
  }
  return streak;
}
