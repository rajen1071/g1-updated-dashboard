"use client";
import { useEffect, useRef, useState } from "react";
import { cached, getJson } from "./client";

// Loads one answer per instance (url(k) for each key) and keeps them by instance key.
// Answers this tab already has are shown at once, so opening a page that was loaded before (or in the background) shows no loading state.
// A change of nonce (the Refresh button) asks the server for new data from Mautic.
export function useData(ks: string[], url: (k: string) => string, nonce: number) {
  const saved = () => Object.fromEntries(ks.filter((k) => cached(url(k))).map((k) => [k, cached(url(k))])) as Record<string, any>;
  const [res, setRes] = useState<Record<string, any>>(saved);
  const [pending, setPending] = useState<string[]>(() => ks.filter((k) => !cached(url(k))));
  const req = useRef(0), seen = useRef(nonce);
  const urls = ks.map(url).join();

  useEffect(() => {
    const id = ++req.current, fresh = seen.current !== nonce;
    seen.current = nonce;
    const have = fresh ? {} : saved(), todo = ks.filter((k) => !(k in have));
    setRes(have); setPending(todo);
    todo.forEach((k) => getJson(url(k), fresh).then((d) => {
      if (id !== req.current) return;
      setRes((p) => ({ ...p, [k]: d })); setPending((p) => p.filter((x) => x !== k));
    }));
  }, [urls, nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  return { res, pending };
}
