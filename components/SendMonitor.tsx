"use client";
import { useEffect, useId, useRef, useState } from "react";
import { forget, getJson, KEYS, sendsUrl } from "@/lib/client";
import { INSTANCES } from "@/lib/instances";
import { addDays, alertText, DAYNAMES, daysBetween, pacificDay, instName, issues, Kind, lastScheduled, nextSend, nice, SCHEDULE, SEND_MONITOR, Sends, short, Status, statusFor, todayStr, total, weekday, weekStart } from "@/lib/sendMonitor";
import { Loading } from "./ui";

const n = (x: number) => (+x).toLocaleString("en-US");
const ORDER: Record<Kind, number> = { missing: 0, pending: 1, late: 2, low: 3, unknown: 4, due: 5, sent: 6, upcoming: 7 };
// Small icon per status: check = on time, clock = late or waiting, triangle = not sent, info = unknown.
const ICON: Record<Kind, string> = { sent: "✓", late: "◷", pending: "◷", due: "●", missing: "!", low: "▼", unknown: "i", upcoming: "-" };

// Explanation shown on hover, keyboard focus or tap.
function Tip({ head, text, children, className }: { head?: string; text?: string; children: React.ReactNode; className?: string }) {
  const id = useId();
  if (!text && !head) return <span className={className}>{children}</span>;
  const points = text ? text.split(/(?<=\.)\s+(?=[A-Z0-9])/) : [];
  const body = points.length > 1 ? <ul>{points.map((x, i) => <li key={i}>{x}</li>)}</ul> : points[0];
  return <span className={`tip ${className || ""}`} tabIndex={0} aria-describedby={id}>{children}<span role="tooltip" id={id} className="tip-box">{head && <b className="tip-h">{head}</b>}{body}</span></span>;
}

// Sends of every instance, loaded for the sidebar badge too, so a missed send shows on every page.
// A change of nonce (the Refresh button) reloads everything; every few minutes the recent days are asked for again.
export function useSends(nonce: number, enabled = true) {
  const [res, setRes] = useState<Record<string, any>>({});
  const [pending, setPending] = useState<string[]>(KEYS);
  const [checked, setChecked] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);
  const seen = useRef(nonce), req = useRef(0);

  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), SEND_MONITOR.autoRefreshMinutes * 60e3); return () => clearInterval(t); }, []);
  const [on, setOn] = useState(false);
  useEffect(() => { if (enabled) setOn(true); }, [enabled]); // once started it keeps running
  useEffect(() => {
    if (!on) return;
    const id = ++req.current, fresh = seen.current !== nonce;
    seen.current = nonce;
    if (tick) KEYS.forEach((k) => forget(sendsUrl(k)));
    setPending(KEYS);
    KEYS.forEach((k) => getJson(sendsUrl(k), fresh).then((d) => {
      if (id !== req.current) return;
      setRes((p) => ({ ...p, [k]: d })); setPending((p) => p.filter((x) => x !== k)); setChecked(new Date());
    }));
  }, [nonce, tick, on]);

  const sends: Sends = Object.assign({}, ...KEYS.map((k) => res[k]?.sends || {}));
  const next: Record<string, string | null> = Object.assign({}, ...KEYS.map((k) => res[k]?.next || {}));
  // Products whose instance has not answered yet (or failed) are left out, so they are not shown as "Not sent".
  const known = SCHEDULE.filter((p) => res[p.instance]?.sends);
  const missed = issues(sends, known).filter((x) => x.s.k === "missing" || x.s.k === "pending").length;
  return { res, pending, sends, next, known, missed, checked };
}
export const checkedText = (d: Date | null) => d ? "Last checked " + new Intl.DateTimeFormat("en-IN", { timeZone: SEND_MONITOR.timezone, hour: "numeric", minute: "2-digit" }).format(d) + " IST" : "";


