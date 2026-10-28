import { cacheGet, cacheSet, keepGet, keepSet } from "@/lib/cache";
import { INSTANCES } from "@/lib/instances";
import { count, mget, runPool, W } from "@/lib/mautic";
import { addDays, Cell, SCHEDULE, Scheduled, scheduledDates, Sends, todayStr, utcBounds } from "@/lib/sendMonitor";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const LOG = "campaign_lead_event_log";
// The weekly email steps of a product's campaigns. The first email ("1 hour after the contact joins") is left out:
// it goes out whenever a contact joins, on any day, so it is not part of the weekly send.
// Saved until the next Refresh, because campaign steps rarely change.
async function steps(key: string, p: Scheduled): Promise<string> {
  const ck = `sends-steps|${key}|${p.id}`, hit = await cacheGet(ck);
  if (hit != null) return hit;
  const ids = await loadSteps(key, p);
  await cacheSet(ck, ids);
  return ids;
}
async function loadSteps(key: string, p: Scheduled) {
  const evs = await Promise.all(p.campaigns.map((c) => mget(key, "campaigns/events", { limit: 1000, "where[0][col]": "campaign", "where[0][expr]": "eq", "where[0][val]": c })));
  return evs.flatMap((d) => Object.values(d.events || {}) as any[])
    .filter((v) => v.type === "email.send" && !(v.triggerMode === "interval" && ["h", "i"].includes(v.triggerIntervalUnit)))
    .map((v) => v.id).join(",");
}
const first = async (key: string, where: W[], col: string, dir: "ASC" | "DESC") => {
  const p: Record<string, string | number> = { limit: 1, "order[0][col]": col, "order[0][dir]": dir };
  where.forEach((w, i) => { p[`where[${i}][col]`] = w.col; p[`where[${i}][expr]`] = w.expr; p[`where[${i}][val]`] = w.val; });
  return (await mget(key, `stats/${LOG}`, p)).stats?.[0]?.[col] as string | undefined;
};

// What happened to the emails Mautic scheduled for one send day. Each email is counted once, under the day it was
// scheduled for: sent that day, sent on a later day, or still waiting. Rows whose run time is before the day are earlier
// rotations of the same step and are left out.
async function day(key: string, ev: string, d: string): Promise<Cell> {
  const [F, T] = utcBounds(d);
  const base: W[] = [{ col: "event_id", expr: "in", val: ev }, { col: "trigger_date", expr: "gte", val: F }, { col: "trigger_date", expr: "lt", val: T }];
  const done: W[] = [...base, { col: "is_scheduled", expr: "eq", val: 0 }];
  const lateW: W[] = [...done, { col: "date_triggered", expr: "gte", val: T }];
  const [onTime, late, pending] = await Promise.all([
    count(key, LOG, [...done, { col: "date_triggered", expr: "gte", val: F }, { col: "date_triggered", expr: "lt", val: T }]),
    count(key, LOG, lateW),
    count(key, LOG, [...base, { col: "is_scheduled", expr: "eq", val: 1 }]),
  ]);
  const c: Cell = { onTime, late, pending };
  if (late) [c.lateFirst, c.lateLast] = await Promise.all([first(key, lateW, "date_triggered", "ASC"), first(key, lateW, "date_triggered", "DESC")]);
  return c;
}

async function sends(key: string, dates: (d: string) => boolean): Promise<Sends> {
  const ps = SCHEDULE.filter((p) => p.instance === key);
  const ev = Object.fromEntries(await Promise.all(ps.map(async (p) => [p.id, await steps(key, p)])));
  const all = ps.flatMap((p) => scheduledDates(p).filter(dates).map((d) => ({ p, d })));
  // A send day more than a week old no longer changes, so it is kept for good (a Refresh does not clear it);
  // only new days are counted in Mautic. The key includes the campaign steps, so a changed campaign is counted again.
  const old = addDays(todayStr(), -7);
  const c = await runPool(all.map(({ p, d }) => async () => {
    if (!ev[p.id]) return { onTime: 0, late: 0, pending: 0 };
    const kk = `sendday|${key}|${p.id}|${d}|${ev[p.id]}`;
    if (d < old) { const hit = await keepGet(kk); if (hit) return hit as Cell; }
    const r = await day(key, ev[p.id], d);
    if (d < old) await keepSet(kk, r);
    return r;
  }), 8);
  const out: Sends = Object.fromEntries(ps.map((p) => [p.id, {}]));
  all.forEach(({ p, d }, i) => (out[p.id][d] = c[i]));
  return out;
}
// Next email each rolling product has in Mautic's queue (UTC text), for the "Next send" column.
async function queued(key: string) {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const ps = SCHEDULE.filter((p) => p.instance === key && p.rolling);
  return Object.fromEntries(await Promise.all(ps.map(async (p) => [p.id, (await first(key, [{ col: "event_id", expr: "in", val: await steps(key, p) },
    { col: "is_scheduled", expr: "eq", val: 1 }, { col: "trigger_date", expr: "gte", val: now }], "trigger_date", "ASC")) || null])));
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const key = q.get("instance") || "";
  if (!INSTANCES[key]) return Response.json({ error: "bad params" }, { status: 400 });
  const t = todayStr(), recent = addDays(t, -7);
  try {
    // Send days more than a week old do not change any more, so they are saved (until the next Refresh).
    // The last week is counted again every 10 minutes, because late emails and waiting emails can still go out.
    const fresh = !!q.get("refresh"), ck = `sends2|${key}|${t}`;
    let past: Sends | null = await cacheGet(ck, fresh);
    if (!past) { past = await sends(key, (d) => d < recent); await cacheSet(ck, past); }
    const rk = `sends2-recent|${key}|${t}|${Math.floor(Date.now() / 6e5)}`;
    let recentData = fresh ? null : await cacheGet(rk);
    if (!recentData) { recentData = await Promise.all([sends(key, (d) => d >= recent && d <= t), queued(key)]); await cacheSet(rk, recentData); }
    const [now, next] = recentData as [Sends, Record<string, string | null>];
    const data = Object.fromEntries(Object.keys(past).map((p) => [p, { ...past![p], ...now[p] }]));
    return Response.json({ sends: data, next, today: t });
  } catch (e: any) {
    return Response.json({ error: `${INSTANCES[key].label}: ${e.message}` }, { status: 502 });
  }
}
