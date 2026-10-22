# Mautic Live Dashboard (no database)

A live email marketing dashboard for four Mautic instances. All numbers are read from the Mautic API on request; nothing is stored in a database.

## Setup
1. In each Mautic instance: **Configuration > API Settings** and turn the API on. Then **API Credentials > New** (OAuth2, Client Credentials).
2. `npm i && cp .env.example .env.local`, then fill in the 8 credentials and `DASHBOARD_PASSWORD`.
3. `npm run validate` to check the connection, then `npm run dev`.

## Deploy
Push to GitHub, import the repo in Vercel, add the same environment variables, and deploy. Share the URL and password with viewers.

## Notes
- The first load can take 10–30 seconds. Results are cached on the server for 15 minutes (email lists for 1 hour). **Refresh** gets new data.
- Themes and the sidebar show/hide setting are saved in the browser.
- Email Reports and Landing Pages show all-time counters stored by Mautic. Overview and Forms use the selected dates.
- The Overview cards compare the selected dates with the same number of days just before them. The Top Emails, Campaign Performance and Landing Page Performance tables use all-time counters (campaign numbers add up the emails each campaign sends).
