"use client";
import { useState } from "react";
import { INSTANCES } from "@/lib/instances";
import { combine, getJson, listUrl, newsletterUrl, Range } from "@/lib/client";
import { downloadCsv } from "@/lib/format";
import Icon from "./Icon";
import { LISTS } from "./ListView";
import { groups } from "./NurtureView";
import { Errors, Loading } from "./ui";

type Props = { ks: string[]; res: Record<string, any>; pending: string[]; range: Range; product: string; scope: string; onPrint: () => void };
const METRICS: [string, string][] = [["sent", "Sent"], ["opened", "Unique Opens"], ["clicks", "Unique Clicks"], ["lp", "Landing Page Visits"], ["forms", "Form Submissions"], ["bounced", "Bounced"], ["unsub", "Unsubscribes"]];

export default function ExportView({ ks, res, pending, range, product, scope, onPrint }: Props) {
  const [busy, setBusy] = useState("");
  const [errs, setErrs] = useState<string[]>([]);
  const { ok, kpi, series } = combine(ks.map((k) => res[k]));
  const tag = `${scope.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}_${range.from}_to_${range.to}`;
  const ready = ok.length > 0 && pending.length === 0;

  const summary = () => downloadCsv(`summary_${tag}.csv`, [
    ["Instance", ...(product ? ["Product"] : []), ...METRICS.map((m) => m[1])],
    ...ks.filter((k) => res[k]?.kpi).map((k) => [INSTANCES[k].short, ...(product ? [product] : []), ...METRICS.map(([f]) => res[k].kpi[f])]),
    ...(ks.length > 1 ? [["Total", ...METRICS.map(([f]) => kpi[f as keyof typeof kpi])]] : []),
  ]);
  const trend = () => downloadCsv(`trend_${tag}.csv`, [["Period start", ...METRICS.map((m) => m[1])], ...series.map((s: any) => [s.label, ...METRICS.map(([f]) => s[f])])]);
  const list = async (type: string) => {
    setBusy(type); setErrs([]);
    const all = await Promise.all(ks.map((k) => getJson(listUrl(type, k, range)).then((d) => [k, d] as const)));
    setBusy("");
    setErrs(all.map(([, d]) => d.error).filter(Boolean));
    const cols = LISTS[type].cols.filter((c) => c.k !== "rate" && c.k !== "change");
    const rows = all.flatMap(([k, d]) => (d.rows || []).filter((r: any) => !product || r.product === product).map((r: any) => [INSTANCES[k].short, r.id, ...cols.map((c) => r[c.k]), ...(type === "emails" ? [r.subject] : [])]));
    downloadCsv(`${type}_${tag}.csv`, [["Instance", "ID", ...cols.map((c) => c.label), ...(type === "emails" ? ["Subject"] : [])], ...rows]);
  };

  const newsletters = async () => {
    setBusy("newsletter"); setErrs([]);
    const all = await Promise.all(ks.map((k) => getJson(newsletterUrl(k)).then((d) => [k, d] as const)));
    setBusy("");
    setErrs(all.map(([, d]) => d.error).filter(Boolean));
    downloadCsv("newsletters.csv", [["Instance", "ID", "Name", "Subject", "Sent On", "Sent", "Unique Opens", "Unique Clicks", "LP Visits", "Bounced", "Unsubscribes"],
      ...all.flatMap(([k, d]) => (d.rows || []).map((r: any) => [INSTANCES[k].short, r.id, r.name, r.subject, r.date.slice(0, 10), r.sent, r.opened, r.clicks, r.lp, r.bounced, r.unsub]))]);
  };

  // Same rows as the Nurture Emails page: every variant of each nurture email that sent in the selected dates.
  const nurture = async () => {
    setBusy("nurture"); setErrs([]);
    const all = await Promise.all(ks.map((k) => getJson(listUrl("emails", k, range)).then((d) => [k, d] as const)));
    setBusy("");
    setErrs(all.map(([, d]) => d.error).filter(Boolean));
    const gs = all.flatMap(([k, d]) => groups(k, d.rows || [])).filter((g) => g.sent > 0 && g.rows.some((r) => /nurture/i.test(r.name)) && (!product || g.product === product))
      .sort((a, b) => a.inst.localeCompare(b.inst) || a.rows[0].name.localeCompare(b.rows[0].name, "en", { numeric: true }));
    const rate = (a: number, b: number) => (b ? ((a / b) * 100).toFixed(1) + "%" : "");
    downloadCsv(`nurture_${tag}.csv`, [["Instance", "Email", "Product", "Variant", "ID", "Name", "Subject", "Sent", "Unique Opens", "Open Rate", "Unique Clicks", "Click Rate", "Not Opened"],
      ...gs.flatMap((g) => g.rows.map((r) => [INSTANCES[g.inst].short, g.title, g.product, r.letter, r.id, r.name, r.subject, r.sent, r.opened, rate(r.opened, r.sent), r.clicks, rate(r.clicks, r.sent), Math.max(0, r.sent - r.opened)]))]);
  };

  const items: [string, string, string, string, () => void, boolean][] = [
    ["summary", "Summary by instance", "Totals for each instance for the selected dates: sent, opens, clicks, visits, forms, bounces and unsubscribes.", "overview", summary, ready],
    ["trend", "Performance trend", "The same numbers split by day (or by week for long date ranges).", "export", trend, ready],
    ["emails", "Email list", "Every published email with product, category, and sends, opens and unique email clicks in the selected dates.", "emails", () => list("emails"), true],
    ["nurture", "Nurture email list", "Every nurture email and its A/B variants that sent in the selected dates, with sends, unique opens, unique clicks and rates.", "nurture", nurture, true],
    ["newsletter", "Newsletter list", "Every newsletter with send date and all-time sends, opens, unique clicks, visits, bounces and unsubscribes.", "newsletter", newsletters, true],
    ["campaigns", "Campaign list", "Every published campaign with sends and unique email clicks in the selected dates, steps, segments and forms.", "campaigns", () => list("campaigns"), true],
    ["pages", "Landing page list", "Every published landing page with visits in the selected dates and all-time totals.", "pages", () => list("pages"), true],
    ["forms", "Form list", "Every published form with the number of submissions in the selected dates.", "forms", () => list("forms"), true],
  ];

  return (
    <>
      <Loading keys={pending} />
      <Errors list={[...ks.map((k) => res[k]?.error).filter(Boolean), ...errs]} />
      <div className="exports">
        {items.map(([id, t, d, ic, fn, can]) => (
          <div className="exp" key={t}>
            <span className="exp-i"><Icon name={ic} size={20} /></span>
            <div><b>{t}</b><p>{d}</p></div>
            <button className="btn primary" disabled={!can || !!busy} onClick={fn}>
              {busy === id ? <span className="spin sm" /> : <Icon name="export" size={16} />} Download CSV
            </button>
          </div>))}
        <div className="exp">
          <span className="exp-i"><Icon name="print" size={20} /></span>
          <div><b>Print or save as PDF</b><p>Opens the Overview page in your browser&apos;s print window. Choose &quot;Save as PDF&quot; to keep a copy.</p></div>
          <button className="btn" onClick={onPrint}><Icon name="print" size={16} /> Print</button>
        </div>
      </div>
      <p className="note">Files use the current filters: {scope}, {range.from} to {range.to}. Big lists can take up to 30 seconds the first time.</p>
    </>
  );
}
