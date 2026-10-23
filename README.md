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
- Email Reports and Landing Pages show all-time counters stored by Mautic. Overview and Forms use the selected dates.
- Newsletter shows every email with "Newsletter" in its name (only Altametrics sends them), using all-time counters. Sent newsletters are shown even if they were unpublished afterwards. The Overview shows the latest one.
- The Overview cards compare the selected dates with the same number of days just before them. The Top Emails, Campaign Performance and Landing Page Performance tables use all-time counters (campaign numbers add up the emails each campaign sends).

## MongoDB cache (optional, recommended on Vercel)
Vercel runs the API in many short-lived functions, and each one starts with an empty memory cache, so pages kept loading from Mautic again.
With `MONGODB_URI` set, every API answer is also saved in MongoDB (database `MONGODB_DB`, default `atlas-g1-email-dashboard`, collection `api_cache`) and shared by all functions.
Answers never expire on their own. **Refresh** stores a "refreshed at" time, so every saved answer from before it is loaded again from Mautic once (the current page right away, other pages when they are opened). Old answers are then deleted.
Without `MONGODB_URI` (or if MongoDB is down) the dashboard works exactly as before, using memory only.
