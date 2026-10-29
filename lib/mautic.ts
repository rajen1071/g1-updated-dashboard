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

// Start and end of the selected dates as Mautic date-time text (the end date is included).
const fmt = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
export const span = (from: string, to: string) => [fmt(new Date(from + "T00:00:00Z")), fmt(new Date(new Date(to + "T00:00:00Z").getTime() + 864e5))];

// Email clicks as [email id, contact, click time]. Mautic only gives totals, so the click rows are downloaded to count
// each contact once per email (unique clicks). Rows are fetched in fixed 7-day blocks, so every date range reuses them.
export type Click = [number, string, string];
const WEEK = 7 * 864e5;
function clickBlock(key: string, n: number): Promise<Click[]> {
  return shared(`raw|${key}|clicks-wk|${n}`, async () => {
    const where = { "where[0][col]": "source", "where[0][expr]": "eq", "where[0][val]": "email",
      "where[1][col]": "date_hit", "where[1][expr]": "gte", "where[1][val]": fmt(new Date(n * WEEK)),
      "where[2][col]": "date_hit", "where[2][expr]": "lt", "where[2][val]": fmt(new Date((n + 1) * WEEK)) };
    const total = Number((await mget(key, "stats/page_hits", { limit: 1, ...where })).total) || 0;
    const pages = await runPool(Array.from({ length: Math.ceil(total / 1000) }, (_, i) => () =>
      mget(key, "stats/page_hits", { limit: 1000, start: i * 1000, "order[0][col]": "id", "order[0][dir]": "ASC", ...where }).then((d) => d.stats || [])), 6);
    // A click without a known contact counts on its own.
    return pages.flat().map((r: any): Click => [Number(r.source_id), r.lead_id ? String(r.lead_id) : `hit${r.id}`, String(r.date_hit)]);
  });
}
// Email clicks between two Mautic date-times (the end is not included).
export async function clicksBetween(key: string, s: string, e: string): Promise<Click[]> {
  const ms = (t: string) => Date.parse(t.replace(" ", "T") + "Z");
  const a = Math.floor(ms(s) / WEEK), b = Math.floor((ms(e) - 1) / WEEK);
  const blocks = await runPool(Array.from({ length: b - a + 1 }, (_, i) => () => clickBlock(key, a + i)), 3);
  return blocks.flat().filter((c) => c[2] >= s && c[2] < e);
}
// Unique clicks: each contact is counted once per email.
export const uniqueClickCount = (clicks: Click[]) => new Set(clicks.map((c) => `${c[0]}|${c[1]}`)).size;
export function uniqueClicksByEmail(clicks: Click[]) {
  const seen = new Set<string>(), m: Record<number, number> = {};
  clicks.forEach((c) => { const k = `${c[0]}|${c[1]}`; if (!seen.has(k)) { seen.add(k); m[c[0]] = (m[c[0]] || 0) + 1; } });
  return m;
}

// Sends, opens and unique email clicks of each live email in the selected dates (opens of the emails sent in those dates, clicks made in them).
// Sends are counted for every email first; opens and clicks only for the emails that sent something, which saves many Mautic calls.
export function emailsInRange(key: string, from: string, to: string): Promise<Record<string, { sent: number; opened: number; clicks: number }>> {
  return shared(`raw|${key}|emails-range2|${from}|${to}`, async () => {
    const [F, T] = span(from, to);
    const rng = (col: string): W[] => [{ col, expr: "gte", val: F }, { col, expr: "lt", val: T }];
    const list = (await listAll(key, "emails", false)).filter((e) => isLive(e) && Number(e.sentCount) > 0);
    // Groups of 10 emails are counted first; only the emails of groups that sent something are counted one by one.
    const sentTo = (ids: number[]) => () => count(key, "email_stats", [{ col: "email_id", expr: ids.length > 1 ? "in" : "eq", val: ids.join(",") }, ...rng("date_sent")]);
    const groups = Array.from({ length: Math.ceil(list.length / 10) }, (_, i) => list.slice(i * 10, i * 10 + 10).map((e) => Number(e.id)));
    const groupSent = await runPool(groups.map(sentTo), 24);
    const maybe = groups.filter((_, i) => groupSent[i] > 0).flat();
    const each = await runPool(maybe.map((id) => sentTo([id])), 24);
    const sentById = new Map(maybe.map((id, i) => [id, each[i]]));
    const sent = list.map((e) => sentById.get(Number(e.id)) || 0);
    const active = list.filter((_, i) => sent[i] > 0);
    const [opened, clicks] = await Promise.all([
      runPool(active.map((e) => () => count(key, "email_stats", [{ col: "email_id", expr: "eq", val: e.id }, { col: "is_read", expr: "eq", val: 1 }, ...rng("date_sent")])), 24),
      clicksBetween(key, F, T).then(uniqueClicksByEmail),
    ]);
    const out: Record<string, { sent: number; opened: number; clicks: number }> = {};
    list.forEach((e, i) => (out[e.id] = { sent: sent[i], opened: 0, clicks: 0 }));
    active.forEach((e, i) => Object.assign(out[e.id], { opened: opened[i], clicks: clicks[e.id] || 0 }));
    return out;
  });
}
// Visits of each live landing page in the selected dates.
export function pagesInRange(key: string, from: string, to: string): Promise<Record<string, number>> {
  return shared(`raw|${key}|pages-range|${from}|${to}`, async () => {
    const [F, T] = span(from, to);
    const list = (await listAll(key, "pages", false)).filter((p) => isLive(p) && Number(p.hits) > 0);
    const hits = await runPool(list.map((p) => () => count(key, "page_hits", [{ col: "page_id", expr: "eq", val: p.id }, { col: "date_hit", expr: "gte", val: F }, { col: "date_hit", expr: "lt", val: T }])), 16);
    return Object.fromEntries(list.map((p, i) => [p.id, hits[i]]));
  });
}

// An email, landing page or form belongs to the first product whose keyword appears in its category or name (title for pages).
// "*" matches everything. Items that match no product (for example newsletters or system forms) have no product ("").
export function productOf(key: string, e: any) {
  const text = `${e.category?.title || ""} ${e.name || e.title || ""}`.toLowerCase();
  for (const [p, kws] of Object.entries(INSTANCES[key].products)) if (kws.some((k) => k === "*" || text.includes(k))) return p;
  return "";
}

// Unpublished items and anything named or filed as a test are left out of every number in the dashboard.
export const isLive = (e: any) => !!e.isPublished && !/\btest/i.test(`${e.name || e.title || ""} ${e.category?.title || ""}`);
// Hidden email, page and form ids (comma separated, for "notIn" filters on the stats tables) and the live emails, pages and forms.
export async function hidden(key: string) {
  const [emails, pages, forms] = await Promise.all([listAll(key, "emails", true), listAll(key, "pages", true), listAll(key, "forms", true)]);
  const ids = (l: any[]) => l.filter((x) => !isLive(x)).map((x) => x.id).join(",");
  return { emails: ids(emails), pages: ids(pages), forms: ids(forms), liveEmails: emails.filter(isLive), livePages: pages.filter(isLive), liveForms: forms.filter(isLive) };
}
