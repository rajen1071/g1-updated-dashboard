"use client";
import { useEffect, useRef, useState } from "react";
import { forget, getJson, KEYS, sendsUrl } from "@/lib/client";
import { INSTANCES } from "@/lib/instances";
import { addDays, alertText, DAYNAMES, instName, issues, lastScheduled, nextSend, nice, SCHEDULE, SEND_MONITOR, Sends, short, statusFor, todayStr, weekday, weekStart } from "@/lib/sendMonitor";
import { Loading } from "./ui";

const n = (x: number) => (+x).toLocaleString("en-US");
const ORDER = { missing: 0, low: 1, due: 2, sent: 3, upcoming: 4 };

// Sends of every instance, loaded for the sidebar badge too, so a missed send shows on every page.
// A change of nonce (the Refresh button) reloads everything; every few minutes only today's numbers are asked for again.
export function useSends(nonce: number) {
  const [res, setRes] = useState<Record<string, any>>({});
  const [pending, setPending] = useState<string[]>(KEYS);
  const [checked, setChecked] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);
  const seen = useRef(nonce), req = useRef(0);

  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), SEND_MONITOR.autoRefreshMinutes * 60e3); return () => clearInterval(t); }, []);
  useEffect(() => {
    const id = ++req.current, fresh = seen.current !== nonce;
    seen.current = nonce;
    if (tick) KEYS.forEach((k) => forget(sendsUrl(k)));
    setPending(KEYS);
    KEYS.forEach((k) => getJson(sendsUrl(k), fresh).then((d) => {
      if (id !== req.current) return;
      setRes((p) => ({ ...p, [k]: d })); setPending((p) => p.filter((x) => x !== k)); setChecked(new Date());
    }));
  }, [nonce, tick]);

  const sends: Sends = Object.assign({}, ...KEYS.map((k) => res[k]?.sends || {}));
  // Products whose instance has not answered yet (or failed) are left out, so they are not shown as "Not sent".
  const known = SCHEDULE.filter((p) => res[p.instance]?.sends);
  const missed = issues(sends, known).filter((x) => x.s.k === "missing").length;
  return { res, pending, sends, known, missed, checked };
}
export const checkedText = (d: Date | null) => d ? "Last checked " + new Intl.DateTimeFormat("en-IN", { timeZone: SEND_MONITOR.timezone, hour: "numeric", minute: "2-digit" }).format(d) + " IST" : "";

