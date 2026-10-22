import { INSTANCES } from "@/lib/instances";
import { count, isLive, listAll, productOf, runPool, uniqueClicks } from "@/lib/mautic";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const cache = new Map<string, { at: number; data: any }>();
const fmt = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
const base = (e: any) => ({ id: e.id, name: e.name || e.title || "", category: e.category?.title || "", published: !!e.isPublished, modified: e.dateModified || e.dateAdded || "" });

// Emails and pages: all-time counters stored by Mautic. Forms: submissions inside the selected dates.
// Unpublished and test items are left out.
async function rows(key: string, type: string, from: string, to: string, fresh: boolean) {
  if (type === "emails") {
    const [list, clicks] = await Promise.all([listAll(key, "emails", false, fresh), uniqueClicks(key, fresh)]);
    return list.filter(isLive).map((e) => ({ ...base(e), subject: e.subject || "", product: productOf(key, e), kind: e.emailType || "", parent: e.variantParent?.id || null,
      sent: Number(e.sentCount) || 0, opened: Number(e.readCount) || 0, clicks: clicks[e.id] || 0 }));
  }
  if (type === "pages") return (await listAll(key, "pages", false, fresh)).filter(isLive).map((e) => ({ ...base(e), hits: Number(e.hits) || 0, unique: Number(e.uniqueHits) || 0 }));
  if (type === "campaigns") return (await listAll(key, "campaigns", false, fresh)).filter(isLive).map((e) => ({ ...base(e), events: e.events?.length || 0, segments: e.lists?.length || 0, forms: e.forms?.length || 0 }));
  const forms = (await listAll(key, "forms", true, fresh)).filter(isLive);
  const F = fmt(new Date(from + "T00:00:00Z")), T = fmt(new Date(new Date(to + "T00:00:00Z").getTime() + 864e5));
  const subs = await runPool(forms.map((f) => () => count(key, "form_submissions", [{ col: "form_id", expr: "eq", val: f.id }, { col: "date_submitted", expr: "gte", val: F }, { col: "date_submitted", expr: "lt", val: T }])), 8);
  return forms.map((f, i) => ({ ...base(f), submissions: subs[i] }));
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const key = q.get("instance") || "", type = q.get("type") || "", from = q.get("from") || "", to = q.get("to") || "";
  if (!INSTANCES[key] || !["emails", "pages", "campaigns", "forms"].includes(type) || (type === "forms" && (!from || !to))) return Response.json({ error: "bad params" }, { status: 400 });
  const ck = [key, type, type === "forms" ? `${from}|${to}` : ""].join("|");
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < 900_000 && !q.get("refresh")) return Response.json({ ...hit.data, cached: true });
  try {
    const data = { rows: await rows(key, type, from, to, !!q.get("refresh")) };
    cache.set(ck, { at: Date.now(), data });
    return Response.json(data);
  } catch (e: any) {
    return Response.json({ error: `${INSTANCES[key].label}: ${e.message}` }, { status: 502 });
  }
}
