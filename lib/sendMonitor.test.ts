import assert from "node:assert/strict";
import { test } from "node:test";
import { Cell, issues, nextSend, SCHEDULE, Sends, statusFor, total, utcBounds } from "./sendMonitor";

// Fixed "now": Wednesday 2026-11-11 22:00 UTC (2:00 PM Pacific). Send days are relative to it.
const NOW = Date.parse("2026-11-11T22:00:00Z");
const tue = SCHEDULE.find((p) => p.id === "scheduling")!; // Tuesday, rolling
const fixed = SCHEDULE.find((p) => p.id === "accounting")!; // Tuesday, fixed weekday
const wed = SCHEDULE.find((p) => p.id === "pos")!; // Wednesday, fixed weekday
const c = (onTime: number, late = 0, pending = 0, lateFirst?: string, lateLast?: string): Cell => ({ onTime, late, pending, lateFirst, lateLast });
const S = (id: string, days: Record<string, Cell>): Sends => ({ [id]: days });

test("1. sent on its scheduled day", () => {
  const s = statusFor(S(tue.id, { "2026-11-03": c(900), "2026-11-10": c(950) }), tue, "2026-11-10", NOW);
  assert.equal(s.k, "sent"); assert.equal(s.sent, 950); assert.equal(s.change, 6);
});

test("2. one day late: amber, with the actual date in plain English, counted once", () => {
  const s = statusFor(S(tue.id, { "2026-11-03": c(900), "2026-11-10": c(0, 900, 0, "2026-11-11 18:02:00") }), tue, "2026-11-10", NOW);
  assert.equal(s.k, "late"); assert.equal(s.sent, 900); assert.equal(s.change, 0);
  assert.equal(s.label, "Out of Sequence"); // rolling campaign
  assert.equal(s.why, "900 due Tuesday, sent Wednesday Nov 11 (1 day late). Next emails move to Wednesday.");
});

test("3. several days late", () => {
  const s = statusFor(S(tue.id, { "2026-11-03": c(0, 3902, 0, "2026-11-05 17:02:00", "2026-11-05 17:13:00") }), tue, "2026-11-03", NOW);
  assert.equal(s.k, "late"); assert.match(s.why!, /sent Thursday Nov 5 \(2 days late\)/);
});

test("4. genuinely not sent", () => {
  const s = statusFor(S(tue.id, { "2026-11-03": c(0) }), tue, "2026-11-03", NOW);
  assert.equal(s.k, "missing"); assert.equal(s.label, "Not Sent");
});

test("5. still pending: due inside the window, waiting after it", () => {
  // Wed 2026-11-11 is today; before 12:00 IST Thu (= 22:30 Wed Pacific) it is "due"
  assert.equal(statusFor(S(wed.id, { "2026-11-11": c(0, 0, 5000) }), wed, "2026-11-11", NOW).k, "due");
  const after = Date.parse("2026-11-12T07:00:00Z");
  const s = statusFor(S(wed.id, { "2026-11-11": c(0, 0, 5000) }), wed, "2026-11-11", after);
  assert.equal(s.k, "pending"); assert.equal(s.label, "Waiting");
});

test("6. late send in the following week stays under the week it was scheduled for", () => {
  // Scheduled Tue 2026-11-03... use a Sunday-week edge: scheduled Mon, sent the next Monday
  const pay = SCHEDULE.find((p) => p.id === "payroll")!;
  const sends = S(pay.id, { "2026-11-02": c(0, 500, 0, "2026-11-09 16:00:00"), "2026-11-09": c(700) });
  const a = statusFor(sends, pay, "2026-11-02", NOW), b = statusFor(sends, pay, "2026-11-09", NOW);
  assert.equal(a.k, "late"); assert.equal(a.sent, 500); assert.match(a.why!, /7 days late/);
  assert.equal(b.sent, 700); // not 1200: nothing is moved or double counted
});

test("7. fixed-weekday campaign: late note does not claim the next emails move", () => {
  const s = statusFor(S(fixed.id, { "2026-11-10": c(100, 900, 0, "2026-11-11 16:00:00") }), fixed, "2026-11-10", NOW);
  assert.equal(s.k, "late"); assert.equal(s.label, "Sent Late"); assert.doesNotMatch(s.why!, /Next emails move/);
  // next send for a fixed campaign is still the weekday
  assert.equal(nextSend(S(fixed.id, {}), fixed, null, NOW), "2026-11-17");
});

test("8. rolling campaign: next send follows Mautic's queue when it is sooner", () => {
  assert.equal(nextSend(S(tue.id, {}), tue, "2026-11-12 17:00:00", NOW), "2026-11-12");
  assert.equal(nextSend(S(tue.id, {}), tue, null, NOW), "2026-11-17");
});

test("9. a few late emails on a mostly on-time day stay 'Sent on time' but are explained", () => {
  const s = statusFor(S(tue.id, { "2026-11-10": c(950, 30, 0, "2026-11-11 08:00:00") }), tue, "2026-11-10", NOW);
  assert.equal(s.k, "sent"); assert.match(s.why!, /30 due Tuesday/);
});

test("10. no double counting: total = on time + late, pending excluded", () => {
  assert.equal(total(c(10, 5, 7)), 15);
});

test("11. previous-send comparison skips weeks with nothing sent and uses late emails", () => {
  const s = statusFor(S(tue.id, { "2026-10-27": c(0, 1000, 0, "2026-10-29 17:00:00"), "2026-11-03": c(0), "2026-11-10": c(500) }), tue, "2026-11-10", NOW);
  assert.equal(s.prev!.date, "2026-10-27"); assert.equal(s.prev!.count, 1000); assert.equal(s.change, -50); assert.equal(s.k, "low");
});

test("today's partial send is 'Due today', not a volume drop", () => {
  const s = statusFor(S(wed.id, { "2026-11-04": c(5000), "2026-11-11": c(76, 0, 5000) }), wed, "2026-11-11", NOW);
  assert.equal(s.k, "due"); assert.equal(s.why, "76 sent so far, 5,000 still to go.");
});

test("12. issues are the same whichever instance filter is used", () => {
  const sends: Sends = { scheduling: { "2026-11-10": c(0) }, pos: { "2026-11-11": c(0, 0, 10) } };
  const all = issues(sends, SCHEDULE.filter((p) => sends[p.id]), NOW).map((x) => x.p.id);
  const alta = issues(sends, SCHEDULE.filter((p) => p.instance === "altametrics" && sends[p.id]), NOW).map((x) => x.p.id);
  assert.deepEqual(all, ["scheduling"]); assert.deepEqual(alta, ["scheduling"]); // POS is still due today, not an issue
});

test("send day bounds follow Pacific time, including daylight saving", () => {
  assert.deepEqual(utcBounds("2026-10-20"), ["2026-10-20 07:00:00", "2026-10-21 07:00:00"]);
  assert.deepEqual(utcBounds("2026-11-10"), ["2026-11-10 08:00:00", "2026-11-11 08:00:00"]);
});
