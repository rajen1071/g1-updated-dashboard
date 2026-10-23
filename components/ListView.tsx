"use client";
import { useEffect, useMemo, useState } from "react";
import { INSTANCES } from "@/lib/instances";
import { listUrl, Range } from "@/lib/client";
import { day, n, pct } from "@/lib/format";
import { useData } from "@/lib/useData";
import Icon from "./Icon";
import { Change } from "./Overview";
import { Card, Errors, Loading, Sk } from "./ui";

type Col = { k: string; label: string; num?: boolean; get?: (r: any) => any; show?: (r: any) => React.ReactNode };
const modified: Col = { k: "modified", label: "Last Updated", show: (r) => day(r.modified, true) };
const product: Col = { k: "product", label: "Product", show: (r) => r.product || "—" };
const name = (sub?: string): Col => ({ k: "name", label: "Name", show: (r) => <div className="cell-name"><div><b>{r.name}</b>{sub && r[sub] && <small>{r[sub]}</small>}</div></div> });

export const LISTS: Record<string, { label: string; note: string; cols: Col[]; sort: string; stats: (r: any[]) => [string, string][] }> = {
  emails: {
    label: "emails", sort: "sent", note: "Sends in the selected dates, with the opens and email clicks of those sends. All Time Sent is the total stored by Mautic.",
    cols: [name("subject"), product, { k: "category", label: "Category", show: (r) => r.category || "—" },
      { k: "sent", label: "Sent", num: true, show: (r) => n(r.sent) }, { k: "opened", label: "Opens", num: true, show: (r) => n(r.opened) }, { k: "clicks", label: "Email Clicks", num: true, show: (r) => n(r.clicks) },
      { k: "rate", label: "Open Rate", num: true, get: (r) => (r.sent ? r.opened / r.sent : -1), show: (r) => pct(r.opened, r.sent) },
      { k: "allSent", label: "All Time Sent", num: true, show: (r) => n(r.allSent) }, modified],
    stats: (r) => { const s = r.reduce((a, x) => a + x.sent, 0), o = r.reduce((a, x) => a + x.opened, 0); return [["Emails sent in these dates", `${n(r.filter((x) => x.sent > 0).length)} of ${n(r.length)}`], ["Total sent", n(s)], ["Total opens", n(o)], ["Average open rate", pct(o, s)]]; },
  },
  campaigns: {
    label: "campaigns", sort: "sent", note: "Sent, open rate and email clicks add up the emails each campaign sends, for the selected dates. Steps, segments and forms are the campaign setup.",
    cols: [name(), { k: "category", label: "Category", show: (r) => r.category || "—" },
      { k: "sent", label: "Sent", num: true, show: (r) => n(r.sent) }, { k: "rate", label: "Open Rate", num: true, get: (r) => (r.sent ? r.opened / r.sent : -1), show: (r) => pct(r.opened, r.sent) },
      { k: "clicks", label: "Email Clicks", num: true, show: (r) => n(r.clicks) },
      { k: "events", label: "Steps", num: true, show: (r) => n(r.events) }, { k: "segments", label: "Segments", num: true, show: (r) => n(r.segments) }, { k: "forms", label: "Forms", num: true, show: (r) => n(r.forms) }, modified],
    stats: (r) => { const s = r.reduce((a, x) => a + x.sent, 0), o = r.reduce((a, x) => a + x.opened, 0); return [["Campaigns sending in these dates", `${n(r.filter((x) => x.sent > 0).length)} of ${n(r.length)}`], ["Emails sent", n(s)], ["Average open rate", pct(o, s)], ["Email clicks", n(r.reduce((a, x) => a + x.clicks, 0))]]; },
  },
  pages: {
    label: "landing pages", sort: "visits", note: "Visits are counted for the selected dates. Mautic only keeps unique visitors as an all-time total, so those columns do not change with the dates.",
    cols: [name(), product, { k: "category", label: "Category", show: (r) => r.category || "—" }, { k: "visits", label: "Visits", num: true, show: (r) => n(r.visits) },
      { k: "hits", label: "All Time Visits", num: true, show: (r) => n(r.hits) }, { k: "unique", label: "All Time Unique", num: true, show: (r) => n(r.unique) }, modified],
    stats: (r) => [["Landing pages visited", `${n(r.filter((x) => x.visits > 0).length)} of ${n(r.length)}`], ["Visits (selected dates)", n(r.reduce((a, x) => a + x.visits, 0))], ["Visits (all time)", n(r.reduce((a, x) => a + x.hits, 0))], ["Unique visits (all time)", n(r.reduce((a, x) => a + x.unique, 0))]],
  },
  forms: {
    label: "forms", sort: "submissions", note: "Submissions are counted for the selected dates, for the same number of days just before them, and for all time.",
    cols: [name(), product, { k: "category", label: "Category", show: (r) => r.category || "—" }, { k: "submissions", label: "Submissions", num: true, show: (r) => n(r.submissions) },
      { k: "prev", label: "Previous Period", num: true, show: (r) => n(r.prev) },
      { k: "change", label: "Change", num: true, get: (r) => (r.prev ? (r.submissions - r.prev) / r.prev : r.submissions ? 1e9 : -1e9), show: (r) => <Change cur={r.submissions} prev={r.prev} /> },
      { k: "total", label: "All Time", num: true, show: (r) => n(r.total) }, modified],
    stats: (r) => { const s = r.reduce((a, x) => a + x.submissions, 0); return [["Forms with submissions", `${n(r.filter((x) => x.submissions > 0).length)} of ${n(r.length)}`], ["Submissions (selected dates)", n(s)],
      ["Submissions (previous period)", n(r.reduce((a, x) => a + (x.prev || 0), 0))], ["Submissions (all time)", n(r.reduce((a, x) => a + (x.total || 0), 0))]]; },
  },
};
const PAGE = 25;

