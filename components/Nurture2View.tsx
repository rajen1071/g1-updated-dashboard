"use client";
import { useMemo, useState } from "react";
import { INSTANCES } from "@/lib/instances";
import { listUrl, Range } from "@/lib/client";
import { n } from "@/lib/format";
import { useData } from "@/lib/useData";
import Icon from "./Icon";
import { LISTS } from "./ListView";
import { Card, Errors, Loading, Sk } from "./ui";

// Nurture 2.0: the emails, landing pages and forms of the new nurture program. In Mautic they carry "2.0" in their name
// (for example "Scheduling 2.0 | Asset", "LP 2.0", "Nurture 2.0"). The data is the same list the Email Reports,
// Landing Pages and Forms pages use (same dates, same saved answers), filtered to the 2.0 items only.
export const isNurture2 = (r: any) => /\b2\.0\b/.test(`${r.name || ""} ${r.category || ""}`);
const TYPES: [string, string][] = [["emails", "Email"], ["pages", "Landing Page"], ["forms", "Form"]];

export default function Nurture2View({ ks, range, product, nonce }: { ks: string[]; range: Range; product: string; nonce: number }) {
  const [type, setType] = useState("emails");
  return (
    <>
      <div className="chips" role="tablist" aria-label="Nurture 2.0 type">
        <span>Show:</span>
        {TYPES.map(([k, l]) => <button key={k} role="tab" aria-selected={type === k} className={type === k ? "on" : ""} onClick={() => setType(k)}>{l}</button>)}
      </div>
      <Nurture2List key={type} type={type} ks={ks} range={range} product={product} nonce={nonce} />
    </>
  );
}

function Nurture2List({ type, ks, range, product, nonce }: { type: string; ks: string[]; range: Range; product: string; nonce: number }) {
  const conf = LISTS[type];
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ k: conf.sort, desc: true });

  const { res, pending } = useData(ks, (k) => listUrl(type, k, range), nonce);

  const all = useMemo(() => ks.flatMap((k) => (res[k]?.rows || []).map((r: any) => ({ ...r, inst: k })))
    .filter(isNurture2).filter((r) => !product || r.product === product), [res, ks, product]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase(), col = conf.cols.find((c) => c.k === sort.k), get = col?.get || ((r: any) => r[sort.k]);
    return all.filter((r) => (!t || `${r.name} ${r.subject || ""} ${r.category}`.toLowerCase().includes(t)))
      .sort((a, b) => { const x = get(a), y = get(b), v = typeof x === "string" ? x.localeCompare(y) : x - y; return sort.desc ? -v : v; });
  }, [all, q, sort, conf]);
  // One section per instance and product (for example "Plum POS · Music", "Plum Payroll · Payroll"), in the instance order of the menu.
  const groups = useMemo(() => {
    const m = new Map<string, { title: string; rows: any[] }>();
    ks.forEach((k) => {
      const names = Object.keys(INSTANCES[k].products);
      [...names, ""].forEach((p) => {
        const list = rows.filter((r) => r.inst === k && (r.product || "") === p);
        const title = !p ? `${INSTANCES[k].label} · Other` : names.length === 1 && p === INSTANCES[k].short.replace(/^Plum /, "") ? INSTANCES[k].label : `${INSTANCES[k].label} · ${p}`;
        if (list.length) m.set(`${k}|${p}`, { title, rows: list });
      });
    });
    return [...m.values()];
  }, [rows, ks]);
  const cols = conf.cols.filter((c) => c.k !== "product");
  const errs = ks.map((k) => res[k]?.error).filter(Boolean);
  const first = all.length === 0 && pending.length > 0;
  const head = (
    <thead><tr>{cols.map((c) => (
      <th key={c.k} className={c.num ? "num" : ""} aria-sort={sort.k === c.k ? (sort.desc ? "descending" : "ascending") : undefined}>
        <button onClick={() => setSort({ k: c.k, desc: sort.k === c.k ? !sort.desc : !!c.num })}>{c.label}{sort.k === c.k && <span className="arr">{sort.desc ? "↓" : "↑"}</span>}</button>
      </th>))}</tr></thead>
  );

  return (
    <>
      <Loading keys={pending} />
      <Errors list={errs} />
      <div className="kpis four">{conf.stats(all).map(([l, v]) => <div className="kpi" key={l}><small>{l}</small>{first ? <Sk w="60%" h={26} /> : <b>{v}</b>}</div>)}</div>
      <Card title={`Nurture 2.0 ${conf.label}`} sub={`${conf.note} Only ${conf.label} with "2.0" in their name are shown, grouped by instance and product. Unpublished and test ${conf.label} are not shown.`} className="flush">
        <div className="filters">
          <label className="search"><Icon name="search" size={16} /><input placeholder={`Search Nurture 2.0 ${conf.label} by name or category`} value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <span className="count">{n(rows.length)} {conf.label}</span>
        </div>
        {first && <div className="table-wrap"><table className="tbl">{head}<tbody>{Array.from({ length: 6 }, (_, i) => <tr key={i}>{cols.map((c) => <td key={c.k}><Sk w="70%" h={12} /></td>)}</tr>)}</tbody></table></div>}
        {!first && rows.length === 0 && <p className="empty">No Nurture 2.0 {conf.label} for these instances and filters.</p>}
      </Card>
      {groups.map((g) => {
        const stats = conf.stats(g.rows);
        return (
          <Card key={g.title} title={g.title} sub={`${n(g.rows.length)} ${conf.label} · ${stats.slice(1).map(([l, v]) => `${l}: ${v}`).join(" · ")}`} className="flush">
            <div className="table-wrap">
              <table className="tbl">
                {head}
                <tbody>{g.rows.map((r) => <tr key={r.inst + r.id}>{cols.map((c) => <td key={c.k} className={c.num ? "num" : ""}>{c.show ? c.show(r) : r[c.k]}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </Card>
        );
      })}
    </>
  );
}
