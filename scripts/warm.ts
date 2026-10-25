// Daily data load: gets new data from Mautic for every page of the dashboard (default dates: the last 2 weeks), so people
// who open the dashboard later find it ready. It does what the Refresh button does, then opens every page once.
// Run: DASHBOARD_URL=https://your-dashboard.vercel.app npx tsx scripts/warm.ts
// DAILY_AFTER_PACIFIC_HOUR=3 makes it run once a day: only after 3 AM in Los Angeles, and only if the data was not refreshed
// since then (by an earlier run or by someone clicking Refresh). GitHub often starts scheduled jobs late, so the schedule
// has several start times and whichever run comes first after 3 AM does the work.
import { KEYS, listUrl, newsletterUrl, overviewUrl, topUrl } from "../lib/client";
import { lastWeeks } from "../lib/format";

const base = (process.env.DASHBOARD_URL || "").replace(/\/+$/, "");
if (!base) {
  console.error("DASHBOARD_URL is not set. On GitHub add it under Settings > Secrets and variables > Actions > Variables,");
  console.error("with the dashboard address, for example https://your-dashboard.vercel.app");
  process.exit(1);
}

// The time it is now in Los Angeles, and today's start hour there as a moment in time.
function pacificStart(hour: number) {
  const now = new Date(), p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" })
    .formatToParts(now).map((x) => [x.type, Number(x.value)]));
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(+now / 60000) * 60000;
  return { hour: p.hour, start: Date.UTC(p.year, p.month - 1, p.day, hour) - offset };
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
  if (process.env.DAILY_AFTER_PACIFIC_HOUR) {
    const h = Number(process.env.DAILY_AFTER_PACIFIC_HOUR), { hour, start } = pacificStart(h);
    if (hour < h) { console.log(`It is ${hour}:xx in Los Angeles, before ${h} AM. Nothing to do yet.`); return; }
    const st = await fetch(`${base}/api/status`).then((r) => r.json()).catch((e) => ({ error: e.message }));
    if (st.error) { console.error(`Could not read ${base}/api/status: ${st.error}`); process.exit(1); }
    if (st.refreshedAt && Date.parse(st.refreshedAt) >= start) { console.log(`Already loaded today (last refresh ${st.refreshedAt}). Nothing to do.`); return; }
  }
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
