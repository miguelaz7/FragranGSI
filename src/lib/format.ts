// Formatação para pt-PT, usada na loja e no backoffice.
// As datas são sempre mostradas na hora de Lisboa, seja qual for o fuso do servidor.

const TZ = "Europe/Lisbon";

export function formatEur(value: number) {
  return value.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
}

/** Chave do dia em Lisboa ("2026-10-29"), para agrupar por dia. */
export function dayKey(date: Date) {
  return date.toLocaleDateString("sv-SE", { timeZone: TZ });
}

export function formatDayMonth(date: Date) {
  return date.toLocaleDateString("pt-PT", { timeZone: TZ, day: "2-digit", month: "2-digit" });
}

export function formatLongDate(date: Date) {
  const s = date.toLocaleDateString("pt-PT", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "11:52:14", ou "28/10 11:52" se não for hoje (hora de Lisboa) */
export function formatLogTime(date: Date, now = new Date()) {
  const time = date.toLocaleTimeString("pt-PT", { timeZone: TZ });
  return dayKey(date) === dayKey(now) ? time : `${formatDayMonth(date)} ${time.slice(0, 5)}`;
}

/** "412 ms" ou "1,8 s" */
export function formatDuration(ms: number) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} s`;
}

/** "há 2 min", "há 3 h", "há 5 dias" */
export function timeAgo(date: Date, now = new Date()) {
  const min = Math.round((now.getTime() - date.getTime()) / 60_000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}
