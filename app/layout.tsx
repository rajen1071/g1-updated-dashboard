import "./globals.css";
import { Poppins } from "next/font/google";
import { DEFAULT_THEME, THEMES } from "@/lib/themes";

const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-poppins" });
export const metadata = { title: "Mautic Email Dashboard" };

// Applies the saved theme before the page paints, so there is no flash of the default colors.
const boot = `try{var T=${JSON.stringify(Object.fromEntries(Object.entries(THEMES).map(([k, t]) => [k, t.v])))};var k=localStorage.getItem("theme");var t=T[k]||T["${DEFAULT_THEME}"];for(var p in t)document.documentElement.style.setProperty("--"+p,t[p]);}catch(e){}`;

export default function L({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={poppins.variable} suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: boot }} /></head><body>{children}</body></html>;
}
