import { INSTANCES } from "./instances";
export const KEYS = Object.keys(INSTANCES);
// Brand sections: Altametrics (Inventory, Timeclock, Scheduling) and Plum (Plum POS, Music, Accounting, Payroll).
export const GROUPS = KEYS.reduce((m, k) => ({ ...m, [INSTANCES[k].group]: [...(m[INSTANCES[k].group] || []), k] }), {} as Record<string, string[]>);
export const GROUP_NAMES = Object.keys(GROUPS);
export type Range = { from: string; to: string };

// Answers are kept in memory while the tab is open, so moving between pages does not reload them.
const memo = new Map<string, any>();
// When the server runs out of time (Vercel answers with a text page, not JSON) the request is tried again.
// Each try continues from the parts the server already saved, so a later try usually succeeds.
export async function getJson(url: string, fresh = false) {
  if (!fresh && memo.has(url)) return memo.get(url);
  let d: any;
  for (let a = 0; a < 3; a++) {
    d = await fetch(url + (fresh && a === 0 ? "&refresh=1" : "")).then(async (r) => {
      const t = await r.text();
      try { return JSON.parse(t); } catch { return { error: "The server took too long to answer. Please click Refresh or try again in a minute.", retry: true }; }
    }).catch(() => ({ error: "Could not reach the server. Please check your connection and try again.", retry: true }));
    if (!d.retry) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!d.error) memo.set(url, d);
  return d;
}
export const cached = (url: string) => memo.get(url);
// Refresh forgets every saved answer in this tab, so no page shows numbers from before the Refresh.
export const clearMemo = () => memo.clear();
export const overviewUrl = (k: string, r: Range, product = "") => `/api/overview?instance=${k}&from=${r.from}&to=${r.to}${product ? `&product=${encodeURIComponent(product)}` : ""}`;
export const topUrl = (k: string) => `/api/top?instance=${k}`;
export const newsletterUrl = (k: string) => `/api/newsletter?instance=${k}`;
export const listUrl = (type: string, k: string, r: Range) => `/api/list?type=${type}&instance=${k}${type === "forms" ? `&from=${r.from}&to=${r.to}` : ""}`;

const FIELDS = ["sent", "opened", "clicks", "lp", "forms", "bounced", "unsub"] as const;
export type Kpi = Record<(typeof FIELDS)[number], number | null>;

// Adds up the overview answers of several instances into one set of totals and one trend line.
export function combine(list: any[]) {
  const ok = list.filter((d) => d && !d.error && d.kpi);
  const total = (k: "kpi" | "prev") => Object.fromEntries(FIELDS.map((f) => [f, !ok.length || ok.some((d) => d[k]?.[f] == null) ? null : ok.reduce((a, d) => a + d[k][f], 0)])) as Kpi;
  const kpi = total("kpi"), prev = total("prev");
  const series = (ok[0]?.series || []).map((s: any, i: number) => {
    const o: any = { label: s.label };
    FIELDS.forEach((f) => (o[f] = ok.reduce((a, d) => a + (d.series[i]?.[f] || 0), 0)));
    return o;
  });
  const delivered = kpi.sent == null || kpi.bounced == null ? null : Math.max(0, kpi.sent - kpi.bounced);
  return { ok, kpi, prev, series, delivered };
}

// Product rows for one instance. Instances with a single product use the instance totals.
export function productRows(k: string, d: any) {
  if (!d?.kpi) return [];
  if (d.products?.length) return d.products.map((p: any) => ({ ...p, inst: k }));
  const names = Object.keys(INSTANCES[k].products);
  return names.length === 1 ? [{ name: names[0], sent: d.kpi.sent, opened: d.kpi.opened, inst: k }] : [];
}
