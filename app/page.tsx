"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { INSTANCES } from "@/lib/instances";
import { applyTheme, DEFAULT_THEME, THEMES } from "@/lib/themes";
import { day, lastWeeks } from "@/lib/format";
import { clearMemo, getJson, GROUP_NAMES, GROUPS, idle, KEYS, listUrl, newsletterUrl, overviewUrl, topUrl } from "@/lib/client";
import { useData } from "@/lib/useData";
import Icon from "@/components/Icon";
import Overview from "@/components/Overview";
import AllInstances from "@/components/AllInstances";
import ListView from "@/components/ListView";
import ExportView from "@/components/ExportView";
import NurtureView from "@/components/NurtureView";
import NewsletterView from "@/components/NewsletterView";
import SendMonitor, { checkedText, useSends } from "@/components/SendMonitor";
import { FormsTrend } from "@/components/OverviewSections";

const NAV: [string, string, string][] = [
  ["sendmonitor", "Send Monitor", "Weekly JTBD email schedule: what's expected and what was sent"],
  ["overview", "Email Marketing Overview", "Overall email, newsletter, landing page and form performance across all Mautic instances"],
  ["instances", "All Instances", "Compare every Mautic instance side by side"],
  ["newsletter", "Newsletter", "Every newsletter sent in the selected dates, with its sends, opens, clicks, bounces and unsubscribes"],
  ["nurture", "Nurture Emails", "Each nurture email with its A/B/C/D variants side by side, for the selected dates"],
  ["emails", "Email Reports", "Every email with sends, opens and clicks in the selected dates"],
  ["campaigns", "Campaigns", "Every campaign with its sends in the selected dates and its setup"],
  ["pages", "Landing Pages", "Every landing page with visits in the selected dates"],
  ["forms", "Forms", "Every form with submissions in the selected dates, the previous period and all time"],
  ["export", "Export Reports", "Download the data as CSV files"],
];
const RANGES: [number, string][] = [[1, "1 Week"], [2, "2 Weeks"], [4, "4 Weeks"], [8, "8 Weeks"]];
const OVERVIEW_VIEWS = ["overview", "instances", "forms", "export"];

function load(k: string, d: string) { try { return localStorage.getItem(k) ?? d; } catch { return d; } }
function save(k: string, v: string) { try { localStorage.setItem(k, v); } catch {} }

