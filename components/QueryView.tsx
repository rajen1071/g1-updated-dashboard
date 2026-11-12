"use client";
import { useEffect, useRef, useState } from "react";
import { INSTANCES } from "@/lib/instances";
import { KEYS } from "@/lib/client";
import { downloadCsv, n } from "@/lib/format";
import Icon from "./Icon";
import { Card } from "./ui";

// Query page: run one simple SELECT on a Mautic activity table of one instance (see lib/sql.ts for what is supported).
// The rows include contact data, so the page asks for a password first; it is kept only until the browser tab is closed.
type Result = { columns: string[]; rows: (string | number | null)[][]; total: number; offset?: number; ms: number };
const EXAMPLES: [string, string][] = [
  ["Latest sends", "SELECT id, email_id, email_address, date_sent, is_read, date_read\nFROM email_stats\nORDER BY id DESC\nLIMIT 50"],
  ["Count opens of one email", "SELECT COUNT(*)\nFROM email_stats\nWHERE email_id = 44 AND is_read = 1"],
  ["Form submissions this month", "SELECT *\nFROM form_submissions\nWHERE date_submitted >= '2026-11-01'\nORDER BY date_submitted DESC"],
  ["Unsubscribes and bounces", "SELECT lead_id, channel_id, reason, comments, date_added\nFROM lead_donotcontact\nWHERE channel = 'email'\nORDER BY date_added DESC\nLIMIT 100"],
];
const keep = { get: () => { try { return sessionStorage.getItem("queryPassword") || ""; } catch { return ""; } }, set: (v: string) => { try { v ? sessionStorage.setItem("queryPassword", v) : sessionStorage.removeItem("queryPassword"); } catch {} } };

