"use client";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { INSTANCES } from "@/lib/instances";
import { THEMES } from "@/lib/themes";
import { combine, listUrl, Range } from "@/lib/client";
import { useData } from "@/lib/useData";
import { day, n, pct } from "@/lib/format";
import Icon from "./Icon";
import { Change, tip } from "./Overview";
import { nlTitle, useNewsletters } from "./NewsletterView";
import { Card, Errors, Sk } from "./ui";

type Props = { ks: string[]; range: Range; product: string; nonce: number; onGo: (view: string) => void };
const TOP = 5;

// Overview: the latest newsletter and the forms, each with a link to its full page.
export default function OverviewSections({ ks, range, product, nonce, onGo }: Props) {
  return (
    <div className="grid-1-1">
      <LatestNewsletter ks={ks} nonce={nonce} onGo={onGo} />
      <FormsSummary ks={ks} range={range} product={product} nonce={nonce} onGo={onGo} />
    </div>
  );
}

const details = (onGo: (v: string) => void, view: string) => <button className="link" onClick={() => onGo(view)}>View Details <Icon name="right" size={14} /></button>;

function LatestNewsletter({ ks, nonce, onGo }: { ks: string[]; nonce: number; onGo: (view: string) => void }) {
  const { rows, pending, errs } = useNewsletters(ks, nonce);
  const first = pending.length > 0 && !rows.length;
  const [r, before] = rows;
  const cells: [string, number | null, string][] = r ? [
    ["Sent", r.sent, ""],
    ["Delivered", Math.max(0, r.sent - r.bounced), pct(r.sent - r.bounced, r.sent)],
    ["Unique Opens", r.opened, `${pct(r.opened, r.sent)} open rate`],
    ["Unique Clicks", r.clicks, `${pct(r.clicks, r.sent)} click rate`],
    ["Click-to-Open", null, pct(r.clicks, r.opened)],
    ["LP Visits", r.lp, pct(r.lp, r.sent)],
    ["Bounced", r.bounced, pct(r.bounced, r.sent)],
    ["Unsubscribes", r.unsub, pct(r.unsub, r.sent)],
  ] : [];
  const rateChange = (f: (x: any) => number, label: string) => {
    if (!r || !before) return null;
    const d = (f(r) - f(before)) * 100;
    return <span className={`chg ${Math.abs(d) < 0.05 ? "flat" : d > 0 ? "good" : "bad"}`}>{label} {d >= 0 ? "↑" : "↓"} {Math.abs(d).toFixed(1)} pts</span>;
  };

  return (
    <Card title="Newsletter · Latest Stats" sub={r ? `${nlTitle(r.name)} · sent ${day(r.date, true)}${ks.length > 1 ? ` · ${INSTANCES[r.inst].short}` : ""}` : "The most recent newsletter (all-time numbers)"} action={details(onGo, "newsletter")}>
      <Errors list={errs} />
      {first ? <div className="mini four">{Array.from({ length: 8 }, (_, i) => <div key={i}><Sk w="60%" h={12} /><Sk w="80%" h={18} /></div>)}</div> :
        !r ? <p className="empty">No newsletters for this selection. Only Altametrics sends newsletters.</p> : <>
          <p className="nl-subj" title={r.subject}>{r.subject}</p>
          <div className="mini four">{cells.map(([l, v, s]) => (
            <div key={l}><small>{l}</small><b>{v == null ? s : n(v)}</b>{v != null && s && <span>{s}</span>}</div>))}
          </div>
          {before && <div className="nl-vs">
            <span>Compared with {nlTitle(before.name)}:</span>
            {rateChange((x) => (x.sent ? x.opened / x.sent : 0), "Open rate")}
            {rateChange((x) => (x.sent ? x.clicks / x.sent : 0), "Click rate")}
          </div>}
          {rows.length > 1 && <ul className="nl-prev">
            {rows.slice(1, 4).map((x) => <li key={x.inst + x.id}><b>{nlTitle(x.name)}</b><span>{n(x.sent)} sent</span><span>{pct(x.opened, x.sent)} opened</span><span>{pct(x.clicks, x.sent)} clicked</span></li>)}
          </ul>}
        </>}
    </Card>
  );
}

