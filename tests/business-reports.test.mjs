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
test('report excludes invalid dates, future records and periods outside the selected range',()=>{
  const input=[row('2026-09-01'),row('2026-09-24'),row('2026-08-24'),row('2026-08-10'),row('2026-02-30'),row(''),row('2025-09-23')];
  const d=report.build(input,'month',2026,9,'2026-09-23');
  assert.equal(d.current.total,1);assert.equal(d.previous.total,1);assert.equal(d.lastYear.total,1);assert.equal(d.missingDates,2);
  assert.equal(d.months.length,1);assert.equal(d.months[0].total,1);assert.equal(d.months[0].from,'2026-09-01');assert.equal(d.quarters.length,1);assert.equal(d.quarters[0].partial,true);
});
test('empty months disappear without changing the true previous calendar month baseline',()=>{
  const d=report.build([row('2026-06-01'),row('2026-07-01'),row('2026-07-02'),row('2026-09-03')],'quarter',2026,3,'2026-10-01');
  assert.equal(d.current.total,3);assert.equal(d.months.length,2);assert.equal(d.months[0].index,7);assert.equal(d.months[1].index,9);
  assert.equal(d.months[1].previousTotal,0);assert.equal(d.months[0].previousTotal,1);
  const html=report.reportHtml(d,'전체','테스트');assert.ok(!html.includes('2026년 8월'));assert.ok(!html.includes('26.08'));assert.ok(!html.includes('26.Q2'));
});
test('custom date ranges clip months and quarters and compare the previous equal-length period',()=>{
  const rows=[row('2026-07-14'),row('2026-07-15'),row('2026-07-31'),row('2026-09-10'),row('2026-09-11')];
  const d=report.build(rows,'range',2026,0,'2026-09-23',{from:'2026-07-15',to:'2026-09-10'});
  assert.equal(d.current.total,3);assert.equal(d.context.elapsed,58);assert.equal(d.context.previous.from,'2026-05-18');assert.equal(d.context.previousEnd,'2026-07-14');
  assert.equal(d.months.length,2);assert.equal(d.months[0].start,'2026-07-15');assert.equal(d.months[1].cutoff,'2026-09-10');assert.ok(d.months.every(p=>p.partial));assert.equal(d.quarters[0].total,3);
});
test('custom ranges reject reversed dates and clamp leap-year anniversaries',()=>{
  assert.throws(()=>report.rangeContext('2026-09-20','2026-09-01','2026-09-23'));
  assert.equal(report.rangeContext('2024-02-29','2024-03-02','2024-03-04').lastYear.from,'2023-02-28');
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
test('day and Monday-Sunday week bins cross month/year boundaries without overlap',()=>{
  assert.equal(report.bucket('week','2026-08-02').from,'2026-07-27');
  assert.equal(report.bucket('week','2026-08-03').from,'2026-08-03');
  assert.equal(report.bucket('week','2027-01-01').from,'2026-12-28');
  const input=[row('2026-07-31'),row('2026-08-01'),row('2026-08-02'),row('2026-08-03'),row('2026-08-10')];
  const weeks=report.visibleSeries(input,'week','2026-08-01','2026-08-09');
  assert.equal(weeks.length,2);assert.equal(weeks[0].total,2);assert.equal(weeks[0].start,'2026-08-01');assert.equal(weeks[0].cutoff,'2026-08-02');assert.equal(weeks[0].partial,true);assert.equal(weeks[1].total,1);
  const daily=report.visibleSeries(input,'day','2026-08-01','2026-08-09');assert.equal(daily.length,3);assert.equal(daily[2].previousTotal,1);
});
test('all aggregation units retain the same selected consultation total',()=>{
  const input=Array.from({length:70},(_,i)=>row(new Date(Date.UTC(2026,6,25+i)).toISOString().slice(0,10)));
  for(const unit of ['day','week','month','quarter']){
    const d=report.build(input,'range',2026,0,'2026-09-24',{from:'2026-08-01',to:'2026-09-30',unit});
    assert.equal(d.items.reduce((sum,p)=>sum+p.total,0),55);assert.equal(d.current.total,55);assert.equal(d.unit,unit);
  }
});
test('monthly demand compares August against September inside the chosen range',()=>{
  const input=[row('2026-07-31',{models:['제외']}),row('2026-08-01',{models:['쏘나타','쏘나타']}),row('2026-08-02',{models:['GV70']}),row('2026-09-01',{models:['쏘나타'],inquiryType:'판매'}),row('2026-09-02',{models:['쏘나타']})];
  const d=report.build(input,'range',2026,0,'2026-10-01',{from:'2026-08-01',to:'2026-09-30',unit:'month'});
  assert.equal(d.compareA.from,'2026-08-01');assert.equal(d.compareB.from,'2026-09-01');
  const models=report.demandData(d.compareA,d.compareB,'models',10);
  assert.equal(models.find(p=>p.label==='쏘나타').a,1);assert.equal(models.find(p=>p.label==='쏘나타').b,2);assert.ok(!models.some(p=>p.label==='제외'));
  const html=report.reportHtml(d,'전체','테스트');assert.ok(html.includes('+1건'));assert.ok(html.includes('+50.0%p'));assert.ok(html.includes('월별 비교'));
});
test('custom pair selection is honored and never compares the same bucket to itself',()=>{
  const input=[row('2026-07-01'),row('2026-08-01'),row('2026-09-01')],selection={from:'2026-07-01',to:'2026-09-30',unit:'month',compareA:'2026-07-01',compareB:'2026-09-01'};
  const d=report.build(input,'range',2026,0,'2026-10-01',selection);assert.equal(d.compareA.from,'2026-07-01');assert.equal(d.compareB.from,'2026-09-01');
  const same=report.build(input,'range',2026,0,'2026-10-01',{...selection,compareA:selection.compareB});assert.notEqual(same.compareA.from,same.compareB.from);
  const one=report.build([input[0]],'range',2026,0,'2026-10-01',selection);assert.equal(one.compareA,null);assert.ok(report.reportHtml(one,'전체','테스트').includes('비교할 구간이 부족'));
});
test('long daily reports paginate every record and invalid September 31 is rejected',()=>{
  const input=Array.from({length:30},(_,i)=>row(`2026-08-${String(i+1).padStart(2,'0')}`));
  const d=report.build(input,'range',2026,0,'2026-10-01',{from:'2026-08-01',to:'2026-09-30',unit:'day'});
  const html=report.reportHtml(d,'전체','테스트');assert.equal((html.match(/data-report-page/g)||[]).length,5);assert.equal((html.match(/<tr class=/g)||[]).length,30);assert.ok(!html.includes('NaN'));assert.equal(report.validDate('2026-09-31'),false);
});
