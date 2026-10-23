"use client";
import { Fragment, useState } from "react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { INSTANCES } from "@/lib/instances";
import { THEMES } from "@/lib/themes";
import { combine, GROUP_NAMES, GROUPS, Range } from "@/lib/client";
import { day, n, pct } from "@/lib/format";
import Icon from "./Icon";
import OverviewSections from "./OverviewSections";
import TopTables from "./TopTables";
import { Card, Errors, Loading, Sk } from "./ui";

type Props = { ks: string[]; res: Record<string, any>; pending: string[]; product: string; range: Range; theme: string; nonce: number; onOpen: (k: string) => void; onGo: (view: string) => void };
export const tip = { contentStyle: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, color: "var(--text)", boxShadow: "var(--shadow)" }, labelStyle: { fontWeight: 600, marginBottom: 4 } };

// Change against the previous period of the same length. upIsGood=false for bounces and unsubscribes.
export function Change({ cur, prev, upIsGood = true }: { cur: number | null; prev: number | null; upIsGood?: boolean }) {
  if (cur == null || prev == null) return null;
  if (!prev) return <em className="chg flat" title="No data in the previous period">{cur ? "New" : "No change"}</em>;
  const d = ((cur - prev) / prev) * 100;
  return <em className={`chg ${Math.abs(d) < 0.05 ? "flat" : d > 0 === upIsGood ? "good" : "bad"}`} title={`Previous period: ${n(prev)}`}>{d >= 0 ? "↑" : "↓"} {Math.abs(d).toFixed(1)}%<span> vs prev. period</span></em>;
}