export default function SendMonitor({ data }: { data: ReturnType<typeof useSends> }) {
  const { res, pending, sends, next: queued, known } = data;
  const [inst, setInst] = useState("all");
  const t = todayStr(), ws = weekStart(t);

  const issuesAll = issues(sends, known);
  const bad = (k: Kind) => k === "missing" || k === "pending";
  const missAll = issuesAll.filter((x) => bad(x.s.k));
  const prods = known.filter((p) => inst === "all" || p.instance === inst);
  const iss = issuesAll.filter((x) => prods.includes(x.p));
  const miss = iss.filter((x) => bad(x.s.k)), late = iss.filter((x) => x.s.k === "late"), low = iss.filter((x) => x.s.k === "low");
  const dueToday = prods.filter((p) => p.weekday === weekday(t));
  const errs = KEYS.filter((k) => res[k]?.error);

  const tabs = [{ id: "all", name: `All Instances (${KEYS.length})`, desc: "Altametrics and Plum" },
    ...KEYS.map((k) => ({ id: k, name: INSTANCES[k].label, desc: Object.keys(INSTANCES[k].products).join(", ") }))];

  // One alert line: what happened, then what it means or what to check.
  const alertMsg = (x: (typeof iss)[number]) => {
    const s = x.s, c = s.cell!, day = DAYNAMES[weekday(x.d)];
    if (s.k === "missing") return [`No emails went out for ${day}.`, "Contacts did not get this week's email. Check that the campaign is published and running in Mautic."];
    if (s.k === "pending") return [`${n(c.pending)} emails due ${day} have not gone out yet.`, "These contacts will not get their next email until this one sends. Check the campaign queue in Mautic."];
    if (s.k === "late") {
      const d1 = pacificDay(c.lateFirst!), wd = DAYNAMES[weekday(d1)], late = daysBetween(x.d, d1);
      return [`${n(c.late)} of ${n(s.sent)} emails due ${day} went out on ${wd}, ${nice(d1, { month: "short", day: "numeric" })} (${late} day${late === 1 ? "" : "s"} late).`,
        x.p.rolling ? `Their next emails will now go on ${wd} instead of ${day}.` : `Their next emails stay on ${day}.`];
    }
    return [`${n(s.sent)} sent vs ${n(s.prev!.count)} on ${nice(s.prev!.date, { month: "short", day: "numeric" })} (${s.change}%).`,
      c.pending ? `${n(c.pending)} emails are still waiting to send.` : "Every email that was due went out; fewer contacts were due this week."];
  };
  const li = (x: (typeof iss)[number]) => { const [what, mean] = alertMsg(x); return (
    <li key={x.p.id}><b>{x.p.name}</b> · {x.d === t ? "today" : nice(x.d)}: <b>{x.s.k === "low" ? "Lower volume" : x.s.label}</b> - {what}
      <div className="why" style={{ maxWidth: "none", marginTop: 1 }}>{mean}</div></li>); };
  const due = dueToday.filter((p) => statusFor(sends, p, t).k === "due");

  // Sent today = emails that went out for today's send days (late emails are counted under the day they were scheduled for).
  const sentToday = dueToday.reduce((a, p) => a + total(sends[p.id]?.[t]), 0);
  const next = prods.map((p) => ({ p, d: nextSend(sends, p, queued[p.id]) })).filter((x) => x.d > t).sort((a, b) => a.d.localeCompare(b.d));
  const nextD = next[0]?.d;

  const wdays = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(ws, i));
  const idle = wdays.filter((d) => !prods.some((p) => p.weekday === weekday(d))).map((d) => nice(d, { weekday: "short" }));
  const weeks = [...Array(SEND_MONITOR.historyWeeks)].map((_, i) => addDays(ws, -7 * (SEND_MONITOR.historyWeeks - 1 - i)));
  const thr = SEND_MONITOR.dropAlertPercent;
  const rule = (p: (typeof prods)[number]) => p.rolling
    ? `Starts ${DAYNAMES[p.weekday]}, then every 7 days. A late email moves the next ones.`
    : `Always ${DAYNAMES[p.weekday]}.`;

  return (
    <div className="sm">
      <div className="sm-tabs">{tabs.map((x) => {
        const c = missAll.filter((i) => x.id === "all" || i.p.instance === x.id).length;
        return <button key={x.id} className={`sm-tab ${inst === x.id ? "on" : ""}`} onClick={() => setInst(x.id)}><b>{x.name}{c > 0 && <span className="cnt">{c}</span>}</b><span>{x.desc}</span></button>;
      })}</div>

      <Loading keys={pending.filter((k) => !res[k])} />
      {errs.map((k) => <div className="sm-alert" key={k}><div className="ic">⚠️</div><div><h3>Could not load data from Mautic</h3><div style={{ fontSize: 13 }}>{res[k].error}</div></div></div>)}

      {miss.length > 0 ? <div className="sm-alert"><div className="ic">⚠️</div><div><h3>{[`${miss.length} not sent yet`, late.length && `${late.length} sent late`, low.length && `${low.length} lower than last send`].filter(Boolean).join(" · ")}</h3><ul>{[...miss, ...late, ...low].map(li)}</ul></div></div>
        : late.length + low.length > 0 ? <div className="sm-alert warn"><div className="ic">⏱️</div><div><h3>{[late.length && `${late.length} sent late`, low.length && `${low.length} lower than last send`].filter(Boolean).join(" · ")}</h3><ul>{[...late, ...low].map(li)}</ul></div></div>
        : !prods.length ? null
        : due.length ? <div className="sm-alert warn"><div className="ic">⏳</div><div><h3>Due today: {due.map((p) => p.name).join(", ")}</h3><div style={{ fontSize: 13 }}>Checked again until {alertText(t)}.</div></div></div>
        : <div className="sm-alert ok"><div className="ic">✅</div><div><h3>All sends on track</h3><div style={{ fontSize: 13 }}>Checks again every {SEND_MONITOR.autoRefreshMinutes} minutes.</div></div></div>}

      {prods.length > 0 && <>
        <div className="sm-card compact">
          <div className="strip">
            <div className="st">Due today: <b>{dueToday.length ? dueToday.map((p) => p.name).join(", ") : "None"}</b></div>
            <div className="st">Sent today: <b>{n(sentToday)}</b></div>
            <div className="st">Not sent: <b className={miss.length ? "red" : ""}>{miss.length}</b></div>
            <div className="st">Sent late: <b>{late.length}</b></div>
            <div className="st">Next send: <b>{nextD ? nice(nextD, { weekday: "long" }) : "-"}</b>{nextD && <span> ({next.filter((x) => x.d === nextD).map((x) => x.p.name).join(", ")})</span>}</div>
          </div>
          <div className="wk-h">This week <span>Mon-Sun</span></div>
          {wdays.filter((d) => prods.some((p) => p.weekday === weekday(d))).map((d) => (
            <div className="wrow" key={d}>
              <div className={`wlab ${d === t ? "today" : ""}`}>{d === t ? "● Today" : nice(d, { weekday: "short" })} {nice(d, { month: "short", day: "numeric" })}</div>
              {prods.filter((p) => p.weekday === weekday(d)).map((p) => {
                const s = statusFor(sends, p, d);
                const sub = s.k === "upcoming" ? "" : s.k === "due" ? "due" : s.k === "missing" ? "Not Sent" : s.k === "pending" ? "Waiting" : s.k === "late" ? `${short(s.sent)} · ${s.label}` : short(s.sent);
                return <Tip key={p.id} className={`ch ${s.k}`} text={s.why}><i />{p.name}{sub && <> <em>{sub}</em></>}</Tip>;
              })}
            </div>))}
          {idle.length > 0 && <div className="wnone">{idle.join(", ")}: no sends</div>}
        </div>

        <div className="sm-card">
          <h2>Product send status</h2>
          <div className="cs">Latest send vs the previous one. Hover a status for details.</div>
          <div className="tbl-wrap"><table>
            <thead><tr><th>Product</th><th>Instance</th><th>Send day</th><th>Last scheduled</th>
              <th className="num">Sent</th><th className="num">Previous send</th><th className="num">Change</th><th>Status</th><th>Next send</th></tr></thead>
            <tbody>{prods.slice().sort((a, b) => ORDER[statusFor(sends, a, lastScheduled(a)).k] - ORDER[statusFor(sends, b, lastScheduled(b)).k] || a.weekday - b.weekday).map((p) => {
              const d = lastScheduled(p), s = statusFor(sends, p, d), nx = nextSend(sends, p, queued[p.id]);
              return (
                <tr key={p.id} className={s.k === "missing" ? "bad" : ""}>
                  <td><b style={{ fontWeight: 500 }}>{p.name}</b>{p.note && <div className="why">{p.note}</div>}</td><td>{instName(p.instance)}</td>
                  <td><Tip text={rule(p)}><span className="daytag">{DAYNAMES[p.weekday]}</span>{p.rolling && <div className="why">+ 7-day follow-ups</div>}</Tip></td><td>{d === t ? "Today" : nice(d)}</td>
                  <td className="num">{n(s.sent)}</td>
                  <td className="num">{s.prev ? <>{n(s.prev.count)}<div className="why">{nice(s.prev.date)}</div></> : "-"}</td>
                  <td className="num">{s.change === null ? "-" : <span className={`sm-chg ${s.k === "low" ? "down" : ""}`}>{s.change > 0 ? "▲ +" : s.change < 0 ? "▼ " : ""}{s.change}%</span>}</td>
                  <td><Tip text={s.why}><span className={`pill p-${s.k}`}>{ICON[s.k]} {s.label}{s.why && <span className="info" aria-hidden>ⓘ</span>}</span></Tip></td>
                  <td>{nx === t ? "Today" : nice(nx)}</td>
                </tr>);
            })}</tbody>
          </table></div>
        </div>

        <div className="sm-card">
          <h2>Weekly send history</h2>
          <div className="cs">Emails per scheduled send day, last {SEND_MONITOR.historyWeeks} weeks. Hover a cell for details.</div>
          <div className="tbl-wrap"><table className="hist">
            <thead><tr><th>Product</th>{weeks.map((w) => <th key={w} style={w === ws ? { color: "var(--primary)", fontWeight: 600 } : undefined}>{w === ws ? "This wk" : "Wk of"}<br />{nice(w, { month: "short", day: "numeric" })}</th>)}</tr></thead>
            <tbody>{prods.map((p) => (
              <tr key={p.id}><td><b>{p.name}</b><span>{instName(p.instance)} · {DAYNAMES[p.weekday]}</span></td>{weeks.map((w) => {
                const d = addDays(w, (p.weekday + 6) % 7), s = statusFor(sends, p, d);
                const txt = s.k === "upcoming" ? "-" : s.k === "due" ? "Due" : s.k === "missing" ? "Not Sent" : s.k === "pending" ? "Waiting" : s.k === "unknown" ? "?" : short(s.sent);
                const head = `${nice(d)}: ${s.label}${s.sent ? ` · ${n(s.sent)}` : ""}`;
                return <td key={w}><Tip className={`cell c-${s.k}`} head={head} text={s.why}>{s.k !== "upcoming" && <span className="ico" aria-hidden>{ICON[s.k]}</span>}{txt}</Tip></td>;
              })}</tr>))}</tbody>
          </table></div>
          <div className="sm-legend">
            <span><i className="c-sent" />Sent</span>
            <span><i className="c-late" />Sent Late / Out of Sequence</span>
            <span><i className="c-low" />Sent, {thr}%+ lower</span>
            <span><i className="c-pending" />Waiting</span>
            <span><i className="c-missing" />Not Sent</span>
            <span><i className="c-due" />Due today</span>
            <span><i className="c-upcoming" />Upcoming</span>
          </div>
        </div>
      </>}
    </div>
  );
}
