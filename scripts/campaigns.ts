// Lists every campaign per instance (id, published, dates, name) and marks the ones the Send Monitor uses.
import { INSTANCES } from "../lib/instances";
import { mget } from "../lib/mautic";
import { SCHEDULE } from "../lib/sendMonitor";
(async () => {
  for (const key of Object.keys(INSTANCES)) {
    const used = new Set(SCHEDULE.filter((p) => p.instance === key).flatMap((p) => p.campaigns));
    console.log(`\n=== ${INSTANCES[key].label} ===`);
    try {
      const d = await mget(key, "campaigns", { limit: 500, minimal: 1, orderBy: "id", orderByDir: "asc" });
      for (const c of Object.values(d.campaigns || {}) as any[])
        console.log(`${used.has(Number(c.id)) ? "*" : " "} ${String(c.id).padStart(4)}  ${c.isPublished ? "ON " : "OFF"}  added ${String(c.dateAdded).slice(0, 10)}  modified ${String(c.dateModified || "").slice(0, 10)}  ${c.name}`);
    } catch (e: any) { console.log("  error:", e.message); }
  }
})();
