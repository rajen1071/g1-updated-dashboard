"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { INSTANCES } from "@/lib/instances";
import { getJson, listUrl, Range } from "@/lib/client";
import { day, n, pct } from "@/lib/format";
import Icon from "./Icon";
import { Card, Errors, Loading, Sk } from "./ui";

type Col = { k: string; label: string; num?: boolean; get?: (r: any) => any; show?: (r: any) => React.ReactNode };
const modified: Col = { k: "modified", label: "Last Updated", show: (r) => day(r.modified, true) };
const name = (sub?: string): Col => ({ k: "name", label: "Name", show: (r) => <div className="cell-name"><div><b>{r.name}</b>{sub && r[sub] && <small>{r[sub]}</small>}</div></div> });

export const LISTS: Record<string, { label: string; note: string; cols: Col[]; sort: string; stats: (r: any[]) => [string, string][] }> = {
  emails: {
    label: "emails", sort: "sent", note: "Sent and open numbers are all-time totals stored by Mautic. They do not change with the selected dates.",
    cols: [name("subject"), { k: "product", label: "Product", show: (r) => r.product || "—" }, { k: "category", label: "Category", show: (r) => r.category || "—" },
      { k: "sent", label: "Sent", num: true, show: (r) => n(r.sent) }, { k: "opened", label: "Opens", num: true, show: (r) => n(r.opened) }, { k: "clicks", label: "Unique Clicks", num: true, show: (r) => n(r.clicks) },
      { k: "rate", label: "Open Rate", num: true, get: (r) => (r.sent ? r.opened / r.sent : -1), show: (r) => pct(r.opened, r.sent) }, modified],
    stats: (r) => { const s = r.reduce((a, x) => a + x.sent, 0), o = r.reduce((a, x) => a + x.opened, 0); return [["Emails", n(r.length)], ["Total sent (all time)", n(s)], ["Total opens (all time)", n(o)], ["Average open rate", pct(o, s)]]; },
  },
  campaigns: {
    label: "campaigns", sort: "modified", note: "Campaign setup from Mautic: how many steps (events), segments and forms each campaign uses.",
    cols: [name(), { k: "category", label: "Category", show: (r) => r.category || "—" }, { k: "events", label: "Steps", num: true, show: (r) => n(r.events) },
      { k: "segments", label: "Segments", num: true, show: (r) => n(r.segments) }, { k: "forms", label: "Forms", num: true, show: (r) => n(r.forms) }, modified],
    stats: (r) => [["Campaigns", n(r.length)], ["Total steps", n(r.reduce((a, x) => a + x.events, 0))], ["Using segments", n(r.filter((x) => x.segments > 0).length)], ["Using forms", n(r.filter((x) => x.forms > 0).length)]],
  },
  pages: {
    label: "landing pages", sort: "hits", note: "Visit numbers are all-time totals stored by Mautic. They do not change with the selected dates.",
    cols: [name(), { k: "category", label: "Category", show: (r) => r.category || "—" }, { k: "hits", label: "Visits", num: true, show: (r) => n(r.hits) },
      { k: "unique", label: "Unique Visits", num: true, show: (r) => n(r.unique) }, modified],
    stats: (r) => [["Landing pages", n(r.length)], ["With visits", n(r.filter((x) => x.hits > 0).length)], ["Total visits (all time)", n(r.reduce((a, x) => a + x.hits, 0))], ["Unique visits (all time)", n(r.reduce((a, x) => a + x.unique, 0))]],
  },
  forms: {
    label: "forms", sort: "submissions", note: "Submissions are counted for the selected dates only.",
    cols: [name(), { k: "category", label: "Category", show: (r) => r.category || "—" }, { k: "submissions", label: "Submissions", num: true, show: (r) => n(r.submissions) }, modified],
    stats: (r) => [["Forms", n(r.length)], ["Submissions (selected dates)", n(r.reduce((a, x) => a + x.submissions, 0))], ["Forms with submissions", n(r.filter((x) => x.submissions > 0).length)], ["Forms without submissions", n(r.filter((x) => !x.submissions).length)]],
  },
};
const PAGE = 25;

export default function ListView({ type, ks, range, product, nonce }: { type: string; ks: string[]; range: Range; product: string; nonce: number }) {
  const conf = LISTS[type];
  const [res, setRes] = useState<Record<string, any>>({});
  const [pending, setPending] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ k: conf.sort, desc: true });
  const [page, setPage] = useState(0);
  const req = useRef(0), seen = useRef(nonce);

  useEffect(() => {
    const id = ++req.current, fresh = seen.current !== nonce;
    seen.current = nonce;
    setRes({}); setPending(ks);
    ks.forEach((k) => getJson(listUrl(type, k, range), fresh).then((d) => {
      if (id !== req.current) return;
      setRes((p) => ({ ...p, [k]: d })); setPending((p) => p.filter((x) => x !== k));
    }));
  }, [type, ks.join(), range.from, range.to, nonce]); // eslint-disable-line react-hooks/exhaustive-deps
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
