import { Collection, MongoClient } from "mongodb";

// Saved API answers, shared by every widget. Each answer is kept in this server's memory and, when MONGODB_URI is set,
// also in MongoDB, so every Vercel function instance can reuse it.
// Answers never expire on their own: they are reused until someone clicks Refresh. Refresh stores a "refreshed at" time,
// and every answer saved before it is treated as old (on every server), so it is loaded again from Mautic once.
// Without MONGODB_URI only memory is used. If MongoDB is down the dashboard still works; it just loads from Mautic.
type Doc = { _id: string; at: Date; data?: any };
const META = "meta|refreshed";
const mem = new Map<string, { at: number; data: any }>();
const g = globalThis as unknown as { _cacheCol?: Promise<Collection<Doc> | null>; _stamp?: { at: number; checked: number } };
const stamp = (g._stamp ||= { at: 0, checked: 0 });

function collection() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return Promise.resolve(null);
  // One connection per server, reused by every request (and kept across hot reloads in development).
  g._cacheCol ||= new MongoClient(uri, { serverSelectionTimeoutMS: 5000 }).connect()
    .then(async (client) => {
      const col = client.db(process.env.MONGODB_DB || "atlas-g1-email-dashboard").collection<Doc>("api_cache");
      await col.dropIndex("at_1").catch(() => {}); // an earlier version deleted answers after one day
      return col;
    })
    .catch((e) => { console.error("MongoDB connection failed:", e.message); g._cacheCol = undefined; return null; });
  return g._cacheCol;
}

// Time of the last Refresh click (ms), for the memory caches in lib/mautic.ts.
export const refreshedAt = () => stamp.at;

// Reads the last Refresh time from MongoDB, at most every 10 seconds, so a Refresh on one server reaches the others.
async function syncStamp() {
  if (Date.now() - stamp.checked < 10_000) return;
  stamp.checked = Date.now();
  try {
    const doc = await (await collection())?.findOne({ _id: META });
    if (doc) stamp.at = Math.max(stamp.at, +doc.at);
  } catch (e: any) { console.error("MongoDB read failed:", e.message); }
}

// Called for a Refresh click. One click sends several requests at once, so clicks within 30 seconds count as one.
async function markRefresh() {
  await syncStamp();
  if (Date.now() - stamp.at < 30_000) return;
  stamp.at = Date.now();
  try {
    const col = await collection();
    await col?.replaceOne({ _id: META }, { at: new Date(stamp.at) }, { upsert: true });
    await col?.deleteMany({ _id: { $not: /^(meta|keep)\|/ }, at: { $lt: new Date(stamp.at) } }); // old answers are no longer used
  } catch (e: any) { console.error("MongoDB write failed:", e.message); }
}

// A saved answer from after the last Refresh, or null. fresh=true (the Refresh button) always returns null.
export async function cacheGet(key: string, fresh = false) {
  if (fresh) { await markRefresh(); return null; }
  await syncStamp();
  const m = mem.get(key);
  if (m && m.at > stamp.at) return m.data;
  try {
    const doc = await (await collection())?.findOne({ _id: key });
    if (doc && +doc.at > stamp.at) { mem.set(key, { at: +doc.at, data: doc.data }); return doc.data; }
  } catch (e: any) { console.error("MongoDB read failed:", e.message); }
  return null;
}

export async function cacheSet(key: string, data: any) {
  mem.set(key, { at: Date.now(), data });
  try {
    await (await collection())?.replaceOne({ _id: key }, { at: new Date(), data }, { upsert: true });
  } catch (e: any) { console.error("MongoDB write failed:", e.message); }
}

// Facts that a Refresh does not change (for example deleted email ids, which Mautic never reuses). Kept until removed by hand.
const keep = new Map<string, any>();
export async function keepGet(key: string) {
  if (keep.has(key)) return keep.get(key);
  try {
    const doc = await (await collection())?.findOne({ _id: `keep|${key}` });
    if (doc) { keep.set(key, doc.data); return doc.data; }
  } catch (e: any) { console.error("MongoDB read failed:", e.message); }
  return null;
}
export async function keepSet(key: string, data: any) {
  keep.set(key, data);
  try {
    await (await collection())?.replaceOne({ _id: `keep|${key}` }, { at: new Date(), data }, { upsert: true });
  } catch (e: any) { console.error("MongoDB write failed:", e.message); }
}
