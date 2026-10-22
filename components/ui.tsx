import { INSTANCES } from "@/lib/instances";

export function Loading({ keys }: { keys: string[] }) {
  if (!keys.length) return null;
  return (
    <div className="note-bar" role="status">
      <span className="spin" />
      <div><b>Loading data from Mautic: {keys.map((k) => INSTANCES[k].short).join(", ")}</b>
        <small>The first load may take 10–30 seconds. After that, results are saved for 15 minutes and load quickly.</small></div>
    </div>
  );
}

export function Errors({ list }: { list: string[] }) {
  return <>{list.map((e) => <div className="err" key={e}><b>Could not load:</b> {e}</div>)}</>;
}

export function Card({ title, sub, action, className = "", children }: { title: string; sub?: string; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={`card ${className}`}>
      <div className="card-h"><div><h3>{title}</h3>{sub && <p>{sub}</p>}</div>{action}</div>
      {children}
    </section>
  );
}

export const Sk = ({ w = "60%", h = 22 }: { w?: string; h?: number }) => <span className="sk" style={{ width: w, height: h }} />;
