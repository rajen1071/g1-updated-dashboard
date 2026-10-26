import { cacheGet, cacheSet } from "@/lib/cache";
import { INSTANCES } from "@/lib/instances";
import { count, listAll, mget, productOf, runPool } from "@/lib/mautic";
import { SCHEDULE, scheduledDates, Sends, todayStr, utcBounds } from "@/lib/sendMonitor";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Each product's emails, by the same name and category keywords as every other page. Test emails are left out;
// unpublished emails are kept, because an email is often unpublished after its weekly send went out.
async function emailIds(key: string, from: string) {
  const list = (await listAll(key, "emails", true)).filter((e) => !/\btest/i.test(`${e.name || ""} ${e.category?.title || ""}`));
  // Every week sends new emails, which may be newer than the saved email list. Emails that sent something and have a
  // higher id than the list are looked up one by one (deleted ids just return nothing).
  const max = Math.max(0, ...list.map((e) => Number(e.id)));
  const top = Number((await mget(key, "stats/email_stats", { limit: 1, "order[0][col]": "email_id", "order[0][dir]": "DESC",
    "where[0][col]": "date_sent", "where[0][expr]": "gte", "where[0][val]": from, "where[1][col]": "email_id", "where[1][expr]": "gt", "where[1][val]": max })).stats?.[0]?.email_id) || 0;
  const added = await runPool(Array.from({ length: Math.max(0, top - max) }, (_, i) => () => mget(key, `emails/${max + 1 + i}`).then((d) => d.email).catch(() => null)), 8);
  const m: Record<string, number[]> = {};
  for (const e of [...list, ...added.filter(Boolean)]) { const p = productOf(key, e); if (p) (m[p] ||= []).push(Number(e.id)); }
  return m;
}

// Emails sent by each scheduled product of this instance on each of its send days (sends[productId][date]).
async function sends(key: string, dates: (d: string) => boolean): Promise<Sends> {
  const ps = SCHEDULE.filter((p) => p.instance === key);
  const all = ps.flatMap((p) => scheduledDates(p).filter(dates).map((d) => ({ p, d })));
  const out: Sends = Object.fromEntries(ps.map((p) => [p.id, {}]));
  if (!all.length) return out;
  const ids = await emailIds(key, utcBounds(all.map((x) => x.d).sort()[0])[0]);
  const c = await runPool(all.map(({ p, d }) => () => {
    const [F, T] = utcBounds(d), list = ids[p.product] || [];
    return list.length ? count(key, "email_stats", [{ col: "email_id", expr: "in", val: list.join(",") }, { col: "date_sent", expr: "gte", val: F }, { col: "date_sent", expr: "lt", val: T }]) : Promise.resolve(0);
  }), 8);
  all.forEach(({ p, d }, i) => (out[p.id][d] = c[i]));
  return out;
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const key = q.get("instance") || "";
  if (!INSTANCES[key]) return Response.json({ error: "bad params" }, { status: 400 });
  const t = todayStr();
  try {
    // Past send days do not change, so they are saved (until the next Refresh). Today is counted again on every request.
    const ck = `sends|${key}|${t}`;
    let past: Sends | null = await cacheGet(ck, !!q.get("refresh"));
    if (!past) { past = await sends(key, (d) => d < t); await cacheSet(ck, past); }
    const today = await sends(key, (d) => d === t);
    const data = Object.fromEntries(Object.keys(past).map((p) => [p, { ...past![p], ...today[p] }]));
    return Response.json({ sends: data, today: t });
  } catch (e: any) {
    return Response.json({ error: `${INSTANCES[key].label}: ${e.message}` }, { status: 502 });
  }
}
