import { cacheGet, cacheSet } from "@/lib/cache";
import { INSTANCES } from "@/lib/instances";
import { count, listAll, runPool, uniqueClicks } from "@/lib/mautic";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Newsletter emails are the ones with "newsletter" in their name or category (only Altametrics sends them today).
// A newsletter is often unpublished after it goes out, so sent newsletters are kept even when unpublished. Test emails are left out.
const isNewsletter = (e: any) => /newsletter/i.test(`${e.name || ""} ${e.category?.title || ""}`) && !/\btest/i.test(e.name || "") && (!!e.isPublished || Number(e.sentCount) > 0);

async function rows(key: string) {
  const list = (await listAll(key, "emails", false)).filter(isNewsletter);
  if (!list.length) return [];
  const clicks = await uniqueClicks(key);
  const dnc = (id: number, reason: number) => () => count(key, "lead_donotcontact", [{ col: "channel", expr: "eq", val: "email" }, { col: "channel_id", expr: "eq", val: id }, { col: "reason", expr: "eq", val: reason }]);
  const c = await runPool(list.flatMap((e) => [dnc(e.id, 2), dnc(e.id, 1), () => count(key, "page_hits", [{ col: "source", expr: "eq", val: "email" }, { col: "source_id", expr: "eq", val: e.id }])]), 8);
  return list.map((e, i) => ({
    id: e.id, name: e.name || "", subject: e.subject || "", published: !!e.isPublished, date: e.publishUp || e.dateAdded || "",
    segments: (e.lists || []).map((l: any) => l.name).filter((s: string) => !/test/i.test(s)),
    sent: Number(e.sentCount) || 0, opened: Number(e.readCount) || 0, clicks: clicks[e.id] || 0, bounced: c[i * 3], unsub: c[i * 3 + 1], lp: c[i * 3 + 2],
  })).sort((a, b) => b.date.localeCompare(a.date));
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const key = q.get("instance") || "";
  if (!INSTANCES[key]) return Response.json({ error: "bad params" }, { status: 400 });
  const ck = `newsletter|${key}`;
  const hit = await cacheGet(ck, !!q.get("refresh"));
  if (hit) return Response.json({ ...hit, cached: true });
  try {
    const data = { rows: await rows(key) };
    await cacheSet(ck, data);
    return Response.json(data);
  } catch (e: any) {
    return Response.json({ error: `${INSTANCES[key].label}: ${e.message}` }, { status: 502 });
  }
}
