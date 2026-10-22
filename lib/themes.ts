// Every color in the app comes from these tokens, so a theme changes the whole dashboard at once.
// c1..c5 are the chart series colors: Sent, Opened, Email Clicks, Landing Page Visits, Form Submissions.
export type Theme = { name: string; dark?: boolean; v: Record<string, string> };

const light = { surface: "#ffffff", text: "#16203a", muted: "#66728a", good: "#16a34a", warn: "#f59e0b", bad: "#e5484d", shadow: "0 1px 2px rgba(16,24,40,.05), 0 1px 3px rgba(16,24,40,.06)" };

export const THEMES: Record<string, Theme> = {
  classic: { name: "Classic Blue", v: { ...light, bg: "#f4f6fb", surface2: "#f3f5fa", border: "#e3e8f2", primary: "#2f5bea", primarySoft: "#e9efff", side: "#0f1d3d", sideText: "#aeb9d6", sideHover: "#1a2a52", c1: "#2f5bea", c2: "#16a34a", c3: "#f59e0b", c4: "#8b5cf6", c5: "#ec4899" } },
  midnight: { name: "Midnight Dark", dark: true, v: { bg: "#0c111d", surface: "#141b2b", surface2: "#1b2436", border: "#263149", text: "#e6eaf3", muted: "#8f9bb3", primary: "#6b8cff", primarySoft: "#1f2b4f", side: "#090d17", sideText: "#8f9bb3", sideHover: "#161f33", good: "#34d399", warn: "#fbbf24", bad: "#f87171", shadow: "0 1px 2px rgba(0,0,0,.4)", c1: "#6b8cff", c2: "#34d399", c3: "#fbbf24", c4: "#a78bfa", c5: "#f472b6" } },
  ocean: { name: "Ocean Teal", v: { ...light, bg: "#f1f7f8", surface2: "#eef6f7", border: "#dbe8ea", text: "#10282d", muted: "#5d7479", primary: "#0e8a96", primarySoft: "#ddf2f3", side: "#0b3439", sideText: "#9fc3c7", sideHover: "#12474d", c1: "#0e8a96", c2: "#2563eb", c3: "#f59e0b", c4: "#7c3aed", c5: "#e11d48" } },
  royal: { name: "Royal Purple", v: { ...light, bg: "#f6f4fb", surface2: "#f4f1fb", border: "#e6e1f3", text: "#1e1638", muted: "#6c6585", primary: "#6d4ae0", primarySoft: "#eee9fd", side: "#221844", sideText: "#b5aad6", sideHover: "#30245c", c1: "#6d4ae0", c2: "#10b981", c3: "#f59e0b", c4: "#0ea5e9", c5: "#ec4899" } },
  sunset: { name: "Sunset Orange", v: { ...light, bg: "#fbf6f2", surface2: "#faf3ee", border: "#efe3da", text: "#2b1a12", muted: "#7a665b", primary: "#dd5a22", primarySoft: "#fdebe1", side: "#36200f", sideText: "#d2b8a6", sideHover: "#4a2d18", c1: "#dd5a22", c2: "#0d9488", c3: "#6366f1", c4: "#c026d3", c5: "#ca8a04" } },
  forest: { name: "Forest Green", v: { ...light, bg: "#f3f7f3", surface2: "#eff5f0", border: "#dce8df", text: "#132619", muted: "#5f7465", primary: "#1f8a4c", primarySoft: "#e2f3e8", side: "#11301e", sideText: "#a3c4ae", sideHover: "#1a432a", c1: "#1f8a4c", c2: "#2563eb", c3: "#f59e0b", c4: "#8b5cf6", c5: "#db2777" } },
};
export const DEFAULT_THEME = "classic";

export function applyTheme(key: string) {
  const t = THEMES[key] || THEMES[DEFAULT_THEME], s = document.documentElement.style;
  Object.entries(t.v).forEach(([k, v]) => s.setProperty(`--${k}`, v));
  s.colorScheme = t.dark ? "dark" : "light";
}