function FormsSummary({ ks, range, product, nonce, onGo }: Props) {
  const { res } = useData(ks, (k) => listUrl("forms", k, range), nonce);

  const loading = ks.some((k) => !res[k]);
  const rows: any[] = ks.flatMap((k) => (res[k]?.rows || []).map((r: any) => ({ ...r, inst: k }))).filter((r) => !product || r.product === product);
  const first = loading && !rows.length;
  const sum = (f: string) => rows.reduce((a, r) => a + (r[f] || 0), 0);
  const subs = sum("submissions"), prev = sum("prev");
  const top = rows.filter((r) => r.submissions > 0).sort((a, b) => b.submissions - a.submissions).slice(0, TOP);
  const max = Math.max(1, ...top.map((r) => r.submissions));

  return (
    <Card title="Forms" sub="Form submissions in the selected dates" action={details(onGo, "forms")}>
      <Errors list={ks.map((k) => res[k]?.error).filter(Boolean)} />
      <div className="mini four">{([["Submissions", subs, <Change key="c" cur={subs} prev={prev} />], ["Previous period", prev], ["All time", sum("total")], ["Active forms", rows.filter((r) => r.submissions > 0).length, <span key="s">of {n(rows.length)} forms</span>]] as [string, number, React.ReactNode][]).map(([l, v, extra]) => (
        <div key={l}><small>{l}</small>{first ? <Sk w="70%" h={18} /> : <><b>{n(v)}</b>{extra}</>}</div>))}
      </div>
      <span className="tg-h">Top forms</span>
      {first ? <Sk w="100%" h={120} /> : !top.length ? <p className="empty">No form submissions in these dates.</p> :
        <div className="prods">{top.map((r) => (
          <div className="prod" key={r.inst + r.id}>
            <div className="prod-t"><b className="nm" title={r.name}>{r.name}</b>{ks.length > 1 && <small>{INSTANCES[r.inst].short}</small>}<span>{n(r.submissions)}</span></div>
            <div className="f-bar"><i style={{ width: `${(r.submissions / max) * 100}%`, background: "var(--c5)" }} /></div>
          </div>))}
        </div>}
    </Card>
  );
}

// Forms page: submissions per day (or per few days for long date ranges), from the overview answers.
export function FormsTrend({ ks, res, pending, theme }: { ks: string[]; res: Record<string, any>; pending: string[]; theme: string }) {
  const c = THEMES[theme].v;
  const { ok, kpi, prev, series } = combine(ks.map((k) => res[k]));
  const first = ok.length === 0 && pending.length > 0;
  return (
    <Card title="Form Submissions Trend" sub={first ? "Submissions in the selected dates" : <>{n(kpi.forms)} submissions in the selected dates <Change cur={kpi.forms} prev={prev.forms} /></>}>
      {first ? <Sk w="100%" h={200} /> : !series.length ? <p className="empty">No data for these dates.</p> :
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={series} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={c.border} />
            <XAxis dataKey="label" tickFormatter={(v) => day(v)} fontSize={11} tick={{ fill: c.muted }} axisLine={{ stroke: c.border }} tickLine={false} />
            <YAxis fontSize={11} tick={{ fill: c.muted }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip {...tip} labelFormatter={(v) => day(String(v), true)} formatter={(v: number) => n(v)} />
            <Area isAnimationActive={false} type="monotone" dataKey="forms" name="Form Submissions" stroke={c.c5} strokeWidth={2} fill={c.c5} fillOpacity={0.12} dot={{ r: 2.5, fill: c.c5, strokeWidth: 0 }} />
          </AreaChart>
        </ResponsiveContainer>}
    </Card>
  );
}
