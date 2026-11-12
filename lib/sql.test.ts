import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_LIMIT, MAX_LIMIT, parse, toParams } from "./sql";

test("select star with default limit", () => {
  assert.deepEqual(parse("select * from email_stats"), { table: "email_stats", cols: null, count: false, where: [], order: [], limit: DEFAULT_LIMIT, offset: 0 });
});

test("columns, where, order, limit and offset", () => {
  const q = parse("SELECT id, Email_Address FROM email_stats WHERE email_id = 44 AND is_read != 0 AND date_sent >= '2026-11-01' ORDER BY id DESC, lead_id LIMIT 20 OFFSET 40;");
  assert.deepEqual(q.cols, ["id", "email_address"]);
  assert.deepEqual(q.where, [{ col: "email_id", expr: "eq", val: "44" }, { col: "is_read", expr: "neq", val: "0" }, { col: "date_sent", expr: "gte", val: "2026-11-01" }]);
  assert.deepEqual(q.order, [{ col: "id", dir: "DESC" }, { col: "lead_id", dir: "ASC" }]);
  assert.equal(q.limit, 20); assert.equal(q.offset, 40);
});

test("like, in, is null, between and LIMIT offset,count", () => {
  const q = parse("select * from page_hits where url like '%pricing%' and source not in ('email', 'sms') and email_id is not null and lead_id is null and date_hit between '2026-11-01' and '2026-11-08' limit 5, 10");
  assert.deepEqual(q.where, [
    { col: "url", expr: "like", val: "%pricing%" }, { col: "source", expr: "notIn", val: "email,sms" },
    { col: "email_id", expr: "isNotNull", val: "" }, { col: "lead_id", expr: "isNull", val: "" },
    { col: "date_hit", expr: "gte", val: "2026-11-01" }, { col: "date_hit", expr: "lte", val: "2026-11-08" }]);
  assert.equal(q.offset, 5); assert.equal(q.limit, 10);
});

test("count(*) asks Mautic for one row only", () => {
  const q = parse("select count(*) from form_submissions where form_id = 12");
  assert.equal(q.count, true);
  assert.deepEqual(toParams(q), { limit: 1, start: 0, "where[0][col]": "form_id", "where[0][expr]": "eq", "where[0][val]": "12" });
});

test("quotes inside text and the limit cap", () => {
  assert.equal(parse("select * from audit_log where user_name = 'O''Brien'").where[0].val, "O'Brien");
  assert.equal(parse("select * from email_stats limit 999999").limit, MAX_LIMIT);
});

test("anything that is not a simple SELECT is refused", () => {
  for (const sql of ["delete from email_stats", "update email_stats set is_read = 1", "drop table email_stats", "", "select * from a; delete from a",
    "select * from a join b", "select * from a where x = 1 or y = 2", "select * from a group by x", "select distinct x from a", "select max(id) from a",
    "select * from a where x = y", "select * from a.b", "select * from a -- comment", "select * from a where x = 'open"])
    assert.throws(() => parse(sql), Error, sql);
});
