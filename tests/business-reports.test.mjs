import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context={window:{}};
vm.runInNewContext(fs.readFileSync(new URL('../business-reports.js',import.meta.url),'utf8'),context);
const report=context.window.JungcarBusinessReports;
const row=(inquiryDate,extra={})=>({inquiryDate,phone:'010-1234-5678',models:['GV70'],inquiryType:'구매',...extra});
test('month and quarter boundaries cross years and handle leap years',()=>{
  assert.equal(report.period('month',2026,0).from,'2025-12-01');
  assert.equal(report.period('quarter',2026,0).to,'2025-12-31');
  assert.equal(report.period('month',2024,2).to,'2024-02-29');
  assert.equal(report.period('quarter',2026,3).to,'2026-09-30');
});
test('unfinished months compare equal elapsed days, capped at prior month end',()=>{
  const c=report.periodContext('month',2026,9,'2026-09-23');
  assert.equal(c.cutoff,'2026-09-23');assert.equal(c.previousEnd,'2026-08-23');assert.equal(c.lastYearEnd,'2025-09-23');assert.equal(c.partial,true);
  assert.equal(report.periodContext('month',2026,3,'2026-03-30').previousEnd,'2026-02-28');
});
test('completed periods use full prior period and ongoing quarters use elapsed days',()=>{
  assert.equal(report.periodContext('month',2026,8,'2026-09-23').previousEnd,'2026-07-31');
  const c=report.periodContext('quarter',2026,3,'2026-09-23');assert.equal(c.previousEnd,'2026-06-24');assert.equal(c.elapsed,85);
});
test('metrics use unique phone numbers, nonempty budgets and enabled toggles',()=>{
  const m=report.metrics([row('2026-09-01',{budgetMax:1000,financeStatus:'예'}),row('2026-09-03',{phone:'01012345678',visitStatus:'예'}),row('2026-09-03',{phone:'',budgetMax:-1})],'2026-09-01','2026-09-03');
  assert.equal(m.total,3);assert.equal(m.customers,1);assert.equal(m.averageBudget,1000);assert.equal(m.daily,1);assert.ok(Math.abs(m.finance-100/3)<1e-10);
});
test('report excludes invalid dates and future records and fills empty trend periods',()=>{
  const input=[row('2026-09-01'),row('2026-09-24'),row('2026-08-24'),row('2026-08-10'),row('2026-02-30'),row(''),row('2025-09-23')];
  const d=report.build(input,'month',2026,9,'2026-09-23');
  assert.equal(d.current.total,1);assert.equal(d.previous.total,1);assert.equal(d.lastYear.total,1);assert.equal(d.missingDates,2);
  assert.equal(d.months.length,12);assert.equal(d.months.at(-1).total,1);assert.equal(d.months.at(-2).total,2);assert.equal(d.months[1].total,0);assert.equal(d.quarters.at(-1).partial,true);
});
test('empty reports are printable without NaN and contain exactly three report pages',()=>{
  const d=report.build([],'month',2026,8,'2026-09-23'),html=report.reportHtml(d,'전체','테스트');
  assert.equal((html.match(/data-report-page/g)||[]).length,3);assert.ok(!html.includes('NaN'));assert.ok(!html.includes('Infinity'));assert.ok(html.includes('입력된 상담 기록이 없습니다'));
});
test('untrusted model names and filter descriptions are escaped in reports',()=>{
  const d=report.build([row('2026-09-01',{models:['<img src=x onerror=alert(1)>']})],'month',2026,9,'2026-09-23');
  const html=report.reportHtml(d,'<script>bad</script>','테스트');assert.ok(!html.includes('<img src=x'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;img'));
});
test('zero denominators and rate changes are explicit',()=>{
  assert.ok(report.delta(10,0,{unit:'건'}).includes('산출 제외'));assert.ok(report.delta(60,50,{rate:true}).includes('+10.0%p'));
  assert.ok(report.delta(3.9,1,{unit:'건',decimals:1}).includes('+2.9건'));
});
