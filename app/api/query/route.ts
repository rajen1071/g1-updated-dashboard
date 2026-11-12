import { createHash, timingSafeEqual } from "node:crypto";
import { INSTANCES } from "@/lib/instances";
import { mget } from "@/lib/mautic";
import { parse, toParams } from "@/lib/sql";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// The Query page: runs one simple SELECT against a Mautic stats table (see lib/sql.ts) and returns the rows.
// Rows carry contact data (email addresses, IP addresses), so every request needs the password in QUERY_PASSWORD.
// Without that variable the page is switched off. Answers are never saved in the cache.
const hash = (s: string) => createHash("sha256").update(s).digest();
const allowed = (given: unknown) => typeof given === "string" && timingSafeEqual(hash(given), hash(process.env.QUERY_PASSWORD || ""));

// Tables and columns Mautic lets the API read, kept per instance while this server runs.
const schemas = new Map<string, Promise<Record<string, string[]>>>();
function schema(key: string) {
  if (!schemas.has(key)) schemas.set(key, mget(key, "stats").then((d) => d.tableColumns as Record<string, string[]>).catch((e) => { schemas.delete(key); throw e; }));
  return schemas.get(key)!;
}
const json = (body: any, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  if (!process.env.QUERY_PASSWORD) return json({ error: "The Query page is switched off. Set QUERY_PASSWORD in the environment variables to turn it on.", off: true }, 503);
  const body = await req.json().catch(() => ({}));
  if (!allowed(body.password)) return json({ error: "Wrong password.", locked: true }, 401);
  const key = String(body.instance || "");
  if (!INSTANCES[key]) return json({ error: "Unknown instance." }, 400);

  try {
    const tables = await schema(key);
    if (!body.sql) return json({ tables }); // the page asks for the table list first

    const q = parse(String(body.sql));
    const known = tables[q.table];
    if (!known) return json({ error: `Table "${q.table}" is not available. Choose one from the table list.` }, 400);
    const bad = [...(q.cols || []), ...q.where.map((w) => w.col), ...q.order.map((o) => o.col)].find((c) => !known.includes(c));
    if (bad) return json({ error: `Table "${q.table}" has no column "${bad}". Its columns are: ${known.join(", ")}.` }, 400);

    const t0 = Date.now();
    const d = await mget(key, `stats/${q.table}`, toParams(q));
    const total = Number(d.total) || 0;
    if (q.count) return json({ columns: ["count"], rows: [[total]], total: 1, ms: Date.now() - t0 });
    const stats = (d.stats || []) as Record<string, any>[];
    const columns = q.cols || (stats[0] ? Object.keys(stats[0]) : known);
    return json({ columns, rows: stats.map((r) => columns.map((c) => r[c] ?? null)), total, offset: q.offset, ms: Date.now() - t0 });
  } catch (e: any) {
    return json({ error: e.message || "The query failed." }, 400);
  }
}
