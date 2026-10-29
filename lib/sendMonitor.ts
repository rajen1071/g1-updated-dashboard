import { INSTANCES } from "./instances";

// Send Monitor: each product's JTBD nurture campaign sends its weekly emails. This checks, from Mautic's campaign event log,
// whether the emails scheduled for the product's send day went out on that day, went out later, are still waiting, or did not go out.
// A send day is a Pacific calendar day, like "today" everywhere else on the dashboard.
export const SEND_MONITOR = {
  timezone: "Asia/Kolkata",            // times shown to the team ("Last checked", the alert time)
  sendTimezone: "America/Los_Angeles", // the calendar the send days follow
  alertAfter: "12:00",    // IST: a send is marked "Not sent" when nothing has gone out by the first 12:00 IST after its day starts
  dropAlertPercent: 10,   // highlight only when the count is MORE than 10% lower than the previous send
  latePercent: 10,        // a send day counts as "Sent late" when more than 10% of its emails went out on a later day
  historyWeeks: 8,
  autoRefreshMinutes: 30,
};

// Weekly send day per product (0=Sun, 1=Mon, 2=Tue, 3=Wed ...) and the Mautic campaigns that send its weekly emails.
// The send day is the weekday the campaign's weekly step is restricted to in Mautic.
// rolling: the later steps of the campaign are set to "7 days after the previous email" with no weekday rule, so an email
// that goes out late moves that contact's next emails to the later weekday too. Fixed campaigns keep the weekday rule on every step.
export type Scheduled = { id: string; name: string; instance: string; weekday: number; campaigns: number[]; rolling: boolean; note?: string };
export const SCHEDULE: Scheduled[] = [
  { id: "payroll", name: "Payroll", instance: "payroll", weekday: 1, campaigns: [7], rolling: true },
  { id: "accounting", name: "Accounting", instance: "accounting", weekday: 2, campaigns: [4], rolling: false },
  { id: "scheduling", name: "Scheduling", instance: "altametrics", weekday: 2, campaigns: [332], rolling: true },
  { id: "timeclock", name: "Timeclock", instance: "altametrics", weekday: 2, campaigns: [337], rolling: true },
  // The Inventory eBooks are filed under 25206 | Operations; the 25206 nurture campaign is named "Operations".
  { id: "inventory", name: "Inventory", instance: "altametrics", weekday: 2, campaigns: [335], rolling: true, note: "Campaign 22106 Operations" },
  { id: "pos", name: "POS", instance: "plumpos", weekday: 3, campaigns: [9, 10], rolling: false },
  { id: "music", name: "Music", instance: "plumpos", weekday: 3, campaigns: [8], rolling: false },
];
export const DAYNAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// What happened to the campaign emails scheduled for one product on one send day (from the campaign event log).
// onTime: sent on the send day. late: sent on a later day (lateFirst/lateLast: first and last of those times, UTC text).
// pending: still waiting in Mautic's queue. Each scheduled email is counted once, under the day it was scheduled for.
export type Cell = { onTime: number; late: number; pending: number; lateFirst?: string; lateLast?: string };
export type Sends = Record<string, Record<string, Cell>>; // sends[productId][date]

