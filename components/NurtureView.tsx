"use client";
import { useEffect, useMemo, useState } from "react";
import { INSTANCES } from "@/lib/instances";
import { listUrl, Range } from "@/lib/client";
import { n, pct } from "@/lib/format";
import { useData } from "@/lib/useData";
import Icon from "./Icon";
import { Errors, Loading, Sk } from "./ui";

type Props = { ks: string[]; range: Range; product: string; nonce: number; onBack: () => void };
type Group = { key: string; inst: string; title: string; sub: string; product: string; rows: any[]; sent: number; opened: number; clicks: number };
const MODES: [string, string][] = [["nurture", "Nurture emails"], ["ab", "All A/B tests"], ["all", "All emails"]];
const STEP = 10;

// "25203-00001 B | Accounting | Nurture | Variant B" -> letter "B", sequence 1. The parent email is "A" when it has no letter.
const letterOf = (name: string) => name.match(/^\s*\d+-\d+\s+([A-Z])\b/)?.[1] || "";
const seqOf = (name: string) => Number(name.match(/^\s*\d+-(\d+)/)?.[1] || 0);
const describe = (name: string) => name.split("|").slice(1).map((s) => s.trim()).filter((s) => !/^variant [a-z]$/i.test(s)).join(" · ");

export function groups(k: string, list: any[]): Group[] {
  const byId = new Map(list.map((r) => [r.id, r]));
  const out = new Map<number, any[]>();
  list.forEach((r) => { const root = r.parent && byId.has(r.parent) ? r.parent : r.id; out.set(root, [...(out.get(root) || []), r]); });
  return [...out.entries()].map(([root, rows]) => {
    const p = byId.get(root), seq = seqOf(p.name);
    const sorted = rows.map((r) => ({ ...r, letter: letterOf(r.name) || (r.id === root ? "A" : "?") })).sort((a, b) => a.letter.localeCompare(b.letter) || a.id - b.id);
    return { key: `${k}-${root}`, inst: k, title: seq ? `Email ${String(seq).padStart(3, "0")}` : p.name, sub: seq ? describe(p.name) : "", product: p.product, rows: sorted,
      sent: rows.reduce((a, r) => a + r.sent, 0), opened: rows.reduce((a, r) => a + r.opened, 0), clicks: rows.reduce((a, r) => a + r.clicks, 0) };
  });
}

export default function NurtureView({ ks, range, product, nonce, onBack }: Props) {
  const [mode, setMode] = useState("nurture");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(STEP);

  const { res, pending } = useData(ks, (k) => listUrl("emails", k, range), nonce);
  useEffect(() => setShown(STEP), [mode, q, product, ks.join(), range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps

  const all = useMemo(() => {
    const t = q.trim().toLowerCase();
    return ks.flatMap((k) => groups(k, res[k]?.rows || []))
      .filter((g) => g.sent > 0 && (mode === "all" || (mode === "ab" ? g.rows.length > 1 : g.rows.some((r) => /nurture/i.test(r.name)))) && (!product || g.product === product))
      .filter((g) => !t || g.rows.some((r) => r.name.toLowerCase().includes(t)))
      .sort((a, b) => a.inst.localeCompare(b.inst) || a.rows[0].name.localeCompare(b.rows[0].name, "en", { numeric: true }));
  }, [res, ks, mode, q, product]);
  const tot = all.reduce((a, g) => ({ sent: a.sent + g.sent, opened: a.opened + g.opened, clicks: a.clicks + g.clicks, v: a.v + g.rows.length }), { sent: 0, opened: 0, clicks: 0, v: 0 });
  const errs = ks.map((k) => res[k]?.error).filter(Boolean);
  const first = pending.length > 0 && !all.length;
  const label = MODES.find((m) => m[0] === mode)![1].toLowerCase();

  return (
    <>
      <button className="back" onClick={onBack}><Icon name="back" size={16} /> Back to Overview</button>
      <Loading keys={pending} />
      <Errors list={errs} />
      <div className="kpis five">{([["Emails", n(all.length)], ["Variants", n(tot.v)], ["Total sent", n(tot.sent)], ["Open rate", pct(tot.opened, tot.sent)], ["Click rate", pct(tot.clicks, tot.sent)]] as [string, string][]).map(([l, v]) => (
        <div className="kpi" key={l}><small>{l}</small>{first ? <Sk w="60%" h={26} /> : <b>{v}</b>}</div>))}
      </div>
      <div className="filters bare">
        <label className="search"><Icon name="search" size={16} /><input placeholder="Search by email name" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <div className="seg">{MODES.map(([k, l]) => <button key={k} className={mode === k ? "on" : ""} onClick={() => setMode(k)}>{l}</button>)}</div>
      </div>
      <p className="note top">Sends in the selected dates, with the opens and unique email clicks of those sends. Emails that sent nothing in these dates are not shown.</p>

      {first && Array.from({ length: 3 }, (_, i) => <div className="card" key={i}><Sk w="30%" h={18} /><Sk w="100%" h={120} /></div>)}
      {!first && all.length === 0 && <div className="card empty">No {label} were sent in these dates{product ? ` for ${product}` : ""}.</div>}
      {all.slice(0, shown).map((g) => (
        <section className="card flush vgroup" key={g.key}>
          <div className="vg-h">
            <div><b>{g.title}</b><small>{ks.length > 1 ? `${INSTANCES[g.inst].short} · ` : ""}{g.sub || g.product}</small></div>
            <div className="vg-stats">
              <span>Sent <b>{n(g.sent)}</b></span><span>Opens <b>{n(g.opened)}</b></span><span>Unique Clicks <b>{n(g.clicks)}</b></span>
              <span>Open Rate <b>{pct(g.opened, g.sent)}</b></span><span>Click Rate <b>{pct(g.clicks, g.sent)}</b></span>
            </div>
          </div>
          <div className="table-wrap">
            <table className="tbl vtbl">
              <thead><tr><th>Variant</th><th>Name</th><th className="num">Sent</th><th className="num">Read Count</th><th>Read Ratio</th><th className="num">Unique Clicks</th><th>Click Ratio</th><th className="num">Not Open</th><th className="num">Not Open %</th></tr></thead>
              <tbody>{g.rows.map((r) => {
                const read = r.sent ? r.opened / r.sent : 0, click = r.sent ? r.clicks / r.sent : 0, notOpen = Math.max(0, r.sent - r.opened);
                return (
                  <tr key={r.id}>
                    <td><span className={`vbadge v${"ABCD".indexOf(r.letter) + 1}`}>{r.letter}</span></td>
                    <td><div className="cell-name"><div><b title={r.name}>{r.name}</b></div></div></td>
                    <td className="num">{n(r.sent)}</td>
                    <td className="num">{n(r.opened)}</td>
                    <td><div className="ratio good"><b>{pct(r.opened, r.sent)}</b><i><em style={{ width: `${Math.min(100, read * 100)}%` }} /></i></div></td>
                    <td className="num">{n(r.clicks)}</td>
                    <td><div className="ratio"><b>{pct(r.clicks, r.sent)}</b><i><em style={{ width: `${Math.min(100, click * 100)}%` }} /></i></div></td>
                    <td className="num">{n(notOpen)}</td>
                    <td className="num">{pct(notOpen, r.sent)}</td>
                  </tr>);
              })}</tbody>
            </table>
          </div>
        </section>))}
      {all.length > shown && <div className="more"><button className="btn" onClick={() => setShown(shown + STEP)}>Show more ({n(all.length - shown)} left)</button></div>}
    </>
  );
}
