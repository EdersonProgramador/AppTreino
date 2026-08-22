export function getCurrentDate() {
  let date: any = new Date();
  date = date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }).split(" ");
  let fullHours = date[1].substring(0, 5);

  return date[0]+" às "+fullHours;
}

export function parsePostDate(value?: string | null): Date | null {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  if (!Number.isNaN(timestamp)) {
    return new Date(timestamp);
  }

  const match = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4}).*?(\d{1,2}):(\d{2})/);
  if (!match) {
    return null;
  }

  const [, day, month, year, hour, minute] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
}