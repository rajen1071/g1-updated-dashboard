"use client";
import { INSTANCES } from "@/lib/instances";
import { topUrl } from "@/lib/client";
import { n, pct } from "@/lib/format";
import { useData } from "@/lib/useData";
import Icon from "./Icon";
import { Card, Errors, Sk } from "./ui";

type Props = { ks: string[]; product: string; nonce: number; onGo: (view: string) => void };
type Table = { key: string; view: string; title: string; head: string[]; rows: any[]; cells: (r: any) => React.ReactNode[] };
const TOP = 5;

// Top 5 emails, campaigns and landing pages across the selected instances (all-time numbers from Mautic).
export default function TopTables({ ks, product, nonce, onGo }: Props) {

  const { res } = useData(ks, (k) => topUrl(k), nonce);

  const loading = ks.some((k) => !res[k]);
  const all = (f: string) => ks.flatMap((k) => (res[k]?.[f] || []).map((r: any) => ({ ...r, inst: k })));
  const best = (rows: any[], f: (r: any) => number) => rows.sort((a, b) => f(b) - f(a)).slice(0, TOP);
  // The instance is shown under the name (not in its own column), so the three tables fit side by side.
  const name = (r: any) => <div className="nm-cell"><span className="nm" title={r.name}>{r.name}</span><small>{INSTANCES[r.inst].short}</small></div>;

  const tables: Table[] = [
    { key: "emails", view: "emails", title: "Top Performing Emails", head: ["Email Name", "Sent", "Open Rate", "Click Rate", "LP Visits"],
      rows: best(all("emails").filter((r) => !product || r.product === product), (r) => r.clicks * 1e9 + r.sent),
      cells: (r) => [name(r), n(r.sent), pct(r.opened, r.sent), pct(r.clicks, r.sent), n(r.lp)] },
    { key: "campaigns", view: "campaigns", title: "Campaign Performance", head: ["Campaign Name", "Sent", "Open Rate", "Click Rate", "LP Visits"],
      rows: best(all("campaigns"), (r) => r.sent),
      cells: (r) => [name(r), n(r.sent), pct(r.opened, r.sent), pct(r.clicks, r.sent), n(r.lp)] },
    { key: "pages", view: "pages", title: "Landing Page Performance", head: ["Landing Page Name", "Visits", "Unique Visitors", "Form Subs", "Conv. Rate"],
      rows: best(all("pages"), (r) => r.hits),
      cells: (r) => [name(r), n(r.hits), n(r.unique), n(r.forms), pct(r.forms, r.unique)] },
  ];

  return (
    <>
      <Errors list={ks.map((k) => res[k]?.error).filter(Boolean)} />
      <div className="grid-3">{tables.map((t) => (
        <Card key={t.key} title={t.title} className="flush" action={<button className="link" onClick={() => onGo(t.view)}>View All <Icon name="right" size={14} /></button>}>
          <div className="table-wrap">
            <table className="tbl compact top-tbl">
              <thead><tr><th>#</th>{t.head.map((h, i) => <th key={h} className={i > 0 ? "num" : "name"}>{h}</th>)}</tr></thead>
              <tbody>
                {loading && !t.rows.length && Array.from({ length: TOP }, (_, i) => <tr key={i}><td>{i + 1}</td>{t.head.map((h) => <td key={h}><Sk w="70%" h={12} /></td>)}</tr>)}
                {t.rows.map((r, i) => <tr key={r.inst + r.id}><td>{i + 1}</td>{t.cells(r).map((v, j) => <td key={j} className={j > 0 ? "num" : "name"}>{v}</td>)}</tr>)}
                {!loading && !t.rows.length && <tr><td colSpan={t.head.length + 1} className="empty">No data yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>))}
      </div>
      <p className="note top">These three tables use all-time totals stored by Mautic, so they do not change with the selected dates. Campaign numbers add up the emails each campaign sends. Click rate uses unique clicks. Mautic does not link form submissions to emails, so form submissions are shown for landing pages only.</p>
    </>
  );
}
