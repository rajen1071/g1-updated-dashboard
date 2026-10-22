"use client";
import { Fragment, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { INSTANCES } from "@/lib/instances";
import { THEMES } from "@/lib/themes";
import { combine, GROUP_NAMES, GROUPS, KEYS, productRows } from "@/lib/client";
import { n, pct } from "@/lib/format";
import Icon from "./Icon";
import { tip } from "./Overview";
import { Card, Errors, Loading, Sk } from "./ui";

type Props = { res: Record<string, any>; pending: string[]; theme: string; onOpen: (k: string) => void; onBack: () => void };

// Table cells for one set of totals, in the same order as HEAD.
function cells(q: any) {
  const del = q.sent == null || q.bounced == null ? null : Math.max(0, q.sent - q.bounced);
  return [n(q.sent), n(del), n(q.opened), pct(q.opened, q.sent), n(q.clicks), pct(q.clicks, q.sent), n(q.lp), n(q.forms), n(q.bounced), pct(q.bounced, q.sent), n(q.unsub)];
}
const HEAD = ["Sent", "Delivered", "Opens", "Open Rate", "Email Clicks", "Click Rate", "LP Visits", "Forms", "Bounced", "Bounce Rate", "Unsubs"];

export default function AllInstances({ res, pending, theme, onOpen, onBack }: Props) {
  const c = THEMES[theme].v;
  const [open, setOpen] = useState<string[]>([]);
  const { kpi } = combine(KEYS.map((k) => res[k]));
  const errs = KEYS.map((k) => res[k]?.error).filter(Boolean);
  const chart = KEYS.filter((k) => res[k]?.kpi).map((k) => ({ name: INSTANCES[k].short, Sent: res[k].kpi.sent, Opened: res[k].kpi.opened, "Email Clicks": res[k].kpi.clicks }));
  const best = (f: (q: any) => number) => KEYS.filter((k) => res[k]?.kpi?.sent).sort((a, b) => f(res[b].kpi) - f(res[a].kpi))[0];
  const topOpen = best((q) => q.opened / q.sent), topClick = best((q) => q.clicks / q.sent), topSent = best((q) => q.sent);
  const toggle = (k: string) => setOpen(open.includes(k) ? open.filter((x) => x !== k) : [...open, k]);

  return (
    <>
      <button className="back" onClick={onBack}><Icon name="back" size={16} /> Back to Overview</button>
      <Loading keys={pending} />
      <Errors list={errs} />

      <div className="highlights">
        {([["Most emails sent", topSent, (q: any) => `${n(q.sent)} sent`], ["Best open rate", topOpen, (q: any) => `${pct(q.opened, q.sent)} opened`], ["Best click rate", topClick, (q: any) => `${pct(q.clicks, q.sent)} clicked`]] as [string, string, (q: any) => string][]).map(([l, k, f]) => (
          <div className="hl" key={l}><small>{l}</small>{k ? <><b>{INSTANCES[k].short}</b><span>{f(res[k].kpi)}</span></> : <><Sk w="60%" h={22} /><Sk w="40%" h={12} /></>}</div>))}
      </div>

      <Card title="Instance Comparison" sub="Sent, opened and clicked emails for each instance">
        {chart.length === 0 ? <Sk w="100%" h={260} /> :
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chart} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={c.border} />
              <XAxis dataKey="name" fontSize={12} tick={{ fill: c.muted }} axisLine={{ stroke: c.border }} tickLine={false} />
              <YAxis fontSize={11} tick={{ fill: c.muted }} axisLine={false} tickLine={false} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : v)} />
              <Tooltip {...tip} cursor={{ fill: c.surface2 }} formatter={(v: number) => n(v)} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: c.muted }} />
              <Bar isAnimationActive={false} dataKey="Sent" fill={c.c1} radius={[4, 4, 0, 0]} maxBarSize={36} />
              <Bar isAnimationActive={false} dataKey="Opened" fill={c.c2} radius={[4, 4, 0, 0]} maxBarSize={36} />
              <Bar isAnimationActive={false} dataKey="Email Clicks" fill={c.c3} radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>}
      </Card>

      <Card title="All Instances" sub="Click a row to see its products. Product rows show sent and opens only." className="flush">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Instance</th>{HEAD.map((h) => <th key={h} className="num">{h}</th>)}<th /></tr></thead>
            <tbody>
              {GROUP_NAMES.map((g) => (
              <Fragment key={g}>
              <tr className="row-grp"><td colSpan={HEAD.length + 2}>{g}</td></tr>
              {GROUPS[g].map((k) => {
                const d = res[k], q = d?.kpi, ps = productRows(k, d), isOpen = open.includes(k);
                return (
                  <Fragment key={k}>
                    <tr className="row-main" onClick={() => q && toggle(k)}>
                      <td><div className="cell-name"><span className={`chev ${isOpen ? "on" : ""}`}><Icon name="right" size={14} /></span><div><b>{INSTANCES[k].short}</b><small>{INSTANCES[k].label}</small></div></div></td>
                      {d?.error ? <td colSpan={HEAD.length} className="bad-t">{d.error}</td> : !q ? HEAD.map((h) => <td key={h} className="num"><Sk w="70%" h={12} /></td>) : cells(q).map((v, i) => <td key={i} className="num">{v}</td>)}
                      <td><button className="link" onClick={(e) => { e.stopPropagation(); onOpen(k); }}>Open</button></td>
                    </tr>
                    {isOpen && ps.map((p: any) => (
                      <tr className="row-sub" key={p.name}>
                        <td><span className="sub-name">{p.name}</span></td>
                        <td className="num">{n(p.sent)}</td><td className="num">—</td><td className="num">{n(p.opened)}</td><td className="num">{pct(p.opened, p.sent)}</td>
                        {HEAD.slice(4).map((h) => <td key={h} className="num">—</td>)}<td />
                      </tr>))}
                    {isOpen && ps.length === 0 && <tr className="row-sub"><td colSpan={HEAD.length + 2}><span className="sub-name">No product data for these dates.</span></td></tr>}
                  </Fragment>);
              })}
              {GROUPS[g].length > 1 && <tr className="row-sum"><td><b>{g} total</b></td>{cells(combine(GROUPS[g].map((k) => res[k])).kpi).map((v, i) => <td key={i} className="num">{v}</td>)}<td /></tr>}
              </Fragment>))}
            </tbody>
            <tfoot><tr><td><b>Total</b></td>{cells(kpi).map((v, i) => <td key={i} className="num">{v}</td>)}<td /></tr></tfoot>
          </table>
        </div>
      </Card>
    </>
  );
}
