"use client";
import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { INSTANCES } from "@/lib/instances";
import { THEMES } from "@/lib/themes";
import { getJson, newsletterUrl } from "@/lib/client";
import { day, n, pct } from "@/lib/format";
import Icon from "./Icon";
import { tip } from "./Overview";
import { Card, Errors, Loading, Sk } from "./ui";

// "10000 | Newsletter Email | Labor Laws | 2026.10 Newsletter" -> "2026.10 Newsletter"
export const nlTitle = (name: string) => name.split("|").pop()!.trim() || name;
const rate = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

// Newsletters of the selected instances, newest first (all-time numbers from Mautic).
export function useNewsletters(ks: string[], nonce: number) {
  const [res, setRes] = useState<Record<string, any>>({});
  const [pending, setPending] = useState<string[]>([]);
  const req = useRef(0), seen = useRef(nonce);
  useEffect(() => {
    const id = ++req.current, fresh = seen.current !== nonce;
    seen.current = nonce;
    setRes({}); setPending(ks);
    ks.forEach((k) => getJson(newsletterUrl(k), fresh).then((d) => {
      if (id !== req.current) return;
      setRes((p) => ({ ...p, [k]: d })); setPending((p) => p.filter((x) => x !== k));
    }));
  }, [ks.join(), nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows: any[] = ks.flatMap((k) => (res[k]?.rows || []).map((r: any) => ({ ...r, inst: k }))).sort((a, b) => b.date.localeCompare(a.date));
  return { rows, pending, errs: ks.map((k) => res[k]?.error).filter(Boolean) as string[] };
}

type Props = { ks: string[]; theme: string; nonce: number; onBack: () => void };

export default function NewsletterView({ ks, theme, nonce, onBack }: Props) {
  const c = THEMES[theme].v;
  const { rows, pending, errs } = useNewsletters(ks, nonce);
  const first = pending.length > 0 && !rows.length;
  const sum = (f: string) => rows.reduce((a, r) => a + r[f], 0);
  const sent = sum("sent"), opened = sum("opened"), clicks = sum("clicks");
  const chart = [...rows].reverse().map((r) => ({ name: nlTitle(r.name).replace(/ newsletter$/i, ""), Sent: r.sent, Opened: r.opened, "Unique Clicks": r.clicks,
    "Open Rate": rate(r.opened, r.sent), "Click Rate": rate(r.clicks, r.sent), "Click-to-Open": rate(r.clicks, r.opened) }));
  const multi = new Set(rows.map((r) => r.inst)).size > 1;
  const axis = { fontSize: 11, tick: { fill: c.muted }, tickLine: false };
  const head = ["Newsletter", ...(multi ? ["Instance"] : []), "Sent On", "Sent", "Delivered", "Opens", "Open Rate", "Unique Clicks", "Click Rate", "Click-to-Open", "LP Visits", "Bounced", "Unsubs", "Unsub Rate"];

  return (
    <>
      <button className="back" onClick={onBack}><Icon name="back" size={16} /> Back to Overview</button>
      <Loading keys={pending} />
      <Errors list={errs} />
      <div className="kpis five">{([["Newsletters", n(rows.length)], ["Total sent", n(sent)], ["Average open rate", pct(opened, sent)], ["Average click rate", pct(clicks, sent)], ["Unsubscribes", n(sum("unsub"))]] as [string, string][]).map(([l, v]) => (
        <div className="kpi" key={l}><small>{l}</small>{first ? <Sk w="60%" h={26} /> : <b>{v}</b>}</div>))}
      </div>

      {!first && !rows.length ? <div className="card empty">No newsletters found{ks.length === 1 ? ` in ${INSTANCES[ks[0]].short}` : ""}. Newsletters are emails with &quot;Newsletter&quot; in their name.</div> : <>
        <div className="grid-1-1">
          <Card title="Sent, Opened and Clicked" sub="Each newsletter, oldest to newest">
            {first ? <Sk w="100%" h={240} /> :
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chart} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={c.border} />
                  <XAxis dataKey="name" {...axis} axisLine={{ stroke: c.border }} />
                  <YAxis {...axis} axisLine={false} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : v)} />
                  <Tooltip {...tip} cursor={{ fill: c.surface2 }} formatter={(v: number) => n(v)} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: c.muted }} />
                  <Bar isAnimationActive={false} dataKey="Sent" fill={c.c1} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar isAnimationActive={false} dataKey="Opened" fill={c.c2} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar isAnimationActive={false} dataKey="Unique Clicks" fill={c.c3} radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>}
          </Card>
          <Card title="Open and Click Rates" sub="Percent of sent (click-to-open is percent of opens)">
            {first ? <Sk w="100%" h={240} /> :
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chart} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={c.border} />
                  <XAxis dataKey="name" {...axis} axisLine={{ stroke: c.border }} />
                  <YAxis {...axis} axisLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip {...tip} formatter={(v: number) => `${v.toFixed(1)}%`} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: c.muted }} />
                  <Line isAnimationActive={false} type="monotone" dataKey="Open Rate" stroke={c.c2} strokeWidth={2} dot={{ r: 3 }} />
                  <Line isAnimationActive={false} type="monotone" dataKey="Click Rate" stroke={c.c3} strokeWidth={2} dot={{ r: 3 }} />
                  <Line isAnimationActive={false} type="monotone" dataKey="Click-to-Open" stroke={c.c4} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>}
          </Card>
        </div>

        <Card title="All Newsletters" sub="Newest first. All-time numbers from Mautic, so they do not change with the selected dates." className="flush">
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr>{head.map((h, i) => <th key={h} className={i > (multi ? 2 : 1) ? "num" : ""}>{h}</th>)}</tr></thead>
              <tbody>
                {first && Array.from({ length: 4 }, (_, i) => <tr key={i}>{head.map((h) => <td key={h}><Sk w="70%" h={12} /></td>)}</tr>)}
                {rows.map((r) => {
                  const del = Math.max(0, r.sent - r.bounced);
                  return (
                    <tr key={r.inst + r.id}>
                      <td><div className="cell-name"><div><b title={r.name}>{nlTitle(r.name)}</b><small title={r.segments.join(", ")}>{r.subject}</small></div></div></td>
                      {multi && <td>{INSTANCES[r.inst].short}</td>}
                      <td>{day(r.date, true)}</td>
                      <td className="num">{n(r.sent)}</td>
                      <td className="num">{n(del)}</td>
                      <td className="num">{n(r.opened)}</td>
                      <td className="num"><div className="ratio good"><b>{pct(r.opened, r.sent)}</b><i><em style={{ width: `${Math.min(100, rate(r.opened, r.sent))}%` }} /></i></div></td>
                      <td className="num">{n(r.clicks)}</td>
                      <td className="num">{pct(r.clicks, r.sent)}</td>
                      <td className="num">{pct(r.clicks, r.opened)}</td>
                      <td className="num">{n(r.lp)}</td>
                      <td className="num">{n(r.bounced)}</td>
                      <td className="num">{n(r.unsub)}</td>
                      <td className="num">{pct(r.unsub, r.sent)}</td>
                    </tr>);
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <p className="note top">Newsletters are emails with &quot;Newsletter&quot; in their name. Sent newsletters are shown even when they were unpublished afterwards. Unique clicks add up the unique clicks of each link. Hover a subject to see the segments it was sent to.</p>
      </>}
    </>
  );
}
