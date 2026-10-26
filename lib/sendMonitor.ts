import { INSTANCES } from "./instances";

// Send Monitor: every product sends its JTBD emails once a week on a fixed day. This checks that each scheduled send
// went out, and flags a send that is missing or much smaller than the one before it.
// A send day is a Pacific calendar day, like "today" everywhere else on the dashboard: Mautic sends start about 8 AM Pacific
// (about 8:30 PM IST) and often run past midnight in India, so an India day would split one send in two.
export const SEND_MONITOR = {
  timezone: "Asia/Kolkata",            // times shown to the team ("Last checked", the alert time)
  sendTimezone: "America/Los_Angeles", // the calendar the send days follow
  alertAfter: "12:00",    // IST: a send is marked "Not sent" when nothing has gone out by the first 12:00 IST after its day starts (the India morning after the US send day)
  dropAlertPercent: 10,   // highlight only when the count is MORE than 10% lower than the previous send
  historyWeeks: 8,
  autoRefreshMinutes: 30,
};

// Weekly send day per product (0=Sun, 1=Mon, 2=Tue, 3=Wed ...).
// instance and product are the keys in lib/instances.ts, so the emails of a product are found the same way as on every other page.
export type Scheduled = { id: string; name: string; instance: string; product: string; weekday: number };
export const SCHEDULE: Scheduled[] = [
  { id: "payroll", name: "Payroll", instance: "payroll", product: "Payroll", weekday: 1 },
  { id: "accounting", name: "Accounting", instance: "accounting", product: "Accounting", weekday: 2 },
  { id: "scheduling", name: "Scheduling", instance: "altametrics", product: "Scheduling", weekday: 2 },
  { id: "timeclock", name: "Timeclock", instance: "altametrics", product: "Timeclock", weekday: 2 },
  { id: "inventory", name: "Inventory", instance: "altametrics", product: "Inventory", weekday: 2 },
  { id: "pos", name: "POS", instance: "plumpos", product: "Plum POS", weekday: 3 },
  { id: "music", name: "Music", instance: "plumpos", product: "Music", weekday: 3 },
];
export const DAYNAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Sends per product and IST date: sends[productId][date] = emails sent.
export type Sends = Record<string, Record<string, number>>;

/* Dates: send days are Pacific calendar days ("2026-10-26") */
export const fmtDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: SEND_MONITOR.sendTimezone }).format(d);
export const todayStr = () => fmtDate(new Date());
export const addDays = (s: string, n: number) => new Date(Date.parse(s + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
export const weekday = (s: string) => new Date(s + "T12:00:00Z").getUTCDay();
export const weekStart = (s: string) => addDays(s, -((weekday(s) + 6) % 7)); // Monday
// Milliseconds the send time zone is ahead of UTC at time t (negative for Pacific).
function offset(t: number) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: SEND_MONITOR.sendTimezone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(t).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - t;
}
// Midnight at the start of a send day, as a time (ms); the second step gets the daylight saving change right.
const startOf = (s: string) => { const g = Date.parse(s + "T00:00:00Z"); return g - offset(g - offset(g)); };
// Start and end of one send day as Mautic date-time text (UTC), end not included.
export function utcBounds(s: string) {
  const f = (t: number) => new Date(t).toISOString().slice(0, 19).replace("T", " ");
  return [f(startOf(s)), f(startOf(addDays(s, 1)))];
}
// The first alertAfter (IST) after the send day starts.
function alertAt(s: string) {
  const st = startOf(s), ist = new Date(st + 5.5 * 36e5).toISOString().slice(0, 10);
  const a = Date.parse(`${ist}T${SEND_MONITOR.alertAfter}:00+05:30`);
  return a < st ? a + 864e5 : a;
}
export const alertText = (s: string) => `${SEND_MONITOR.alertAfter} IST ${new Date(alertAt(s)).toLocaleDateString("en-US", { weekday: "short", timeZone: SEND_MONITOR.timezone })}`;
// This product's send day in each of the last N weeks, this week included.
export function scheduledDates(p: Scheduled) {
  const ws = weekStart(todayStr()), out: string[] = [];
  for (let w = SEND_MONITOR.historyWeeks - 1; w >= 0; w--) out.push(addDays(ws, -7 * w + ((p.weekday + 6) % 7)));
  return out;
}
export const nice = (s: string, opt: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) =>
  new Date(s + "T12:00:00Z").toLocaleDateString("en-US", { ...opt, timeZone: "UTC" });
export const short = (x: number) => (x >= 1000 ? (x / 1000).toFixed(1) + "k" : String(x));
const num = (x: number) => (+x).toLocaleString("en-US");

/* Status rules */
export type Status = { k: "upcoming" | "due" | "missing" | "low" | "sent"; label: string; why?: string; sent: number; prev: { date: string; count: number } | null; change: number | null };

// Previous send = the most recent earlier scheduled send that actually went out
// (a missed week is skipped so it doesn't distort the comparison)
function previous(sends: Sends, p: Scheduled, beforeDate: string) {
  const e = Object.entries(sends[p.id] || {}).filter(([d, c]) => d < beforeDate && c > 0).sort().at(-1);
  return e ? { date: e[0], count: e[1] } : null;
}
export function statusFor(sends: Sends, p: Scheduled, date: string): Status {
  const t = todayStr(), sent = sends[p.id]?.[date] ?? 0, prev = previous(sends, p, date);
  const change = prev && sent > 0 ? Math.round(((sent - prev.count) / prev.count) * 100) : null;
  const b = { sent, prev, change };
  if (date > t) return { ...b, k: "upcoming", label: "◷ Upcoming" };
  if (date === t && sent === 0 && Date.now() < alertAt(date))
    return { ...b, k: "due", label: "● Due today", why: `Not sent yet. Will alert after ${alertText(date)}.` };
  if (sent === 0) return { ...b, k: "missing", label: "✕ Not sent",
    why: date === t ? `Nothing sent by ${alertText(date)}. Check the campaign, segment and Mautic cron.` : `Scheduled ${nice(date)}, nothing was sent.` };
  if (change !== null && change < -SEND_MONITOR.dropAlertPercent)
    return { ...b, k: "low", label: "▼ Dropped", why: `${Math.abs(change)}% lower than the previous send (${num(prev!.count)} on ${nice(prev!.date)})` };
  return { ...b, k: "sent", label: "✓ Sent" };
}
// This week's send day if it has passed or is today, else last week's.
export const lastScheduled = (p: Scheduled) => scheduledDates(p).filter((d) => d <= todayStr()).at(-1)!;
export function nextSend(sends: Sends, p: Scheduled) {
  const t = todayStr();
  for (let i = 0; i < 8; i++) { const c = addDays(t, i); if (weekday(c) === p.weekday && (c > t || statusFor(sends, p, c).k === "due")) return c; }
  return t;
}
// The latest scheduled send of each product (this week or last) that is missing or dropped.
export function issues(sends: Sends, ps: Scheduled[]) {
  const ws = weekStart(todayStr());
  return ps.map((p) => ({ p, d: lastScheduled(p), s: statusFor(sends, p, lastScheduled(p)) }))
    .filter((x) => x.d && x.d >= addDays(ws, -7) && (x.s.k === "missing" || x.s.k === "low"));
}
export const instName = (k: string) => INSTANCES[k]?.label || k;
