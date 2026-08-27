import { Bike, Dumbbell, Footprints } from "lucide-react";

export type StreakKind = "WORKOUT" | "RUN" | "WALK" | "RIDE";

export function StudentStreakDayIcons({ kinds }: { kinds: StreakKind[] }) {
  if (!kinds.length) return null;
  return (
    <span className="student-streak-kinds">
      {kinds.slice(0, 2).map((kind) =>
        kind === "RIDE" ? (
          <Bike key={kind} size={11} />
        ) : kind === "WALK" || kind === "RUN" ? (
          <Footprints key={kind} size={11} />
        ) : (
          <Dumbbell key={kind} size={11} />
        )
      )}
    </span>
  );
}

export function StudentStreakMonthGrid({
  cells,
  todayIso,
  completedDates,
  dayKinds
}: {
  cells: Array<{ day: number | null; isoDate: string | null }>;
  todayIso: string;
  completedDates: Set<string>;
  dayKinds?: Record<string, StreakKind[]>;
}) {
  return (
    <>
      <div className="student-calendar-weekdays" aria-hidden="true">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((day, index) => (
          <span key={`${day}-${index}`}>{day}</span>
        ))}
      </div>
      <div className="student-calendar-grid">
        {cells.map((cell, index) => {
          const isCompleted = Boolean(cell.isoDate && completedDates.has(cell.isoDate));
          const isToday = cell.isoDate === todayIso;
          const kinds = (cell.isoDate && dayKinds?.[cell.isoDate]) || [];
          return (
            <span
              className={`${cell.day ? "" : "empty"} ${isCompleted ? "completed" : ""} ${isToday ? "today" : ""}`}
              key={`${cell.isoDate ?? "empty"}-${index}`}
            >
              {cell.day}
              {isCompleted ? <StudentStreakDayIcons kinds={kinds} /> : null}
            </span>
          );
        })}
      </div>
    </>
  );
}
