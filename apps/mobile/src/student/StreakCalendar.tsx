import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { RunnerIcon } from "./RunnerIcon";
import { useSt } from "./theme";

export type StreakKind = "WORKOUT" | "RUN" | "WALK" | "RIDE";

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

export function kindIcon(kind: StreakKind): keyof typeof Ionicons.glyphMap {
  if (kind === "RUN") return "fitness-outline";
  if (kind === "WALK") return "walk-outline";
  if (kind === "RIDE") return "bicycle-outline";
  return "barbell-outline";
}

export function calendarCells(year: number, month: number) {
  const first = new Date(year, month - 1, 1);
  const startPad = first.getDay();
  const days = new Date(year, month, 0).getDate();
  const cells: Array<{ day?: number; isoDate?: string }> = Array.from({ length: startPad }, () => ({}));
  for (let day = 1; day <= days; day += 1) {
    const isoDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ day, isoDate });
  }
  return cells;
}

export function StreakKindIcons({
  kinds,
  size = 11,
  color = "#fff",
  gender
}: {
  kinds: StreakKind[];
  size?: number;
  color?: string;
  gender?: "MALE" | "FEMALE" | null;
}) {
  if (!kinds.length) return null;
  return (
    <View style={styles.icons}>
      {kinds.slice(0, 2).map((kind) =>
        kind === "RUN" ? (
          <RunnerIcon key={kind} size={size} color={color} gender={gender} />
        ) : (
          <Ionicons key={kind} name={kindIcon(kind)} size={size} color={color} />
        )
      )}
    </View>
  );
}

type Props = {
  year: number;
  month: number;
  dayKinds: Record<string, StreakKind[]>;
  onPrev?: () => void;
  onNext?: () => void;
  canPrev?: boolean;
  canNext?: boolean;
  monthLabel: string;
  gender?: "MALE" | "FEMALE" | null;
  caption?: string;
};

export function StreakCalendar({
  year,
  month,
  dayKinds,
  onPrev,
  onNext,
  canPrev = true,
  canNext = true,
  monthLabel,
  gender,
  caption
}: Props) {
  const { st } = useSt();
  const cells = calendarCells(year, month);
  const todayIso = new Date().toISOString().slice(0, 10);
  const doneCount = cells.filter((cell) => cell.isoDate && (dayKinds[cell.isoDate]?.length ?? 0) > 0).length;

  return (
    <View>
      <View style={styles.head}>
        <Pressable disabled={!canPrev} onPress={onPrev} hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color={!canPrev ? st.faint : st.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.kicker, { color: st.faint }]}>Ofensiva</Text>
          <Text style={[styles.title, { color: st.text }]}>{monthLabel}</Text>
        </View>
        <Pressable disabled={!canNext} onPress={onNext} hitSlop={8}>
          <Ionicons name="chevron-forward" size={20} color={!canNext ? st.faint : st.text} />
        </Pressable>
        <Text style={[styles.count, { color: st.faint }]}>{doneCount} dia(s)</Text>
      </View>
      <View style={styles.grid}>
        {WEEKDAYS.map((day, index) => (
          <View key={`${day}-${index}`} style={styles.cell}>
            <Text style={[styles.dow, { color: st.faint }]}>{day}</Text>
          </View>
        ))}
        {cells.map((cell, index) => {
          const kinds = cell.isoDate ? dayKinds[cell.isoDate] ?? [] : [];
          const done = kinds.length > 0;
          const today = cell.isoDate === todayIso;
          return (
            <View key={`${cell.isoDate ?? "empty"}-${index}`} style={styles.cell}>
              {cell.day ? (
                <View
                  style={[
                    styles.dayWrap,
                    done && { backgroundColor: st.coral },
                    today && { borderWidth: 1.5, borderColor: st.gold }
                  ]}
                >
                  {done ? <StreakKindIcons kinds={kinds} gender={gender} /> : null}
                  <Text style={[styles.day, { color: done ? "#fff" : st.text }]}>{cell.day}</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
      {caption ? <Text style={[styles.caption, { color: st.muted }]}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  kicker: { fontSize: 11, fontWeight: "700" },
  title: { fontSize: 16, fontWeight: "800", textTransform: "capitalize" },
  count: { fontSize: 11, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%` as unknown as number, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  dow: { fontSize: 11, fontWeight: "700" },
  dayWrap: {
    minWidth: 32,
    minHeight: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
    paddingVertical: 2,
    gap: 0
  },
  day: { fontSize: 11, fontWeight: "800" },
  icons: { flexDirection: "row", gap: 1, height: 12, alignItems: "center" },
  caption: { marginTop: 10, fontSize: 13, lineHeight: 18 }
});