export default function SendMonitor({ data }: { data: ReturnType<typeof useSends> }) {
  const { res, pending, sends, known } = data;
  const [inst, setInst] = useState("all");
  const t = todayStr(), ws = weekStart(t);

  const issuesAll = issues(sends, known);
  const missAll = issuesAll.filter((x) => x.s.k === "missing");
  const prods = known.filter((p) => inst === "all" || p.instance === inst);
  const iss = issuesAll.filter((x) => prods.includes(x.p));
  const miss = iss.filter((x) => x.s.k === "missing"), low = iss.filter((x) => x.s.k === "low");
  const dueToday = prods.filter((p) => p.weekday === weekday(t));
  const errs = KEYS.filter((k) => res[k]?.error);

  const tabs = [{ id: "all", name: `All Instances (${KEYS.length})`, desc: "Altametrics and Plum" },
    ...KEYS.map((k) => ({ id: k, name: INSTANCES[k].label, desc: Object.keys(INSTANCES[k].products).join(", ") }))];

  const li = (x: (typeof iss)[number]) => (
    <li key={x.p.id}><b>{x.p.name}</b> ({instName(x.p.instance)}): {x.d === t ? "today" : nice(x.d)}, {x.s.k === "missing" ? <b>no emails sent</b>
      : <>{n(x.s.sent)} sent vs {n(x.s.prev!.count)} on {nice(x.s.prev!.date)} (<b>{x.s.change}%</b>)</>}</li>);
  const due = dueToday.filter((p) => statusFor(sends, p, t).k === "due");

  const sentToday = dueToday.reduce((a, p) => a + (sends[p.id]?.[t] || 0), 0);
  const next = prods.map((p) => ({ p, d: nextSend(sends, p) })).filter((x) => x.d > t).sort((a, b) => a.d.localeCompare(b.d));
  const nextD = next[0]?.d;

  const wdays = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(ws, i));
  const idle = wdays.filter((d) => !prods.some((p) => p.weekday === weekday(d))).map((d) => nice(d, { weekday: "short" }));
  const weeks = [...Array(SEND_MONITOR.historyWeeks)].map((_, i) => addDays(ws, -7 * (SEND_MONITOR.historyWeeks - 1 - i)));
  const thr = SEND_MONITOR.dropAlertPercent;

  return (
    <div className="sm">
      <div className="sm-tabs">{tabs.map((x) => {
        const c = missAll.filter((i) => x.id === "all" || i.p.instance === x.id).length;
        return <button key={x.id} className={`sm-tab ${inst === x.id ? "on" : ""}`} onClick={() => setInst(x.id)}><b>{x.name}{c > 0 && <span className="cnt">{c}</span>}</b><span>{x.desc}</span></button>;
      })}</div>

      <Loading keys={pending.filter((k) => !res[k])} />
      {errs.map((k) => <div className="sm-alert" key={k}><div className="ic">⚠️</div><div><h3>Could not load data from Mautic</h3><div style={{ fontSize: 13 }}>{res[k].error}</div></div></div>)}

      {miss.length > 0 ? <div className="sm-alert"><div className="ic">🚨</div><div><h3>{miss.length} scheduled send{miss.length > 1 ? "s" : ""} did not go out</h3><ul>{[...miss, ...low].map(li)}</ul></div></div>
        : low.length > 0 ? <div className="sm-alert warn"><div className="ic">⚠️</div><div><h3>{low.length} send{low.length > 1 ? "s" : ""} dropped more than {thr}% vs the previous send</h3><ul>{low.map(li)}</ul></div></div>
        : !prods.length ? null
        : due.length ? <div className="sm-alert warn"><div className="ic">⏳</div><div><h3>Due today: {due.map((p) => p.name).join(", ")}</h3><div style={{ fontSize: 13 }}>Not sent yet. This turns red if nothing has sent by {alertText(t)}.</div></div></div>
        : <div className="sm-alert ok"><div className="ic">✅</div><div><h3>All scheduled sends so far have gone out</h3><div style={{ fontSize: 13 }}>Checks again every {SEND_MONITOR.autoRefreshMinutes} minutes.</div></div></div>}

      {prods.length > 0 && <>
        <div className="sm-card compact">
          <div className="strip">
            <div className="st">Due today: <b>{dueToday.length ? dueToday.map((p) => p.name).join(", ") : "None"}</b></div>
            <div className="st">Sent today: <b>{n(sentToday)}</b></div>
            <div className="st">Missed sends: <b className={miss.length ? "red" : ""}>{miss.length}</b></div>
            <div className="st">Next send: <b>{nextD ? nice(nextD, { weekday: "long" }) : "–"}</b>{nextD && <span> ({next.filter((x) => x.d === nextD).map((x) => x.p.name).join(", ")})</span>}</div>
          </div>
          <div className="wk-h">This week <span>Mon–Sun</span></div>
          {wdays.filter((d) => prods.some((p) => p.weekday === weekday(d))).map((d) => (
            <div className="wrow" key={d}>
              <div className={`wlab ${d === t ? "today" : ""}`}>{d === t ? "● Today" : nice(d, { weekday: "short" })} {nice(d, { month: "short", day: "numeric" })}</div>
              {prods.filter((p) => p.weekday === weekday(d)).map((p) => {
                const s = statusFor(sends, p, d);
                const sub = s.k === "upcoming" ? "" : s.k === "due" ? "due" : s.k === "missing" ? "not sent" : short(s.sent);
                return <span key={p.id} className={`ch ${s.k}`} title={`${instName(p.instance)}${s.why ? " · " + s.why : ""}`}><i />{p.name}{sub && <> <em>{sub}</em></>}</span>;
              })}
            </div>))}
          {idle.length > 0 && <div className="wnone">{idle.join(", ")}: no sends</div>}
        </div>

        <div className="sm-card">
          <h2>Product send status</h2>
          <div className="cs">Each product&apos;s latest send compared with its previous send. A row is highlighted only when the count drops by more than {thr}%.</div>
          <div className="tbl-wrap"><table>
            <thead><tr><th>Product</th><th>Instance</th><th>Send day</th><th>Last scheduled</th>
              <th className="num">Sent</th><th className="num">Previous send</th><th className="num">Change</th><th>Status</th><th>Next send</th></tr></thead>
            <tbody>{prods.slice().sort((a, b) => ORDER[statusFor(sends, a, lastScheduled(a)).k] - ORDER[statusFor(sends, b, lastScheduled(b)).k] || a.weekday - b.weekday).map((p) => {
              const d = lastScheduled(p), s = statusFor(sends, p, d), nx = nextSend(sends, p);
              return (
                <tr key={p.id} className={s.k === "missing" ? "bad" : ""}>
                  <td><b style={{ fontWeight: 500 }}>{p.name}</b></td><td>{instName(p.instance)}</td>
                  <td><span className="daytag">{DAYNAMES[p.weekday]}</span></td><td>{d === t ? "Today" : nice(d)}</td>
                  <td className="num">{n(s.sent)}</td>
                  <td className="num">{s.prev ? <>{n(s.prev.count)}<div className="why">{nice(s.prev.date)}</div></> : "–"}</td>
                  <td className="num">{s.change === null ? "–" : <span className={`sm-chg ${s.k === "low" ? "down" : ""}`}>{s.change > 0 ? "▲ +" : s.change < 0 ? "▼ " : ""}{s.change}%</span>}</td>
                  <td><span className={`pill p-${s.k}`}>{s.label}</span>{s.why && <div className="why">{s.why}</div>}</td>
                  <td>{nx === t ? "Today" : nice(nx)}</td>
                </tr>);
            })}</tbody>
          </table></div>
        </div>

        <div className="sm-card">
          <h2>Weekly send history</h2>
          <div className="cs">Emails sent on each product&apos;s scheduled day over the last {SEND_MONITOR.historyWeeks} weeks. Hover a cell to see the date and the change from the previous send.</div>
          <div className="tbl-wrap"><table className="hist">
            <thead><tr><th>Product</th>{weeks.map((w) => <th key={w} style={w === ws ? { color: "var(--primary)", fontWeight: 600 } : undefined}>{w === ws ? "This wk" : "Wk of"}<br />{nice(w, { month: "short", day: "numeric" })}</th>)}</tr></thead>
            <tbody>{prods.map((p) => (
              <tr key={p.id}><td><b>{p.name}</b><span>{instName(p.instance)} · {DAYNAMES[p.weekday]}</span></td>{weeks.map((w) => {
                const d = addDays(w, (p.weekday + 6) % 7), s = statusFor(sends, p, d);
                const txt = s.k === "missing" ? "✕" : s.k === "upcoming" ? "–" : s.k === "due" ? "Due" : short(s.sent);
                return <td key={w}><span className={`cell c-${s.k}`} title={`${nice(d)}: ${s.k === "upcoming" ? "upcoming" : n(s.sent) + " sent"}${s.change !== null ? " (" + (s.change > 0 ? "+" : "") + s.change + "% vs previous send)" : ""}`}>{txt}</span></td>;
              })}</tr>))}</tbody>
          </table></div>
          <div className="sm-legend">
            <span><i style={{ background: "var(--sm-green-soft)", border: "1px solid var(--sm-green)" }} />Sent</span>
            <span><i style={{ background: "var(--sm-amber-soft)", border: "1px solid var(--sm-amber)" }} />Dropped more than {thr}% vs previous send</span>
            <span><i style={{ background: "var(--sm-red)" }} />Not sent</span>
            <span><i style={{ background: "var(--sm-violet-soft)" }} />Due today</span>
            <span><i style={{ background: "var(--surface2)" }} />Upcoming</span>
          </div>
        </div>
      </>}
    </div>
  );
}
