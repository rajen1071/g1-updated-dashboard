import { cacheGet, cacheSet } from "@/lib/cache";
import { INSTANCES } from "@/lib/instances";
import { clicksBetween, count, hidden, productOf, runPool, uniqueClickCount, W } from "@/lib/mautic";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const fmt = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");

function idsByProduct(key: string, list: any[]) {
  const m: Record<string, number[]> = {};
  for (const e of list) { const p = productOf(key, e); if (p) (m[p] ||= []).push(e.id); }
  return m;
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const key = q.get("instance") || "", product = q.get("product") || "", from = q.get("from") || "", to = q.get("to") || "";
  if (!INSTANCES[key] || !from || !to) return Response.json({ error: "bad params" }, { status: 400 });
  const ck = ["overview4", key, product, from, to].join("|");
  const hit = await cacheGet(ck, !!q.get("refresh"));
  if (hit) return Response.json({ ...hit, cached: true });
  try {
    // Unpublished and test emails, pages and forms are left out of every count.
    const multi = Object.keys(INSTANCES[key].products).length > 1;
    const H = await hidden(key);
    const byPromise = Promise.resolve(idsByProduct(key, H.liveEmails));
    const P = product ? ((await byPromise)[product] || []).join(",") : "";
    if (product && !P) return Response.json({ series: [], kpi: null, products: [], empty: true });
    const F = new Date(from + "T00:00:00Z"), T = new Date(new Date(to + "T00:00:00Z").getTime() + 864e5);
    const nDays = Math.max(1, Math.round((+T - +F) / 864e5));
    const step = nDays <= 14 ? 1 : Math.ceil(nDays / Math.min(12, Math.ceil(nDays / 7)));
    const buckets: { label: string; s: string; e: string }[] = [];
    for (let d = 0; d < nDays; d += step) {
      const s = new Date(+F + d * 864e5), e = new Date(Math.min(+T, +F + (d + step) * 864e5));
      buckets.push({ label: s.toISOString().slice(0, 10), s: fmt(s), e: fmt(e) });
    }
    const rng = (col: string, b: { s: string; e: string }): W[] => [{ col, expr: "gte", val: b.s }, { col, expr: "lt", val: b.e }];
    const not = (col: string, ids: string): W[] => (ids ? [{ col, expr: "notIn", val: ids }] : []);
    const inP = (col: string): W[] => (P ? [{ col, expr: "in", val: P }] : not(col, H.emails));
    // With a product, landing page visits and form submissions count that product's pages and forms (matched by name, like emails).
    const ofProduct = (l: any[]) => l.filter((x) => productOf(key, x) === product).map((x) => x.id).join(",");
    const PP = product ? ofProduct(H.livePages) : "", PF = product ? ofProduct(H.liveForms) : "";
    const lp = (b: { s: string; e: string }) => () => (!product ? count(key, "page_hits", [...rng("date_hit", b), { col: "page_id", expr: "gt", val: 0 }, ...not("page_id", H.pages)])
      : PP ? count(key, "page_hits", [...rng("date_hit", b), { col: "page_id", expr: "in", val: PP }]) : Promise.resolve(0));
    const forms = (b: { s: string; e: string }) => () => (!product ? count(key, "form_submissions", [...rng("date_submitted", b), ...not("form_id", H.forms)])
      : PF ? count(key, "form_submissions", [...rng("date_submitted", b), { col: "form_id", expr: "in", val: PF }]) : Promise.resolve(0));
    const tasks: (() => Promise<number>)[] = [];
    buckets.forEach((b) => {
      tasks.push(() => count(key, "email_stats", [...rng("date_sent", b), ...inP("email_id")]));
      tasks.push(() => count(key, "email_stats", [...rng("date_sent", b), { col: "is_read", expr: "eq", val: 1 }, ...inP("email_id")]));
      tasks.push(lp(b));
      tasks.push(forms(b));
      tasks.push(() => count(key, "lead_donotcontact", [...rng("date_added", b), { col: "channel", expr: "eq", val: "email" }, { col: "reason", expr: "eq", val: 2 }, ...inP("channel_id")]));
      tasks.push(() => count(key, "lead_donotcontact", [...rng("date_added", b), { col: "channel", expr: "eq", val: "email" }, { col: "reason", expr: "eq", val: 1 }, ...inP("channel_id")]));
    });
    const whole = { s: fmt(F), e: fmt(T) };
    // The same number of days just before the selected dates, for the "vs previous period" change on each card.
    const before = { s: fmt(new Date(+F - (+T - +F))), e: fmt(F) };
    const prevTasks: (() => Promise<number | null>)[] = [
      () => count(key, "email_stats", [...rng("date_sent", before), ...inP("email_id")]),
      () => count(key, "email_stats", [...rng("date_sent", before), { col: "is_read", expr: "eq", val: 1 }, ...inP("email_id")]),
      lp(before),
      forms(before),
      () => count(key, "lead_donotcontact", [...rng("date_added", before), { col: "channel", expr: "eq", val: "email" }, { col: "reason", expr: "eq", val: 2 }, ...inP("channel_id")]),
      () => count(key, "lead_donotcontact", [...rng("date_added", before), { col: "channel", expr: "eq", val: "email" }, { col: "reason", expr: "eq", val: 1 }, ...inP("channel_id")]),
    ];
    // Unique email clicks (each contact once per email), from the click rows of the selected and previous dates.
    const shown = P ? new Set(P.split(",").map(Number)) : null, hide = new Set(H.emails.split(",").filter(Boolean).map(Number));
    const clicksPromise = clicksBetween(key, before.s, whole.e).then((l) => l.filter((c) => (shown ? shown.has(c[0]) : !hide.has(c[0]))));
    const uc = (l: Awaited<typeof clicksPromise>, b: { s: string; e: string }) => uniqueClickCount(l.filter((c) => c[2] >= b.s && c[2] < b.e));
    const [r, pv, pr, cl] = await Promise.all([runPool(tasks, 12), runPool(prevTasks, 4), byPromise.then((byP) => {
      const prods = !product && multi ? Object.entries(byP) : [];
      return runPool(prods.flatMap(([name, ids]) => [
        () => count(key, "email_stats", [...rng("date_sent", whole), { col: "email_id", expr: "in", val: ids.join(",") }]),
        () => count(key, "email_stats", [...rng("date_sent", whole), { col: "is_read", expr: "eq", val: 1 }, { col: "email_id", expr: "in", val: ids.join(",") }]),
      ]), 8).then((c) => prods.map(([name], i) => ({ name, sent: c[i * 2], opened: c[i * 2 + 1] })));
    }), clicksPromise]);
    const series = buckets.map((b, i) => { const o = r.slice(i * 6, i * 6 + 6); return { label: b.label, sent: o[0], opened: o[1], clicks: uc(cl, b), lp: o[2], forms: o[3], bounced: o[4], unsub: o[5] }; });
    const sum = (f: string) => series.some((s: any) => s[f] < 0) ? null : series.reduce((a: number, s: any) => a + s[f], 0);
    const kpi = { sent: sum("sent"), opened: sum("opened"), clicks: uc(cl, whole), lp: sum("lp"), forms: sum("forms"), bounced: sum("bounced"), unsub: sum("unsub") };
    const products = pr;
    const prev = { sent: pv[0], opened: pv[1], clicks: uc(cl, before), lp: pv[2], forms: pv[3], bounced: pv[4], unsub: pv[5] };
    const data = { series: series.map((s) => ({ ...s, lp: Math.max(0, s.lp), forms: Math.max(0, s.forms) })), kpi, prev, products };
    await cacheSet(ck, data);
    return Response.json(data);
  } catch (e: any) {
    return Response.json({ error: `${INSTANCES[key].label}: ${e.message}` }, { status: 502 });
  }
}
