// Small stroke icons (24x24 grid), so the app needs no icon library.
const P: Record<string, string> = {
  overview: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
  instances: "M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01",
  emails: "M3 5h18v14H3zM3 6l9 7 9-7",
  nurture: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5",
  campaigns: "M4 21V4M4 4h12l-2 4 2 4H4",
  pages: "M4 3h16v18H4zM4 8h16M9 8v13",
  forms: "M8 3h8v3H8zM6 5H5v16h14V5h-1M9 11h6M9 15h6",
  newsletter: "M4 4h13v16H6a2 2 0 0 1-2-2zM17 8h3v10a2 2 0 0 1-2 2M8 8h5M8 12h5M8 16h5",
  export: "M12 3v12M7 10l5 5 5-5M4 19h16",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6L6 18",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
  palette: "M12 3a9 9 0 1 0 0 18c1.1 0 1.5-.8 1.5-1.5 0-1.2-1-1.5-1-2.5s.8-1.5 2-1.5H17a4 4 0 0 0 4-4c0-4.7-4-8.5-9-8.5zM7.5 11h.01M10 7h.01M15 7h.01",
  back: "M15 5l-7 7 7 7",
  right: "M9 5l7 7-7 7",
  down: "M5 9l7 7 7-7",
  search: "M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-4-4",
  send: "M22 2L11 13M22 2l-7 20-4-9-9-4z",
  check: "M5 12l5 5 9-10",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z",
  click: "M9 9l11 4-5 2-2 5zM4 4l2 2M9 2v3M2 9h3",
  bounce: "M12 4l9 16H3zM12 10v4M12 17h.01",
  unsub: "M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4 21a8 8 0 0 1 16 0",
  print: "M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z",
  file: "M6 3h8l4 4v14H6zM14 3v4h4",
  calendar: "M4 5h16v16H4zM4 10h16M8 3v4M16 3v4",
};
export default function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[name]} /></svg>;
}
