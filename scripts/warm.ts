// Daily data load: gets new data from Mautic for every page of the dashboard (default dates: the last 2 weeks), so people
// who open the dashboard later find it ready. It does what the Refresh button does, then opens every page once.
// Run: DASHBOARD_URL=https://your-dashboard.vercel.app npx tsx scripts/warm.ts
// ONLY_AT_PACIFIC_HOUR=3 makes it stop unless it is 3 AM in Los Angeles (the schedule runs at 3 AM PST and 3 AM PDT).
import { KEYS, listUrl, newsletterUrl, overviewUrl, topUrl } from "../lib/client";
import { lastWeeks } from "../lib/format";

const base = (process.env.DASHBOARD_URL || "").replace(/\/+$/, "");
if (!base) { console.error("Set DASHBOARD_URL to the dashboard address, for example https://your-dashboard.vercel.app"); process.exit(1); }

const hour = Number(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hourCycle: "h23" }));
if (process.env.ONLY_AT_PACIFIC_HOUR && hour !== Number(process.env.ONLY_AT_PACIFIC_HOUR)) {
  console.log(`It is ${hour}:00 in Los Angeles, not ${process.env.ONLY_AT_PACIFIC_HOUR}:00. Nothing to do.`);
  process.exit(0);
}

const range = lastWeeks(2);
// Each request is tried up to 4 times: a try that runs out of time still saves the parts it finished, so the next try is shorter.
// Only the first try asks for a refresh; a second refresh would throw away what the first try saved.
async function get(path: string) {
  for (let a = 1; a <= 4; a++) {
    const s = Date.now();
    const d = await fetch(base + (a === 1 ? path : path.replace("&refresh=1", ""))).then((r) => r.text()).then((t) => { try { return JSON.parse(t); } catch { return { error: "no JSON answer (the server ran out of time)" }; } })
      .catch((e) => ({ error: e.message }));
    const took = `${Math.round((Date.now() - s) / 1000)}s`;
    if (!d.error) { console.log(`  ok    ${path} (${took}${d.cached ? ", saved" : ""})`); return true; }
    console.log(`  retry ${path} (try ${a}, ${took}): ${d.error}`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  return false;
}

(async () => {
  console.log(`Loading ${base} for ${range.from} to ${range.to}`);
  const steps: [string, (k: string) => string][] = [
    // First step asks for new data from Mautic (like the Refresh button); every later answer is then built again too.
    ["Overview (refresh)", (k) => overviewUrl(k, range) + "&refresh=1"],
    ["Top tables", topUrl],
    ["Newsletter", newsletterUrl],
    ["Forms", (k) => listUrl("forms", k, range)],
    ["Email Reports and Nurture Emails", (k) => listUrl("emails", k, range)],
    ["Landing Pages", (k) => listUrl("pages", k, range)],
    ["Campaigns", (k) => listUrl("campaigns", k, range)],
  ];
  let failed = 0;
  for (const [name, url] of steps) {
    console.log(name);
    failed += (await Promise.all(KEYS.map((k) => get(url(k))))).filter((ok) => !ok).length;
  }
  console.log(failed ? `Done, but ${failed} request(s) failed.` : "Done. All pages are loaded.");
  process.exit(failed ? 1 : 0);
})();
