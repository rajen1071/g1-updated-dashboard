"use client";
import { useState } from "react";
import { INSTANCES } from "@/lib/instances";
import { combine, getJson, listUrl, Range } from "@/lib/client";
import { downloadCsv } from "@/lib/format";
import Icon from "./Icon";
import { LISTS } from "./ListView";
import { Errors, Loading } from "./ui";

type Props = { ks: string[]; res: Record<string, any>; pending: string[]; range: Range; product: string; scope: string; onPrint: () => void };
const METRICS: [string, string][] = [["sent", "Sent"], ["opened", "Unique Opens"], ["clicks", "Email Clicks"], ["lp", "Landing Page Visits"], ["forms", "Form Submissions"], ["bounced", "Bounced"], ["unsub", "Unsubscribes"]];

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
    const cols = LISTS[type].cols.filter((c) => c.k !== "rate");
    const rows = all.flatMap(([k, d]) => (d.rows || []).filter((r: any) => !product || r.product === product).map((r: any) => [INSTANCES[k].short, r.id, ...cols.map((c) => r[c.k]), ...(type === "emails" ? [r.subject] : [])]));
    downloadCsv(`${type}_${type === "forms" ? tag : scope.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`, [["Instance", "ID", ...cols.map((c) => c.label), ...(type === "emails" ? ["Subject"] : [])], ...rows]);
  };

  const items: [string, string, string, string, () => void, boolean][] = [
    ["summary", "Summary by instance", "Totals for each instance for the selected dates: sent, opens, clicks, visits, forms, bounces and unsubscribes.", "overview", summary, ready],
    ["trend", "Performance trend", "The same numbers split by day (or by week for long date ranges).", "export", trend, ready],
    ["emails", "Email list", "Every published email with product, category, and all-time sends, opens and unique clicks.", "emails", () => list("emails"), true],
    ["campaigns", "Campaign list", "Every published campaign with steps, segments and forms.", "campaigns", () => list("campaigns"), true],
    ["pages", "Landing page list", "Every published landing page with all-time visits.", "pages", () => list("pages"), true],
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
