import { cacheGet, cacheSet } from "@/lib/cache";
import { INSTANCES } from "@/lib/instances";
import { campaignEmails, count, emailsInRange, isLive, listAll, pagesInRange, productOf, runPool } from "@/lib/mautic";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const fmt = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
const base = (e: any) => ({ id: e.id, name: e.name || e.title || "", category: e.category?.title || "", published: !!e.isPublished, modified: e.dateModified || e.dateAdded || "" });

// Every list uses the selected dates: emails (sends, opens, clicks), landing pages (visits), campaigns (the numbers of the
// emails they send) and forms (submissions). Unpublished and test items are left out.
async function rows(key: string, type: string, from: string, to: string) {
  if (type === "emails") {
    const [list, inRange] = await Promise.all([listAll(key, "emails", false), emailsInRange(key, from, to)]);
    return list.filter(isLive).map((e) => ({ ...base(e), subject: e.subject || "", product: productOf(key, e), kind: e.emailType || "", parent: e.variantParent?.id || null,
      ...(inRange[e.id] || { sent: 0, opened: 0, clicks: 0 }), allSent: Number(e.sentCount) || 0 }));
  }
  if (type === "pages") {
    const [list, inRange] = await Promise.all([listAll(key, "pages", false), pagesInRange(key, from, to)]);
    return list.filter(isLive).map((e) => ({ ...base(e), product: productOf(key, e), visits: inRange[e.id] || 0, hits: Number(e.hits) || 0, unique: Number(e.uniqueHits) || 0 }));
  }
  if (type === "campaigns") {
    // A campaign's numbers are the totals of the emails it sends.
    const [list, sends, inRange] = await Promise.all([listAll(key, "campaigns", false), campaignEmails(key), emailsInRange(key, from, to)]);
    return list.filter(isLive).map((e) => {
      const ids = [...new Set(sends[e.id] || [])].filter((id) => inRange[id]);
      const sum = (f: "sent" | "opened" | "clicks") => ids.reduce((a, id) => a + inRange[id][f], 0);
      return { ...base(e), sent: sum("sent"), opened: sum("opened"), clicks: sum("clicks"), events: e.events?.length || 0, segments: e.lists?.length || 0, forms: e.forms?.length || 0 };
    });
  }
  const forms = (await listAll(key, "forms", true)).filter(isLive);
  // Submissions in the selected dates, in the same number of days just before them, and all time.
  const f0 = new Date(from + "T00:00:00Z"), t0 = new Date(new Date(to + "T00:00:00Z").getTime() + 864e5);
  const F = fmt(f0), T = fmt(t0), B = fmt(new Date(+f0 - (+t0 - +f0)));
  const sub = (id: number, s?: string, e?: string) => () => count(key, "form_submissions", [{ col: "form_id", expr: "eq", val: id },
    ...(s && e ? [{ col: "date_submitted", expr: "gte", val: s }, { col: "date_submitted", expr: "lt", val: e }] : [])]);
  const c = await runPool(forms.flatMap((f) => [sub(f.id, F, T), sub(f.id, B, F), sub(f.id)]), 8);
  return forms.map((f, i) => ({ ...base(f), product: productOf(key, f), submissions: c[i * 3], prev: c[i * 3 + 1], total: c[i * 3 + 2] }));
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const key = q.get("instance") || "", type = q.get("type") || "", from = q.get("from") || "", to = q.get("to") || "";
  if (!INSTANCES[key] || !["emails", "pages", "campaigns", "forms"].includes(type) || !from || !to) return Response.json({ error: "bad params" }, { status: 400 });
  const ck = ["list3", key, type, from, to].join("|");
  const hit = await cacheGet(ck, !!q.get("refresh"));
  if (hit) return Response.json({ ...hit, cached: true });
  try {
    const data = { rows: await rows(key, type, from, to) };
    await cacheSet(ck, data);
    return Response.json(data);
  } catch (e: any) {
    return Response.json({ error: `${INSTANCES[key].label}: ${e.message}` }, { status: 502 });
  }
}
