export function formatAssessmentDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function formatDateTimeLocalInputValue(value: Date | string = new Date()) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric"
  });
}

export function buildMonthCalendar(year: number, month: number) {
  const firstDate = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const leadingDays = firstDate.getDay();
  const cells: Array<{ day: number | null; isoDate: string | null }> = [];

  for (let index = 0; index < leadingDays; index += 1) {
    cells.push({ day: null, isoDate: null });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const isoDate = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
    cells.push({ day, isoDate });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ day: null, isoDate: null });
  }

  return cells;
}