export default function Overview({ ks, res, pending, product, range, theme, nonce, onOpen, onGo }: Props) {
  const c = THEMES[theme].v;
  const { ok, kpi: k, prev, series, delivered } = combine(ks.map((x) => res[x]));
  const errs = ks.map((x) => res[x]?.error).filter(Boolean);
  const first = ok.length === 0 && pending.length > 0;
  const [hidden, setHidden] = useState<string[]>([]);
  const step = series.length > 1 ? Math.round((+new Date(series[1].label) - +new Date(series[0].label)) / 864e5) : 1;
  const prevDelivered = prev.sent == null || prev.bounced == null ? null : Math.max(0, prev.sent - prev.bounced);

  const cards: [string, number | null, number | null, string, string, string, boolean][] = [
    ["Total Sent", k.sent, prev.sent, "Emails sent in this period", "emails", c.c1, true],
    ["Delivered", delivered, prevDelivered, `${pct(delivered, k.sent)} of sent`, "send", c.good, true],
    ["Unique Opens", k.opened, prev.opened, `${pct(k.opened, k.sent)} open rate`, "eye", c.c2, true],
    ["Email Clicks", k.clicks, prev.clicks, `${pct(k.clicks, k.sent)} click rate`, "click", c.c3, true],
    ["Landing Page Visits", k.lp, prev.lp, k.lp == null ? "Not available for one product" : `${pct(k.lp, k.sent)} of sent`, "pages", c.c4, true],
    ["Form Submissions", k.forms, prev.forms, k.forms == null ? "Not available for one product" : `${pct(k.forms, k.sent)} of sent`, "forms", c.c5, true],
    ["Bounced", k.bounced, prev.bounced, `${pct(k.bounced, k.sent)} bounce rate`, "bounce", c.bad, false],
    ["Unsubscribes", k.unsub, prev.unsub, `${pct(k.unsub, k.sent)} unsubscribe rate`, "unsub", c.c5, false],
  ];
  const lines: [string, string, string][] = [["sent", "Sent", c.c1], ["opened", "Opened", c.c2], ["clicks", "Email Clicks", c.c3], ...(k.lp == null ? [] : [["lp", "Landing Page Visits", c.c4] as [string, string, string]]), ...(k.forms == null ? [] : [["forms", "Form Submissions", c.c5] as [string, string, string]])];
  const notOpen = k.sent == null || k.opened == null || k.bounced == null ? 0 : Math.max(0, k.sent - k.bounced - k.opened);
  const donut = [{ name: "Opened", v: k.opened || 0, c: c.c2 }, { name: "Not opened", v: notOpen, c: c.border }, { name: "Bounced", v: k.bounced || 0, c: c.bad }];
  const extra: [string, number | null][] = [["Delivered", delivered], ["Clicked", k.clicks], ["Unsubscribes", k.unsub]];
  const funnel: [string, number | null, string, string][] = [
    ["Email Clicks", k.clicks, `${pct(k.clicks, k.sent)} (of sent)`, c.c3],
    ["Landing Page Visits", k.lp, `${pct(k.lp, k.clicks)} (of email clicks)`, c.c4],
    ["Form Submissions", k.forms, `${pct(k.forms, k.lp)} (of page visits)`, c.good],
  ];
  // Instance cards are shown in two brand sections: Altametrics and Plum.
  const groups = GROUP_NAMES.map((g) => ({ g, keys: GROUPS[g].filter((x) => ks.includes(x)) })).filter((x) => x.keys.length);

  return (
    <>
      <Loading keys={pending} />
      <Errors list={errs} />

      <div className="kpis eight">{cards.map(([l, v, pv, s, ic, col, up]) => (
        <div className="kpi" key={l} style={{ "--accent": col } as React.CSSProperties}>
          <div className="kpi-top"><span className="kpi-i"><Icon name={ic} size={18} /></span><small>{l}</small></div>
          <div>
            {first ? <Sk w="70%" h={24} /> : <b>{n(v)}</b>}
            <i>{first ? <Sk w="50%" h={12} /> : s}</i>
            {!first && <Change cur={v} prev={pv} upIsGood={up} />}
          </div>
        </div>))}
      </div>

      <div className="row-charts">
        <Card title="Email Performance Trend" sub="Click a name below the chart to hide or show that line" className="trend">
          {first ? <Sk w="100%" h={240} /> : series.length === 0 ? <p className="empty">No data for these dates.</p> : <>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={series} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <defs>{lines.map(([key, , col]) => <linearGradient key={key} id={`g-${key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={col} stopOpacity={0.22} /><stop offset="100%" stopColor={col} stopOpacity={0} /></linearGradient>)}</defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={c.border} />
                <XAxis dataKey="label" tickFormatter={(v) => day(v)} fontSize={11} tick={{ fill: c.muted }} axisLine={{ stroke: c.border }} tickLine={false} />
                <YAxis fontSize={11} tick={{ fill: c.muted }} axisLine={false} tickLine={false} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : v)} />
                <Tooltip {...tip} labelFormatter={(v) => (step > 1 ? `${step} days from ${day(String(v), true)}` : day(String(v), true))} formatter={(v: number) => n(v)} />
                {lines.filter(([key]) => !hidden.includes(key)).map(([key, name, col]) => <Area key={key} isAnimationActive={false} type="monotone" dataKey={key} name={name} stroke={col} strokeWidth={2} fill={`url(#g-${key})`} dot={{ r: 2.5, fill: col, strokeWidth: 0 }} activeDot={{ r: 4 }} />)}
              </AreaChart>
            </ResponsiveContainer>
            <div className="legend">{lines.map(([key, name, col]) => (
              <button key={key} className={hidden.includes(key) ? "off" : ""} onClick={() => setHidden(hidden.includes(key) ? hidden.filter((h) => h !== key) : [...hidden, key])}><i style={{ background: col }} />{name}</button>))}
            </div></>}
        </Card>

        <Card title="Conversion Funnel" sub="From email click to form submitted">
          <div className="hfunnel">{funnel.map(([l, v, rate, col], i) => (
            <Fragment key={l}>
              {i > 0 && <span className="hf-arrow"><Icon name="right" size={16} /></span>}
              <div className="hf-step">
                <div className="hf-box" style={{ "--accent": col } as React.CSSProperties}><b>{first ? "…" : n(v)}</b><small>{l}</small></div>
                <span className="hf-rate">{v == null ? "Not available for one product" : first ? "" : rate}</span>
              </div>
            </Fragment>))}
          </div>
          <p className="note">From {first ? "…" : n(k.sent)} emails sent. These are event totals, not the same contacts followed step by step. Landing page visits include visits that did not come from an email.</p>
        </Card>

        <Card title="Email Status Distribution" sub="What happened to the emails sent">
          {first ? <Sk w="100%" h={240} /> : <>
            <div className="donut">
              <ResponsiveContainer width="100%" height={170}>
                <PieChart><Pie data={donut} dataKey="v" isAnimationActive={false} innerRadius={56} outerRadius={78} paddingAngle={1.5} stroke="none">{donut.map((d) => <Cell key={d.name} fill={d.c} />)}</Pie><Tooltip {...tip} formatter={(v: number) => n(v)} /></PieChart>
              </ResponsiveContainer>
              <div className="donut-c"><b>{n(k.sent)}</b><small>Total Emails</small></div>
            </div>
            <ul className="keys tight">
              {donut.map((d) => <li key={d.name}><i style={{ background: d.c }} />{d.name}<b>{n(d.v)}</b><small>{pct(d.v, k.sent)}</small></li>)}
              {extra.map(([l, v]) => <li key={l} className="x"><i />{l}<b>{n(v)}</b><small>{pct(v, k.sent)}</small></li>)}
            </ul></>}
        </Card>
      </div>

      {ks.length > 1 && <div className="inst-groups">{groups.map(({ g, keys }) => (
        <section className="ig" key={g} style={{ flexGrow: keys.length, "--n": keys.length } as React.CSSProperties}>
          <h4 className="ig-h">{g}</h4>
          <div className="insts">{keys.map((x) => {
        const d = res[x], q = d?.kpi;
        const top: [string, number | null, string][] = q ? [["Sent", q.sent, ""], ["Opens", q.opened, pct(q.opened, q.sent)], ["Email Clicks", q.clicks, pct(q.clicks, q.sent)]] : [];
        const bottom: [string, number | null, string][] = q ? [["LP Visits", q.lp, pct(q.lp, q.sent)], ["Form Subs", q.forms, pct(q.forms, q.sent)], ["Bounced", q.bounced, pct(q.bounced, q.sent)], ["Unsubs", q.unsub, pct(q.unsub, q.sent)]] : [];
        const cell = ([l, v, r]: [string, number | null, string]) => <div key={l} title={l === "LP Visits" ? "Landing Page Visits" : l === "Form Subs" ? "Form Submissions" : undefined}><small>{l}</small><b>{n(v)}</b>{r && <span>{r}</span>}</div>;
        return (
          <div className="inst" key={x}>
            <div className="inst-h">
              <div className="inst-t">
                {INSTANCES[x].icon && <span className="inst-logo"><img src={INSTANCES[x].icon} alt="" /></span>}
                <div><b title={INSTANCES[x].label}>{INSTANCES[x].label}</b><small title={Object.keys(INSTANCES[x].products).join(", ")}>{Object.keys(INSTANCES[x].products).join(", ")}</small></div>
              </div>
              <button className="link" onClick={() => onOpen(x)}>View Details <Icon name="right" size={14} /></button>
            </div>
            {d?.error ? <div className="err small">{d.error}</div> : !q ? <div className="mini">{Array.from({ length: 6 }, (_, i) => <div key={i}><Sk w="60%" h={12} /><Sk w="80%" h={18} /></div>)}</div> : <>
              <div className="mini">{top.map(cell)}</div>
              <div className="mini four">{bottom.map(cell)}</div></>}
          </div>);
          })}</div>
        </section>))}
      </div>}

      <OverviewSections ks={ks} range={range} nonce={nonce} onGo={onGo} />

      <TopTables ks={ks} product={product} nonce={nonce} onGo={onGo} />
    </>
  );
}
