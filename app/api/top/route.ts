import { cacheGet, cacheSet } from "@/lib/cache";
import { INSTANCES } from "@/lib/instances";
import { campaignEmails, count, isLive, listAll, productOf, runPool, uniqueClicks } from "@/lib/mautic";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const TOP = 5;
const rank = <T,>(list: T[], f: (x: T) => number) => [...list].sort((a, b) => f(b) - f(a)).slice(0, TOP);

// Top emails, campaigns and landing pages for one instance, from the all-time counters stored by Mautic.
// Mautic does not link form submissions to an email, so emails and campaigns have no form column. Unpublished and test items are left out.
async function top(key: string) {
  const [emails, clicks, campaigns, sends, pages] = await Promise.all([listAll(key, "emails", false), uniqueClicks(key), listAll(key, "campaigns", true), campaignEmails(key), listAll(key, "pages", false)]);
  const em = emails.filter(isLive).map((e) => ({ id: e.id, name: e.name || "", product: productOf(key, e), sent: Number(e.sentCount) || 0, opened: Number(e.readCount) || 0, clicks: clicks[e.id] || 0 }));
  const byId = new Map(em.map((e) => [Number(e.id), e]));

  // The best emails of each product, so the product filter still has rows to show.
  const products = [...new Set(em.map((e) => e.product))];
  const topEmails = [...new Set(products.flatMap((p) => rank(em.filter((e) => e.product === p && e.sent > 0), (e) => e.clicks * 1e9 + e.sent)))];

  // A campaign's numbers are the totals of the emails it sends.
  const camp = campaigns.filter(isLive).map((c) => {
    const ids = [...new Set<number>((sends[c.id] || []).filter((id) => byId.has(id)))];
    const sum = (f: "sent" | "opened" | "clicks") => ids.reduce((a, id) => a + byId.get(id)![f], 0);
    return { id: c.id, name: c.name || "", published: !!c.isPublished, ids, sent: sum("sent"), opened: sum("opened"), clicks: sum("clicks") };
  });
  const topCamps = rank(camp.filter((c) => c.sent > 0), (c) => c.sent);
  const topPages = rank(pages.filter(isLive).map((p) => ({ id: p.id, name: p.title || p.name || "", hits: Number(p.hits) || 0, unique: Number(p.uniqueHits) || 0 })).filter((p) => p.hits > 0), (p) => p.hits);

  const lp = (ids: (number | string)[]) => () => (ids.length ? count(key, "page_hits", [{ col: "source", expr: "eq", val: "email" }, { col: "source_id", expr: "in", val: ids.join(",") }]) : Promise.resolve(0));
  const [eLp, cLp, pForms] = await Promise.all([
    runPool(topEmails.map((e) => lp([e.id])), 8),
    runPool(topCamps.map((c) => lp(c.ids)), 8),
    runPool(topPages.map((p) => () => count(key, "form_submissions", [{ col: "page_id", expr: "eq", val: p.id }])), 8),
  ]);
  return {
    emails: topEmails.map((e, i) => ({ ...e, lp: eLp[i] })),
    campaigns: topCamps.map(({ ids, ...c }, i) => ({ ...c, lp: cLp[i] })),
    pages: topPages.map((p, i) => ({ ...p, forms: pForms[i] })),
  };
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const key = q.get("instance") || "";
  if (!INSTANCES[key]) return Response.json({ error: "bad params" }, { status: 400 });
  const ck = `top|${key}`;
  const hit = await cacheGet(ck, !!q.get("refresh"));
  if (hit) return Response.json({ ...hit, cached: true });
  try {
    const data = await top(key);
    await cacheSet(ck, data);
    return Response.json(data);
  } catch (e: any) {
    return Response.json({ error: `${INSTANCES[key].label}: ${e.message}` }, { status: 502 });
  }
}
