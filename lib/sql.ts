// A small SELECT parser for the Query page. The dashboard has no database connection: a query is turned into one call
// to Mautic's stats API (/api/stats/<table>), which can filter, sort and page one table. So only this shape is supported:
//
//   SELECT * | COUNT(*) | col, col ...  FROM table  [WHERE cond AND cond ...]  [ORDER BY col [ASC|DESC], ...]  [LIMIT n [OFFSET m]]
//
// with cond: col = | != | <> | > | >= | < | <= value, [NOT] LIKE, [NOT] IN (...), IS [NOT] NULL, BETWEEN a AND b.
// No JOIN, OR, GROUP BY, functions or subqueries, and nothing but SELECT: the parser refuses everything else.
import type { W } from "./mautic";

export type Query = { table: string; cols: string[] | null; count: boolean; where: W[]; order: { col: string; dir: "ASC" | "DESC" }[]; limit: number; offset: number };
export const DEFAULT_LIMIT = 100, MAX_LIMIT = 1000;

type Tok = { t: "id" | "num" | "str" | "sym"; v: string };
const NOT_SUPPORTED = ["JOIN", "OR", "GROUP", "HAVING", "UNION", "DISTINCT", "AS"];
const OPS: Record<string, string> = { "=": "eq", "!=": "neq", "<>": "neq", ">": "gt", ">=": "gte", "<": "lt", "<=": "lte" };

function tokens(sql: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "'" || c === '"') {
      let s = "", j = i + 1;
      for (; ; j++) {
        if (j >= sql.length) throw new Error("A text value is missing its closing quote.");
        if (sql[j] === c) { if (sql[j + 1] === c) { s += c; j++; continue; } break; }
        s += sql[j];
      }
      out.push({ t: "str", v: s }); i = j + 1; continue;
    }
    const m = /^(?:(-?\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(`[A-Za-z0-9_]+`)|(<>|!=|>=|<=|[=<>(),*;]))/.exec(sql.slice(i));
    if (!m) throw new Error(`Unexpected character "${c}".`);
    out.push(m[1] ? { t: "num", v: m[1] } : m[2] ? { t: "id", v: m[2] } : m[3] ? { t: "id", v: m[3].slice(1, -1) } : { t: "sym", v: m[4] });
    i += m[0].length;
  }
  return out;
}

export function parse(sql: string): Query {
  const tk = tokens(sql);
  let p = 0;
  const peek = () => tk[p];
  const kw = (w: string) => tk[p]?.t === "id" && tk[p].v.toUpperCase() === w;
  const sym = (s: string) => tk[p]?.t === "sym" && tk[p].v === s;
  const take = (w: string) => (kw(w) || sym(w) ? (p++, true) : false);
  const need = (w: string) => { if (!take(w)) throw new Error(`Expected ${w}${peek() ? ` but found "${peek().v}"` : ""}.`); };
  const name = (what: string) => {
    const t = tk[p];
    if (t?.t !== "id") throw new Error(`Expected a ${what} name${t ? ` but found "${t.v}"` : ""}.`);
    if (NOT_SUPPORTED.includes(t.v.toUpperCase())) throw new Error(`${t.v.toUpperCase()} is not supported. Only simple SELECT queries on one table work here.`);
    p++; return t.v.toLowerCase();
  };
  const value = () => {
    const t = tk[p];
    if (t?.t !== "num" && t?.t !== "str") throw new Error(`Expected a value${t ? ` but found "${t.v}"` : ""}. Text values need quotes, for example 'email'.`);
    p++; return t.v;
  };
  const whole = (what: string) => {
    const t = tk[p];
    if (t?.t !== "num" || !/^\d+$/.test(t.v)) throw new Error(`${what} must be a whole number.`);
    p++; return Number(t.v);
  };

  if (!kw("SELECT")) throw new Error("Only SELECT queries are allowed.");
  p++;
  let cols: string[] | null = null, count = false;
  if (take("*")) cols = null;
  else if (kw("COUNT") && tk[p + 1]?.v === "(") { p++; need("("); need("*"); need(")"); count = true; }
  else { cols = [name("column")]; while (take(",")) cols.push(name("column")); }
  need("FROM");
  const table = name("table");

  const where: W[] = [];
  if (take("WHERE")) {
    do {
      const col = name("column");
      if (take("IS")) { const not = take("NOT"); need("NULL"); where.push({ col, expr: not ? "isNotNull" : "isNull", val: "" }); continue; }
      if (take("BETWEEN")) { const a = value(); need("AND"); where.push({ col, expr: "gte", val: a }, { col, expr: "lte", val: value() }); continue; }
      const not = take("NOT");
      if (take("LIKE")) { where.push({ col, expr: not ? "notLike" : "like", val: value() }); continue; }
      if (take("IN")) {
        need("(");
        const vals = [value()]; while (take(",")) vals.push(value());
        need(")");
        if (vals.some((v) => v.includes(","))) throw new Error("Values inside IN (...) cannot contain a comma.");
        where.push({ col, expr: not ? "notIn" : "in", val: vals.join(",") }); continue;
      }
      const op = tk[p];
      if (not || op?.t !== "sym" || !OPS[op.v]) throw new Error(`Expected a comparison after "${col}" (=, !=, >, >=, <, <=, LIKE, IN, IS NULL, BETWEEN).`);
      p++; where.push({ col, expr: OPS[op.v], val: value() });
    } while (take("AND"));
  }

  const order: Query["order"] = [];
  if (take("ORDER")) {
    need("BY");
    do { const col = name("column"); order.push({ col, dir: take("DESC") ? "DESC" : (take("ASC"), "ASC") }); } while (take(","));
  }

  let limit = DEFAULT_LIMIT, offset = 0;
  if (take("LIMIT")) {
    limit = whole("LIMIT");
    if (take(",")) { offset = limit; limit = whole("LIMIT"); } // LIMIT offset, count
    else if (take("OFFSET")) offset = whole("OFFSET");
  }
  take(";");
  if (peek()) {
    const w = peek().v.toUpperCase();
    throw new Error(NOT_SUPPORTED.includes(w) ? `${w} is not supported. Only simple SELECT queries on one table work here.` : `Unexpected "${peek().v}" in the query.`);
  }
  return { table, cols, count, where, order, limit: Math.min(Math.max(limit, 1), MAX_LIMIT), offset };
}

// The Mautic stats API parameters for a parsed query.
export function toParams(q: Query): Record<string, string | number> {
  const out: Record<string, string | number> = { limit: q.count ? 1 : q.limit, start: q.count ? 0 : q.offset };
  q.where.forEach((w, i) => { out[`where[${i}][col]`] = w.col; out[`where[${i}][expr]`] = w.expr; out[`where[${i}][val]`] = w.val; });
  q.order.forEach((o, i) => { out[`order[${i}][col]`] = o.col; out[`order[${i}][dir]`] = o.dir; });
  return out;
}
