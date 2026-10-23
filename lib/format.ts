export const iso = (d: Date) => d.toISOString().slice(0, 10);
// "Today" follows the Pacific calendar day (PST/PDT), the same clock as the daily 3 AM data load, so the default dates
// (and their saved data) stay the same for everyone, in any time zone, from Pacific midnight to the next Pacific midnight.
export const todayPacific = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
export const lastWeeks = (weeks: number) => { const to = todayPacific(); return { from: iso(new Date(Date.parse(to) - weeks * 7 * 864e5 + 864e5)), to }; };
export const n = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("en-US"));
export const pct = (a: number | null | undefined, b: number | null | undefined) => (a == null || !b ? "—" : ((a / b) * 100).toFixed(1) + "%");
export const day = (s: string, year = false) => (s ? new Date(s.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" }) : "—");

export function downloadCsv(name: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: any) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const url = URL.createObjectURL(new Blob(["﻿" + rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
