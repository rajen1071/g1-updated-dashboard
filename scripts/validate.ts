import { INSTANCES } from "../lib/instances";
import { count, mget } from "../lib/mautic";
(async () => {
  for (const k of Object.keys(INSTANCES)) {
    console.log(`\n=== ${INSTANCES[k].label} ===`);
    try {
      const t = async (n: string, tb: string, w: any[]) => console.log(`${n}: ${await count(k, tb, w).catch((e) => "ERR " + e.message)}`);
      await t("email_stats total", "email_stats", []);
      await t("email_stats opened", "email_stats", [{ col: "is_read", expr: "eq", val: 1 }]);
      await t("page_hits from email", "page_hits", [{ col: "source", expr: "eq", val: "email" }]);
      await t("page_hits landing pages (page_id>0)", "page_hits", [{ col: "page_id", expr: "gt", val: 0 }]);
      await t("form_submissions", "form_submissions", []);
      await t("DNC bounced", "lead_donotcontact", [{ col: "reason", expr: "eq", val: 2 }]);
      await t("DNC unsub", "lead_donotcontact", [{ col: "reason", expr: "eq", val: 1 }]);
      const list: any[] = Object.values((await mget(k, "emails", { limit: 3 })).emails || {});
      const ids = list.map((e) => e.id).join(",");
      await t(`'in' filter test (email_id in ${ids})`, "email_stats", [{ col: "email_id", expr: "in", val: ids }]);
    } catch (e: any) { console.log("ERROR:", e.message); }
  }
})();