/* Dates: send days are Pacific calendar days ("2026-10-26") */
export const fmtDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: SEND_MONITOR.sendTimezone }).format(d);
export const todayStr = () => fmtDate(new Date());
export const addDays = (s: string, n: number) => new Date(Date.parse(s + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
export const weekday = (s: string) => new Date(s + "T12:00:00Z").getUTCDay();
export const weekStart = (s: string) => addDays(s, -((weekday(s) + 6) % 7)); // Monday
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
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
export function scheduledDates(p: Scheduled, today = todayStr()) {
  const ws = weekStart(today), out: string[] = [];
  for (let w = SEND_MONITOR.historyWeeks - 1; w >= 0; w--) out.push(addDays(ws, -7 * w + ((p.weekday + 6) % 7)));
  return out;
}
export const nice = (s: string, opt: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) =>
  new Date(s + "T12:00:00Z").toLocaleDateString("en-US", { ...opt, timeZone: "UTC" });
export const short = (x: number) => (x >= 1000 ? (x / 1000).toFixed(1) + "k" : String(x));
const num = (x: number) => (+x).toLocaleString("en-US");
// Mautic UTC text -> Pacific day, and a readable Pacific time ("Thu, Oct 22, 10:02 AM PT").
const utc = (s: string) => new Date(s.replace(" ", "T") + "Z");
export const pacificDay = (s: string) => fmtDate(utc(s));
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/* Status rules */
export type Kind = "upcoming" | "due" | "sent" | "late" | "low" | "pending" | "missing" | "unknown";
export type Status = { k: Kind; label: string; why?: string; sent: number; prev: { date: string; count: number } | null; change: number | null; cell?: Cell };
export const total = (c?: Cell) => (c ? c.onTime + c.late : 0); // emails that went out (on time or late), counted once

// Previous send = the most recent earlier send day on which emails actually went out
// (a week with nothing sent is skipped so it doesn't distort the comparison)
function previous(sends: Sends, p: Scheduled, beforeDate: string) {
  const e = Object.entries(sends[p.id] || {}).filter(([d, c]) => d < beforeDate && total(c) > 0).sort(([a], [b]) => a.localeCompare(b)).at(-1);
  return e ? { date: e[0], count: total(e[1]) } : null;
}
export function statusFor(sends: Sends, p: Scheduled, date: string, now = Date.now()): Status {
  const t = fmtDate(new Date(now)), c = sends[p.id]?.[date], sent = total(c), prev = previous(sends, p, date);
  const change = prev && sent > 0 ? Math.round(((sent - prev.count) / prev.count) * 100) : null;
  const b = { sent, prev, change, cell: c };
  const day = DAYNAMES[weekday(date)];
  if (date > t) return { ...b, k: "upcoming", label: "Upcoming" };
  if (!c) return { ...b, k: "unknown", label: "Not checked", why: "This day could not be checked in Mautic. Click Refresh to try again." };
  const waiting = c.pending > 0, beforeAlert = now < alertAt(date);
  // Today's send is still going out: shown as due until the alert time, not compared with last week yet.
  if (date === t && beforeAlert && (waiting || sent === 0))
    return { ...b, k: "due", label: "Due today", why: sent ? `${num(sent)} sent so far, ${num(c.pending)} still to go.` : "Not sent yet today." };
  if (waiting && sent === 0) return { ...b, k: "pending", label: "Waiting", why: `${num(c.pending)} emails due ${day} have not gone out yet.` };
  if (sent === 0) return { ...b, k: "missing", label: "Not Sent", why: `No emails went out for ${day}.` };
  const parts: string[] = [];
  let lateLabel = "Sent Late";
  if (c.late > 0 && c.lateFirst) {
    const d1 = pacificDay(c.lateFirst), delay = daysBetween(date, d1);
    parts.push(`${num(c.late)} ${c.late === 1 ? "email was" : "emails were"} due ${day} but sent on ${DAYNAMES[weekday(d1)]} ${nice(d1, { month: "short", day: "numeric" })} (${plural(delay, "day")} late).`);
    // Rolling campaigns send each next email 7 days after the last one, so a late email moves the contact's later emails too.
    if (p.rolling) { lateLabel = "Out of Sequence"; parts.push(`Upcoming follow-up emails will now go out on ${DAYNAMES[weekday(d1)]}.`); }
  }
  if (waiting) parts.push(`${num(c.pending)} still waiting.`);
  const lateShare = (c.late / sent) * 100;
  if (lateShare > SEND_MONITOR.latePercent) return { ...b, k: "late", label: lateLabel, why: parts.join(" ") };
  if (change !== null && change < -SEND_MONITOR.dropAlertPercent)
    return { ...b, k: "low", label: "Sent", why: [`${Math.abs(change)}% fewer emails than the last send (${num(prev!.count)}).`, ...parts].join(" ") };
  return { ...b, k: "sent", label: "Sent", why: parts.length ? parts.join(" ") : undefined };
}
// This week's send day if it has passed or is today, else last week's.
export const lastScheduled = (p: Scheduled, today = todayStr()) => scheduledDates(p, today).filter((d) => d <= today).at(-1)!;
// Next send day: a send day still to come (or today's if it is still due). For rolling campaigns the next email Mautic
// has in its queue is used when it comes sooner, because those emails do not wait for the weekday.
export function nextSend(sends: Sends, p: Scheduled, nextQueued?: string | null, now = Date.now()) {
  const t = fmtDate(new Date(now));
  let d = t;
  for (let i = 0; i < 8; i++) { const c = addDays(t, i); if (weekday(c) === p.weekday && (c > t || statusFor(sends, p, c, now).k === "due")) { d = c; break; } }
  if (p.rolling && nextQueued) { const q = pacificDay(nextQueued); if (q >= t && q < d) return q; }
  return d;
}
// The latest scheduled send of each product (this week or last) that needs attention.
export const ALERT: Kind[] = ["missing", "pending", "late", "low"];
export function issues(sends: Sends, ps: Scheduled[], now = Date.now()) {
  const t = fmtDate(new Date(now)), ws = weekStart(t);
  return ps.map((p) => { const d = lastScheduled(p, t); return { p, d, s: statusFor(sends, p, d, now) }; })
    .filter((x) => x.d && x.d >= addDays(ws, -7) && ALERT.includes(x.s.k));
}
export const instName = (k: string) => INSTANCES[k]?.label || k;
