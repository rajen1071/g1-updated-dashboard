# Mautic Live Dashboard (no database)

A live email marketing dashboard for four Mautic instances. All numbers are read from the Mautic API on request; nothing is stored in a database.

## Setup
1. In each Mautic instance: **Configuration > API Settings** and turn the API on. Then **API Credentials > New** (OAuth2, Client Credentials).
2. `npm i && cp .env.example .env.local`, then fill in the 8 credentials.
3. `npm run validate` to check the connection, then `npm run dev`.

## Deploy
Push to GitHub, import the repo in Vercel, add the same environment variables, and deploy. Share the URL with viewers.

## Notes
- The first load can take 10–30 seconds. Results are saved on the server and reused by every page until someone clicks **Refresh**, which gets new data from Mautic.
- Themes and the sidebar show/hide setting are saved in the browser.
- Every page uses the selected dates: Overview, Email Reports and Nurture Emails (sends, with the opens and clicks of those sends), Campaigns (the sends of their emails), Landing Pages (visits; unique visitors stay all-time because Mautic keeps them only as a total), Forms (submissions) and Newsletter (newsletters sent in those dates, with their all-time numbers). Only the three Top tables and the Latest Newsletter card on the Overview use all-time numbers.
- Emails that match no product keyword (for example newsletters) have no product; there is no "Other" group.
- Newsletter shows emails with "Newsletter" in their name (only Altametrics sends them). Sent newsletters are shown even if they were unpublished afterwards. The Overview shows the latest one.
- The Overview cards compare the selected dates with the same number of days just before them. The Top Emails, Campaign Performance and Landing Page Performance tables use all-time counters (campaign numbers add up the emails each campaign sends).

## MongoDB cache (optional, recommended on Vercel)
Vercel runs the API in many short-lived functions, and each one starts with an empty memory cache, so pages kept loading from Mautic again.
With `MONGODB_URI` set, every API answer is also saved in MongoDB (database `MONGODB_DB`, default `atlas-g1-email-dashboard`, collection `api_cache`) and shared by all functions.
Answers never expire on their own. **Refresh** stores a "refreshed at" time, so every saved answer from before it is loaded again from Mautic once (the current page right away, other pages when they are opened). Old answers are then deleted.
Without `MONGODB_URI` (or if MongoDB is down) the dashboard works exactly as before, using memory only.
The slow building blocks (email list with A/B variants, campaign list, clicks) are saved the same way and shared by every API route, so a cold start loads them from Mautic only once. Deleted email ids are remembered for good (`keep|...` documents), so they are not looked up again.
If the server runs out of time, the browser tries the request again (up to 3 times); each try continues from the parts already saved.

## Daily data load (3 AM Pacific)
The GitHub workflow `.github/workflows/daily-data-load.yml` runs `scripts/warm.ts` once a day after 3 AM Pacific time (PST in winter, PDT in summer). GitHub often starts scheduled jobs late, so the workflow has three start times; the first run after 3 AM loads the data, and later runs see (through `/api/status`) that the data was already refreshed today and stop at once. A Refresh click after 3 AM also counts as today's load.
It does what the Refresh button does and then opens every page once for each date button (1, 2, 4 and 8 weeks), so every button shows its data at once when people open the dashboard. It takes about 5–10 minutes. Clicking **Refresh** still gets the newest data at any time.
- Setup: in GitHub, **Settings > Secrets and variables > Actions > Variables**, add `DASHBOARD_URL` with the dashboard address (for example `https://your-dashboard.vercel.app`). To test it, open the **Actions** tab, choose "Daily data load (3 AM Pacific)" and click **Run workflow**.
- `MONGODB_URI` must be set on Vercel. Without it, the loaded data stays in the memory of the one server that loaded it, and other visitors may not get it.
- "Today" in the default dates follows the Pacific calendar day, so the dates loaded at 3 AM are the dates everyone sees until Pacific midnight, in any time zone.
- Custom dates are loaded when someone chooses them (the first time takes about 30–45 seconds). The shared parts (email, page and campaign lists) are already loaded then, so this is faster.
- To run it by hand: `DASHBOARD_URL=https://your-dashboard.vercel.app npx tsx scripts/warm.ts`