async function ask(body: Record<string, string>) {
  return fetch("/api/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then((r) => r.json()).catch(() => ({ error: "Could not reach the server. Please check your connection and try again." }));
}

export default function QueryView() {
  const [password, setPassword] = useState("");
  const [typed, setTyped] = useState("");
  const [inst, setInst] = useState(KEYS[0]);
  const [tables, setTables] = useState<Record<string, string[]> | null>(null);
  const [open, setOpen] = useState("");
  const [sql, setSql] = useState(EXAMPLES[0][1]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [off, setOff] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const box = useRef<HTMLTextAreaElement>(null), req = useRef(0);

  useEffect(() => { setPassword(keep.get()); }, []);
  // The table list of the chosen instance; it also checks the password.
  useEffect(() => {
    if (!password) return;
    const id = ++req.current;
    setTables(null); setError("");
    ask({ instance: inst, password }).then((d) => {
      if (id !== req.current) return;
      if (d.locked) { keep.set(""); setPassword(""); setError("Wrong password. Please try again."); return; }
      if (d.off) setOff(true);
      if (d.error) setError(d.error); else { setTables(d.tables); keep.set(password); }
    });
  }, [password, inst]);

  const run = async () => {
    if (busy || !sql.trim()) return;
    setBusy(true); setError("");
    const d = await ask({ instance: inst, password, sql });
    setBusy(false);
    if (d.locked) { keep.set(""); setPassword(""); setError("Wrong password. Please try again."); return; }
    if (d.error) { setError(d.error); setResult(null); } else setResult(d);
  };
  const insert = (text: string) => {
    const el = box.current, at = el ? el.selectionStart : sql.length, end = el ? el.selectionEnd : sql.length;
    setSql(sql.slice(0, at) + text + sql.slice(end));
    setTimeout(() => { el?.focus(); el?.setSelectionRange(at + text.length, at + text.length); });
  };

  if (!password) return (
    <Card title="Password needed" sub="Query results include contact details such as email addresses, so this page is protected.">
      <form className="q-lock" onSubmit={(e) => { e.preventDefault(); if (typed) { setError(""); setPassword(typed); setTyped(""); } }}>
        <input type="password" autoFocus placeholder="Query password" aria-label="Query password" value={typed} onChange={(e) => setTyped(e.target.value)} />
        <button className="btn primary" disabled={!typed}>Unlock</button>
      </form>
      {error && <div className="err small">{error}</div>}
    </Card>
  );
  if (off) return <div className="err">{error}</div>;

  const cols = tables?.[open] || [];
  return (
    <div className="q-grid">
      <Card title="Tables" sub="Click a table to see its columns. Click a name to add it to the query." className="q-tables">
        <label className="q-inst">Instance
          <select value={inst} onChange={(e) => { setInst(e.target.value); setOpen(""); setResult(null); }}>{KEYS.map((k) => <option key={k} value={k}>{INSTANCES[k].label}</option>)}</select>
        </label>
        {!tables && !error && <p className="note"><span className="spin sm" /> Loading tables</p>}
        <ul>{Object.keys(tables || {}).sort().map((t) => (
          <li key={t}>
            <button className={open === t ? "on" : ""} aria-expanded={open === t} onClick={() => setOpen(open === t ? "" : t)}><Icon name={open === t ? "down" : "right"} size={12} /> {t}</button>
            {open === t && <div className="q-cols">
              <button className="q-use" onClick={() => setSql(`SELECT *\nFROM ${t}\nORDER BY ${cols.includes("id") ? "id" : cols[0]} DESC\nLIMIT 50`)}>Use this table</button>
              {cols.map((c) => <button key={c} onClick={() => insert(c)}>{c}</button>)}
            </div>}
          </li>))}
        </ul>
      </Card>

      <div className="q-main">
        <Card title="Query" sub="One SELECT on one table: WHERE with AND, ORDER BY, LIMIT (up to 1,000 rows) and COUNT(*). JOIN, OR, GROUP BY and SUM are not available.">
          <textarea ref={box} className="q-sql" spellCheck={false} rows={7} aria-label="SQL query" value={sql} onChange={(e) => setSql(e.target.value)}
            onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); run(); } }} />
          <div className="q-bar">
            <button className="btn primary" onClick={run} disabled={busy || !sql.trim()}>{busy ? <span className="spin sm" /> : <Icon name="send" size={16} />} Run query</button>
            <span className="count">Ctrl + Enter</span>
            <span className="q-ex">Examples: {EXAMPLES.map(([l, s]) => <button key={l} onClick={() => setSql(s)}>{l}</button>)}</span>
            <button className="btn" onClick={() => { keep.set(""); setPassword(""); setResult(null); setTables(null); }}>Lock</button>
          </div>
          {error && <div className="err small">{error}</div>}
        </Card>

        {result && <Card title="Result" className="flush"
          sub={result.columns[0] === "count" && result.rows.length === 1 && result.columns.length === 1 ? `${INSTANCES[inst].label} · ${n(result.ms)} ms`
            : `${INSTANCES[inst].label} · rows ${n(result.rows.length ? (result.offset || 0) + 1 : 0)}-${n((result.offset || 0) + result.rows.length)} of ${n(result.total)} matching · ${n(result.ms)} ms`}
          action={result.rows.length > 0 && <button className="btn" onClick={() => downloadCsv(`query_${inst}.csv`, [result.columns, ...result.rows])}><Icon name="export" size={16} /> Download CSV</button>}>
          {result.rows.length === 0 ? <p className="empty">No rows match this query.</p> : (
            <div className="table-wrap q-res">
              <table className="tbl">
                <thead><tr>{result.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>{result.rows.map((r, i) => <tr key={i}>{r.map((v, j) => {
                  const s = v == null ? "" : String(v);
                  return <td key={j} title={s.length > 60 ? s : undefined}>{v == null ? <i>NULL</i> : s.length > 60 ? s.slice(0, 60) + "…" : s}</td>;
                })}</tr>)}</tbody>
              </table>
            </div>)}
        </Card>}
      </div>
    </div>
  );
}
