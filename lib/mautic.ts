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
    const r = await fetch(u, { headers: { Authorization: `Bearer ${await token(key)}` }, cache: "no-store" });
    if (r.status === 401) { delete tok[key]; continue; }
    if (r.status >= 500) { await new Promise((s) => setTimeout(s, 1000 * (a + 1))); continue; }
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return r.json();
  }
  throw new Error(`${path}: failed after retries`);
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

// Full list of emails / pages / forms / campaigns, cached for 1 hour.
// minimal=true skips the HTML body (about 50x smaller), but also drops counters like sentCount.
const listCache = new Map<string, { at: number; list: any[] }>();
export async function listAll(key: string, path: string, minimal: boolean, fresh = false) {
  const ck = `${key}|${path}|${minimal}`, c = listCache.get(ck);
  if (c && !fresh && Date.now() - c.at < 3_600_000) return c.list;
  const size = minimal ? 500 : 100, out: any[] = [];
  for (let s = 0; ; s += size) {
    const d = await mget(key, path, { limit: size, start: s, orderBy: "id", orderByDir: "asc", ...(minimal ? { minimal: 1 } : {}) });
    const l: any[] = Object.values(d[path] || {});
    out.push(...l); if (l.length < size) break;
  }
  if (path === "emails") out.push(...(await missingEmails(key, out, fresh)));
  listCache.set(ck, { at: Date.now(), list: out });
  return out;
}
// The email list API leaves out A/B test variants, but their sends are still in the stats.
// Look up every id the list skipped (and a few past the highest one); deleted ids return 404 and are ignored.
const variantCache = new Map<string, { at: number; list: any[] }>();
async function missingEmails(key: string, list: any[], fresh: boolean) {
  const c = variantCache.get(key);
  if (c && !fresh && Date.now() - c.at < 3_600_000) return c.list;
  const have = new Set(list.map((e) => Number(e.id))), max = Math.max(0, ...have), found: any[] = [];
  const get = (id: number) => () => mget(key, `emails/${id}`).then((d) => d.email || null).catch(() => null);
  const ids = Array.from({ length: max }, (_, i) => i + 1).filter((id) => !have.has(id));
  found.push(...(await runPool(ids.map(get), 16)).filter(Boolean));
  for (let s = max + 1; ; s += 16) {
    const more = (await runPool(Array.from({ length: 16 }, (_, i) => get(s + i)), 16)).filter(Boolean);
    found.push(...more); if (!more.length) break;
  }
  variantCache.set(key, { at: Date.now(), list: found });
  return found;
}
// Unique clicks per email: Mautic keeps unique_hits per tracked link, so these are summed for each email.
const clickCache = new Map<string, { at: number; m: Record<string, number> }>();
export async function uniqueClicks(key: string, fresh: boolean) {
  const c = clickCache.get(key);
  if (c && !fresh && Date.now() - c.at < 3_600_000) return c.m;
  const m: Record<string, number> = {};
  for (let s = 0; ; ) {
    const d = await mget(key, "stats/channel_url_trackables", { limit: 1000, start: s, "where[0][col]": "channel", "where[0][expr]": "eq", "where[0][val]": "email" });
    const rows: any[] = d.stats || [];
    rows.forEach((r) => (m[r.channel_id] = (m[r.channel_id] || 0) + (Number(r.unique_hits) || 0)));
    s += rows.length;
    if (!rows.length || s >= Number(d.total)) break;
  }
  clickCache.set(key, { at: Date.now(), m });
  return m;
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
export async function hidden(key: string, fresh = false) {
  const [emails, pages, forms] = await Promise.all([listAll(key, "emails", true, fresh), listAll(key, "pages", true, fresh), listAll(key, "forms", true, fresh)]);
  const ids = (l: any[]) => l.filter((x) => !isLive(x)).map((x) => x.id).join(",");
  return { emails: ids(emails), pages: ids(pages), forms: ids(forms), liveEmails: emails.filter(isLive) };
}
