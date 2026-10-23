import { cacheGet, cacheSet, keepGet, keepSet } from "./cache";
import { INSTANCES } from "./instances";
const tok: Record<string, { t: string; exp: number }> = {};
export type W = { col: string; expr: string; val: string | number };

async function token(key: string) {
  if (tok[key] && tok[key].exp > Date.now() + 60_000) return tok[key].t;
  const i = INSTANCES[key];
  const r = await fetch(`${i.url}/oauth/v2/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: process.env[`${i.env}_CLIENT_ID`] || "", client_secret: process.env[`${i.env}_CLIENT_SECRET`] || "" }) });
  if (!r.ok) throw new Error(`OAuth failed (HTTP ${r.status})`);
  const d = await r.json();
  tok[key] = { t: d.access_token, exp: Date.now() + d.expires_in * 1000 };
  return d.access_token as string;
}
export async function mget(key: string, path: string, params: Record<string, string | number> = {}) {
  const u = new URL(`${INSTANCES[key].url}/api/${path}`);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, String(v)));
  for (let a = 0; a < 3; a++) {
    // A Mautic call that hangs is stopped after 45 seconds (including reading the answer) and tried again.
    const r = await fetch(u, { headers: { Authorization: `Bearer ${await token(key)}` }, cache: "no-store", signal: AbortSignal.timeout(45_000) })
      .then(async (r) => ({ status: r.status, body: r.ok ? await r.json() : null })).catch(() => null);
    if (!r || r.status >= 500) { await new Promise((s) => setTimeout(s, 1000 * (a + 1))); continue; }
    if (r.status === 401) { delete tok[key]; continue; }
    if (r.status >= 400) throw new Error(`${path}: HTTP ${r.status}`);
    return r.body;
  }
  throw new Error(`${path}: Mautic did not answer in time, please try again`);
}
// limit=1 + the response "total" gives only the count, so no rows are downloaded
export async function count(key: string, table: string, where: W[]) {
  const p: Record<string, string | number> = { limit: 1 };
  where.forEach((w, i) => { p[`where[${i}][col]`] = w.col; p[`where[${i}][expr]`] = w.expr; p[`where[${i}][val]`] = w.val; });
  return Number((await mget(key, `stats/${table}`, p)).total) || 0;
}
export async function runPool<T>(tasks: (() => Promise<T>)[], n = 8): Promise<T[]> {
  const out: T[] = new Array(tasks.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < tasks.length) { const k = i++; out[k] = await tasks[k](); } }));
  return out;
}

// Building blocks used by several API routes (lists, A/B variants, clicks). Each is built once, saved like an API answer
// (memory, and MongoDB when set) and reused by every route and server until the next Refresh click.
// Requests that arrive while one is being built wait for that build instead of starting their own.
const building = new Map<string, Promise<any>>();
async function shared<T>(key: string, build: () => Promise<T>): Promise<T> {
  const hit = await cacheGet(key);
  if (hit) return hit;
  if (!building.has(key)) building.set(key, build().then(async (d) => { await cacheSet(key, d); return d; }).finally(() => building.delete(key)));
  return building.get(key)!;
}

// Only the fields the dashboard uses are kept, so saved lists stay small (the full emails include their HTML).
const slim = (e: any) => ({
  id: e.id, name: e.name, title: e.title, subject: e.subject, isPublished: e.isPublished, emailType: e.emailType,
  publishUp: e.publishUp, dateAdded: e.dateAdded, dateModified: e.dateModified, sentCount: e.sentCount, readCount: e.readCount, hits: e.hits, uniqueHits: e.uniqueHits,
  category: e.category ? { title: e.category.title } : undefined, variantParent: e.variantParent ? { id: e.variantParent.id } : undefined,
  lists: e.lists?.map((l: any) => ({ name: l.name })), forms: e.forms?.map((f: any) => ({ id: f.id })),
  events: e.events?.map((v: any) => ({ channel: v.channel, channelId: v.channelId, properties: { email: v.properties?.email } })),
});

// Full list of emails / pages / forms / campaigns, kept until the next Refresh click.
// minimal=true skips the HTML body (about 50x smaller), but also drops counters like sentCount.
// The pages of a list are loaded at the same time, because Mautic is slow to answer for big pages.
export function listAll(key: string, path: string, minimal: boolean): Promise<any[]> {
  return shared(`raw|${key}|${path}|${minimal}`, async () => {
    // Full campaigns carry the whole setup of every step (up to 1 MB each), so they are loaded 5 at a time.
    const size = minimal ? 500 : path === "campaigns" ? 5 : 25, get = (s: number) => mget(key, path, { limit: size, start: s, orderBy: "id", orderByDir: "asc", ...(minimal ? { minimal: 1 } : {}) });
    const first = await get(0), total = Number(first.total) || 0;
    const rest = await runPool(Array.from({ length: Math.max(0, Math.ceil(total / size) - 1) }, (_, i) => () => get((i + 1) * size)), path === "campaigns" ? 16 : 6);
    const out = [first, ...rest].flatMap((d) => Object.values(d[path] || {}) as any[]).map(slim);
    if (path === "emails") out.push(...(await missingEmails(key, out)));
    return out;
  });
}
// The email list API leaves out A/B test variants, but their sends are still in the stats.
// Look up every id the list skipped (and a few past the highest one). Deleted ids return 404 and are remembered for good,
// because Mautic never reuses an id, so later loads only look up the variants.
function missingEmails(key: string, list: any[]): Promise<any[]> {
  return shared(`raw|${key}|variants`, async () => {
    const gone = new Set<number>((await keepGet(`gone|${key}`)) || []);
    const have = new Set(list.map((e) => Number(e.id))), max = Math.max(0, ...have), found: any[] = [], missing: number[] = [];
    const get = (id: number) => () => mget(key, `emails/${id}`).then((d) => (d.email ? slim(d.email) : null)).catch((e) => { if (/HTTP 404/.test(e.message)) missing.push(id); return null; });
    const ids = Array.from({ length: max }, (_, i) => i + 1).filter((id) => !have.has(id) && !gone.has(id));
    found.push(...(await runPool(ids.map(get), 16)).filter(Boolean));
    for (let s = max + 1; ; s += 16) {
      const more = (await runPool(Array.from({ length: 16 }, (_, i) => get(s + i)), 16)).filter(Boolean);
      found.push(...more); if (!more.length) break;
    }
    // Only ids below the highest existing one are surely deleted; higher ids may still be created.
    const top = Math.max(max, ...found.map((e) => Number(e.id)));
    const newGone = missing.filter((id) => id < top && !gone.has(id));
    if (newGone.length) await keepSet(`gone|${key}`, [...gone, ...newGone]);
    return found;
  });
}
// Emails sent by each campaign (campaign id -> email ids), read from the steps of each campaign.
// This is much faster than the full campaign list, which repeats the whole setup of every step.
// Steps are asked for one campaign at a time, because Mautic's paging of the whole step list skips and repeats steps.
export function campaignEmails(key: string): Promise<Record<string, number[]>> {
  return shared(`raw|${key}|campaign-emails`, async () => {
    const camps = await listAll(key, "campaigns", true);
    const steps = await runPool(camps.map((c) => () => mget(key, "campaigns/events", { limit: 1000, "where[0][col]": "campaign", "where[0][expr]": "eq", "where[0][val]": c.id })), 8);
    return Object.fromEntries(camps.map((c, i) => [c.id, (Object.values(steps[i].events || {}) as any[])
      .map((v) => Number(v.channel === "email" ? v.channelId : v.properties?.properties?.email ?? v.properties?.email) || 0).filter(Boolean)]));
  });
}
// Unique clicks per email: Mautic keeps unique_hits per tracked link, so these are summed for each email.
export function uniqueClicks(key: string): Promise<Record<string, number>> {
  return shared(`raw|${key}|clicks`, async () => {
    const m: Record<string, number> = {};
    for (let s = 0; ; ) {
      const d = await mget(key, "stats/channel_url_trackables", { limit: 1000, start: s, "where[0][col]": "channel", "where[0][expr]": "eq", "where[0][val]": "email" });
      const rows: any[] = d.stats || [];
      rows.forEach((r) => (m[r.channel_id] = (m[r.channel_id] || 0) + (Number(r.unique_hits) || 0)));
      s += rows.length;
      if (!rows.length || s >= Number(d.total)) break;
    }
    return m;
  });
}

// An email belongs to the first product whose keyword appears in its category or name. "*" matches every email.
export function productOf(key: string, e: any) {
  const text = `${e.category?.title || ""} ${e.name || ""}`.toLowerCase();
  for (const [p, kws] of Object.entries(INSTANCES[key].products)) if (kws.some((k) => k === "*" || text.includes(k))) return p;
  return "Other";
}

// Unpublished items and anything named or filed as a test are left out of every number in the dashboard.
export const isLive = (e: any) => !!e.isPublished && !/\btest/i.test(`${e.name || e.title || ""} ${e.category?.title || ""}`);
// Hidden email, page and form ids (comma separated, for "notIn" filters on the stats tables) and the live emails.
export async function hidden(key: string) {
  const [emails, pages, forms] = await Promise.all([listAll(key, "emails", true), listAll(key, "pages", true), listAll(key, "forms", true)]);
  const ids = (l: any[]) => l.filter((x) => !isLive(x)).map((x) => x.id).join(",");
  return { emails: ids(emails), pages: ids(pages), forms: ids(forms), liveEmails: emails.filter(isLive) };
}