export default function ListView({ type, ks, range, product, nonce }: { type: string; ks: string[]; range: Range; product: string; nonce: number }) {
  const conf = LISTS[type];
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ k: conf.sort, desc: true });
  const [page, setPage] = useState(0);

  const { res, pending } = useData(ks, (k) => listUrl(type, k, range), nonce);
  useEffect(() => setPage(0), [q, sort, product, ks.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const all = useMemo(() => ks.flatMap((k) => (res[k]?.rows || []).map((r: any) => ({ ...r, inst: k }))).filter((r) => !product || r.product === product), [res, ks, product]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase(), col = conf.cols.find((c) => c.k === sort.k), get = col?.get || ((r: any) => r[sort.k]);
    return all.filter((r) => (!t || `${r.name} ${r.subject || ""} ${r.category}`.toLowerCase().includes(t)))
      .sort((a, b) => { const x = get(a), y = get(b), v = typeof x === "string" ? x.localeCompare(y) : x - y; return sort.desc ? -v : v; });
  }, [all, q, sort, conf]);
  const cols = ks.length > 1 ? [conf.cols[0], { k: "inst", label: "Instance", show: (r: any) => INSTANCES[r.inst].short }, ...conf.cols.slice(1)] : conf.cols;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const errs = ks.map((k) => res[k]?.error).filter(Boolean);
  const first = all.length === 0 && pending.length > 0;

  return (
    <>
      <Loading keys={pending} />
      <Errors list={errs} />
      <div className="kpis four">{conf.stats(all).map(([l, v]) => <div className="kpi" key={l}><small>{l}</small>{first ? <Sk w="60%" h={26} /> : <b>{v}</b>}</div>)}</div>
      <Card title={`All ${conf.label}`} sub={`${conf.note} Unpublished and test ${conf.label} are not shown.`} className="flush">
        <div className="filters">
          <label className="search"><Icon name="search" size={16} /><input placeholder={`Search ${conf.label} by name or category`} value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <span className="count">{n(rows.length)} {conf.label}</span>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr>{cols.map((c) => (
              <th key={c.k} className={c.num ? "num" : ""} aria-sort={sort.k === c.k ? (sort.desc ? "descending" : "ascending") : undefined}>
                <button onClick={() => setSort({ k: c.k, desc: sort.k === c.k ? !sort.desc : !!c.num })}>{c.label}{sort.k === c.k && <span className="arr">{sort.desc ? "↓" : "↑"}</span>}</button>
              </th>))}</tr></thead>
            <tbody>
              {first && Array.from({ length: 6 }, (_, i) => <tr key={i}>{cols.map((c) => <td key={c.k}><Sk w="70%" h={12} /></td>)}</tr>)}
              {rows.slice(page * PAGE, page * PAGE + PAGE).map((r) => <tr key={r.inst + r.id}>{cols.map((c) => <td key={c.k} className={c.num ? "num" : ""}>{c.show ? c.show(r) : r[c.k]}</td>)}</tr>)}
              {!first && rows.length === 0 && <tr><td colSpan={cols.length} className="empty">No {conf.label} match your filters.</td></tr>}
            </tbody>
          </table>
        </div>
        {pages > 1 && <div className="pager">
          <span>Showing {page * PAGE + 1}–{Math.min(rows.length, (page + 1) * PAGE)} of {n(rows.length)}</span>
          <button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page + 1} of {pages}</span>
          <button className="btn" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</button>
        </div>}
      </Card>
    </>
  );
}