export default function Page() {
  const [view, setView] = useState("overview");
  const [inst, setInst] = useState("all");
  const [product, setProduct] = useState("");
  const [weeks, setWeeks] = useState<number | "custom">(2);
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [nonce, setNonce] = useState(0);
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [sideOpen, setSideOpen] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [themeMenu, setThemeMenu] = useState(false);
  const [dateMenu, setDateMenu] = useState(false);
  const themeBox = useRef<HTMLDivElement>(null), dateBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTheme(load("theme", DEFAULT_THEME)); setSideOpen(load("sidebar", "open") === "open");
    // Each page has its own link (for example #emails), so it can be bookmarked and survives a reload.
    const fromHash = () => { const h = location.hash.slice(1); if (NAV.some((x) => x[0] === h)) setView(h); };
    fromHash(); window.addEventListener("hashchange", fromHash); return () => window.removeEventListener("hashchange", fromHash);
  }, []);
  useEffect(() => { applyTheme(theme); }, [theme]);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!themeBox.current?.contains(e.target as Node)) setThemeMenu(false);
      if (!dateBox.current?.contains(e.target as Node)) setDateMenu(false);
    };
    document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close);
  }, []);

  const range = useMemo(() => {
    if (weeks === "custom") return custom;
    return lastWeeks(weeks);
  }, [weeks, custom]);
  const validRange = !!range.from && !!range.to && range.from <= range.to;

  // inst is "all", "group:<name>" for a brand section, or one instance key.
  // "All Instances" always compares every instance; product filters only apply to one instance.
  const group = inst.startsWith("group:") ? inst.slice(6) : "";
  const single = view !== "instances" && inst !== "all" && !group;
  const ks = view === "instances" || inst === "all" ? KEYS : group ? GROUPS[group] : [inst];
  const prod = single ? product : "";

  const sm = useSends(nonce);
  const { res, pending } = useData(OVERVIEW_VIEWS.includes(view) && validRange ? ks : [], (k) => overviewUrl(k, range, prod), nonce);

  // Every other page is loaded in the background for the same instances and dates, so opening it shows the data at once.
  // It waits until the visible page has its data, so the two do not slow each other down (and the visible page gets the Refresh).
  const preload = useRef(0);
  useEffect(() => {
    if (!validRange) return;
    const id = ++preload.current;
    const steps: ((k: string) => string)[] = [(k) => overviewUrl(k, range, prod), topUrl, newsletterUrl,
      ...["forms", "emails", "pages", "campaigns"].map((t) => (k: string) => listUrl(t, k, range))];
    const t = setTimeout(async () => {
      while (!idle()) { if (id !== preload.current) return; await new Promise((r) => setTimeout(r, 500)); }
      for (const url of steps) {
        if (id !== preload.current) return;
        await Promise.all(ks.map((k) => getJson(url(k))));
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [ks.join(), prod, range.from, range.to, nonce, validRange]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (v: string) => { setView(v); setDrawer(false); history.replaceState(null, "", `#${v}`); window.scrollTo({ top: 0 }); };
  const pick = (x: string) => { setInst(x); setProduct(""); if (view === "instances") go("overview"); };
  const toggleSide = () => {
    if (window.matchMedia("(max-width: 900px)").matches) setDrawer(!drawer);
    else { setSideOpen(!sideOpen); save("sidebar", sideOpen ? "closed" : "open"); }
  };
  const chooseTheme = (t: string) => { setTheme(t); save("theme", t); setThemeMenu(false); };

  const [, title, hint] = NAV.find((x) => x[0] === view)!;
  const scope = view === "instances" ? "All Instances" : prod ? `${INSTANCES[inst].short} · ${prod}` : inst === "all" ? `All Instances (${KEYS.length})` : group ? `${group} (${ks.length} instances)` : INSTANCES[inst].short;
  const products = single && Object.keys(INSTANCES[inst].products).length > 1 ? Object.keys(INSTANCES[inst].products) : [];
  const details = (k: string) => { setInst(k); setProduct(""); go("nurture"); };

  return (
    <div className={`app ${sideOpen ? "" : "side-hidden"}`}>
      <aside className={`side ${drawer ? "open" : ""}`} aria-label="Main menu">
        <div className="brand">
          <div className="logo"><img src="/mautic-logo.png" alt="Mautic" width={1536} height={458} /><small>Email Dashboard</small></div>
          <button className="ib side-x" onClick={() => setDrawer(false)} aria-label="Close menu"><Icon name="close" /></button>
        </div>
        <nav>
          <span className="nav-h">Menu</span>
          {NAV.map(([k, l]) => <button key={k} className={`nav ${view === k ? "on" : ""}`} onClick={() => go(k)} aria-current={view === k ? "page" : undefined}><Icon name={k} /><span>{k === "overview" ? "Overview" : l}</span>{k === "sendmonitor" && sm.missed > 0 && <span className="nav-cnt">{sm.missed}</span>}</button>)}
        </nav>
        <div className="side-foot"><span className="live" /> Live data from {KEYS.length} Mautic instances</div>
      </aside>
      {drawer && <div className="scrim" onClick={() => setDrawer(false)} />}

      <main className="main">
        <header className="top">
          <button className="ib" onClick={toggleSide} aria-label="Show or hide the menu" title="Show or hide the menu"><Icon name="menu" /></button>
          <div className="ttl"><h1>{title}</h1><p>{view === "sendmonitor" ? hint : <>{scope}{validRange && <> · {day(range.from, true)} – {day(range.to, true)}</>}</>}</p></div>
          <div className="tools">
            {view === "sendmonitor" && <span className="checked">{checkedText(sm.checked)}</span>}
            {/* Custom dates open in a small menu, so the header keeps the same width. */}
            {view !== "sendmonitor" && <div className="date-box" ref={dateBox}>
              <div className="seg">
                {RANGES.map(([w, l]) => <button key={w} className={weeks === w ? "on" : ""} onClick={() => { setWeeks(w); setDateMenu(false); }}>{l}</button>)}
                <button className={weeks === "custom" ? "on" : ""} aria-expanded={dateMenu} onClick={() => { if (weeks !== "custom") { setCustom(range); setWeeks("custom"); } setDateMenu(!dateMenu); }}>
                  <Icon name="calendar" size={14} /> {weeks === "custom" && validRange ? `${day(range.from)} – ${day(range.to)}` : "Custom"}
                </button>
              </div>
              {dateMenu && <div className="menu date-menu">
                <span className="menu-h">Choose dates</span>
                <label>From<input type="date" value={custom.from} max={custom.to || undefined} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></label>
                <label>To<input type="date" value={custom.to} min={custom.from || undefined} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></label>
                <button className="btn primary" onClick={() => setDateMenu(false)}>Done</button>
              </div>}
            </div>}
            <button className="btn" onClick={() => { clearMemo(); setNonce(nonce + 1); }} title="Get new data from Mautic for every page"><Icon name="refresh" size={16} /> Refresh</button>
            <div className="theme-box" ref={themeBox}>
              <button className="btn" onClick={() => setThemeMenu(!themeMenu)} aria-expanded={themeMenu}><Icon name="palette" size={16} /> Theme</button>
              {themeMenu && <div className="menu">
                <span className="menu-h">Choose a theme</span>
                {Object.entries(THEMES).map(([k, t]) => (
                  <button key={k} className={theme === k ? "on" : ""} onClick={() => chooseTheme(k)}>
                    <span className="sw" style={{ background: `linear-gradient(135deg, ${t.v.side} 50%, ${t.v.primary} 50%)` }} />
                    {t.name}{theme === k && <Icon name="check" size={16} />}
                  </button>))}
              </div>}
            </div>
          </div>
        </header>

        {!validRange && view !== "sendmonitor" && <div className="err">Please choose a start date and an end date. The start date must be before the end date.</div>}

        {!["instances", "sendmonitor"].includes(view) && <div className="tabs" role="tablist">
          <div className="tg"><span className="tg-h">Combined</span>
            <button className={`tab ${inst === "all" ? "on" : ""}`} onClick={() => pick("all")}><b>All Instances ({KEYS.length})</b><small>Altametrics and Plum</small></button></div>
          {GROUP_NAMES.map((g) => (
            <div className="tg" key={g} style={{ flexGrow: GROUPS[g].length + (GROUPS[g].length > 1 ? 1 : 0) }}><span className="tg-h">{g}</span>
              <div className="tg-row">
                {GROUPS[g].length > 1 && <button className={`tab ${inst === `group:${g}` ? "on" : ""}`} onClick={() => pick(`group:${g}`)}><b>{g} (all {GROUPS[g].length})</b><small title={GROUPS[g].flatMap((x) => Object.keys(INSTANCES[x].products)).join(", ")}>{GROUPS[g].flatMap((x) => Object.keys(INSTANCES[x].products)).join(", ")}</small></button>}
                {GROUPS[g].map((x) => <button key={x} className={`tab ${inst === x ? "on" : ""}`} onClick={() => pick(x)}><b>{INSTANCES[x].label}</b><small title={Object.keys(INSTANCES[x].products).join(", ")}>{Object.keys(INSTANCES[x].products).join(", ")}</small></button>)}
              </div>
            </div>))}
        </div>}
        {products.length > 1 && ["overview", "emails", "nurture", "pages", "forms", "export"].includes(view) && <div className="chips">
          <span>Product:</span>
          <button className={!product ? "on" : ""} onClick={() => setProduct("")}>All products</button>
          {products.map((p) => <button key={p} className={product === p ? "on" : ""} onClick={() => setProduct(p)}>{p}</button>)}
        </div>}

        {view !== "sendmonitor" && <p className="hint">{hint}</p>}
        {view === "sendmonitor" && <SendMonitor data={sm} />}
        {view === "overview" && <Overview ks={ks} res={res} pending={pending} product={prod} range={range} theme={theme} nonce={nonce} onOpen={details} onGo={go} />}
        {view === "instances" && <AllInstances res={res} pending={pending} theme={theme} onOpen={(k) => { setInst(k); setProduct(""); go("overview"); }} onBack={() => go("overview")} />}
        {view === "forms" && validRange && <FormsTrend ks={ks} res={res} pending={pending} theme={theme} />}
        {["emails", "campaigns", "pages", "forms"].includes(view) && validRange && <ListView key={view} type={view} ks={ks} range={range} product={prod} nonce={nonce} />}
        {view === "newsletter" && validRange && <NewsletterView ks={ks} range={range} theme={theme} nonce={nonce} onBack={() => go("overview")} />}
        {view === "nurture" && validRange && <NurtureView ks={ks} range={range} product={prod} nonce={nonce} onBack={() => go("overview")} />}
        {view === "export" && <ExportView ks={ks} res={res} pending={pending} range={range} product={prod} scope={scope} onPrint={() => { go("overview"); setTimeout(() => window.print(), 800); }} />}
      </main>
    </div>
  );
}
