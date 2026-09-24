import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context={window:{}};
for(const file of ['report-insights.js','report-charts.js','report-layout.js','business-reports.js']){
  vm.runInNewContext(fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8'),context);
}
const report=context.window.JungcarBusinessReports;
const row=(inquiryDate,extra={})=>({inquiryDate,phone:'010-1234-5678',models:['GV70'],inquiryType:'구매',...extra});
const text=html=>html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const dates=(from,length)=>Array.from({length},(_,i)=>new Date(Date.parse(`${from}T00:00:00Z`)+i*86400000).toISOString().slice(0,10));
const buildRange=(rows,from,to,unit='month',selectedPeriods=null,asOf='2027-01-01')=>report.build(rows,'range',2026,0,asOf,{from,to,unit,selectedPeriods});
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
test('empty reports remain readable without false comparison or graph values',()=>{
  const d=report.build([],'month',2026,8,'2026-09-23'),html=report.reportHtml(d,'전체','테스트');
  assert.ok(html.includes('data-report-page'));assert.ok(!html.includes('NaN'));assert.ok(!html.includes('Infinity'));assert.ok(html.includes('입력된 상담 기록이 없습니다'));
  assert.equal(d.items.length,0);assert.equal(d.current.total,0);assert.equal(d.current.daily,null);
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
  assert.deepEqual(Array.from(d.items,p=>p.from),['2026-08-01','2026-09-01']);
  const models=context.window.JungcarReportCharts.categoryData(d.items,'models',10);
  assert.deepEqual(Array.from(models.find(p=>p.label==='쏘나타').counts),[1,2]);assert.ok(!models.some(p=>p.label==='제외'));
  const html=report.reportHtml(d,'전체','테스트');
  assert.ok(html.includes('2026년 8월'));assert.ok(html.includes('2026년 9월'));assert.ok(html.includes('월별 문의 종류 구성'));
});
test('checked months are unique, sorted and shared by totals, demand and report text',()=>{
  const input=[row('2026-07-01',{models:['제외차종'],budgetMax:9000,financeStatus:'예'}),row('2026-08-01',{budgetMax:1000}),row('2026-09-01',{budgetMax:2000,financeStatus:'예'}),row('2026-09-02',{budgetMax:3000})];
  const d=buildRange(input,'2026-07-01','2026-09-30','month',['2026-09-01','2026-08-01','2026-09-01']);
  assert.deepEqual(Array.from(d.items,p=>p.from),['2026-08-01','2026-09-01']);
  assert.equal(d.availableItems.length,3);assert.equal(d.current.total,3);assert.equal(d.current.customers,1);
  assert.equal(d.selectedDays,61);assert.equal(d.current.daily,3/61);assert.equal(d.current.averageBudget,2000);assert.ok(Math.abs(d.current.finance-100/3)<1e-10);
  const html=report.reportHtml(d,'전체','테스트');assert.ok(!html.includes('제외차종'));assert.ok(!html.includes('2026년 7월'));
  assert.equal(context.window.JungcarReportInsights.analyze(d.items).comparisons.length,1);
});
test('long daily reports paginate every record as numerical tables',()=>{
  const input=Array.from({length:30},(_,i)=>row(`2026-08-${String(i+1).padStart(2,'0')}`));
  const d=report.build(input,'range',2026,0,'2026-10-01',{from:'2026-08-01',to:'2026-09-30',unit:'day'});
  const html=report.reportHtml(d,'전체','테스트');assert.ok((html.match(/data-report-page/g)||[]).length>1);assert.equal((html.match(/<tr class="(?:br-selected-row)?"/g)||[]).length,30);
  assert.ok(!html.includes('NaN'));assert.equal(report.validDate('2026-09-31'),false);
  assert.ok(!/<svg\b|class="(?:rc-demand|br-demand|br-track|br-composition-chart)/.test(html));
  for(const date of dates('2026-08-01',30))assert.ok(html.includes(date));
});
test('default checked months are latest two and a third explicit month is rejected',()=>{
  const input=[row('2026-01-01'),row('2026-02-01'),row('2026-03-01'),row('2026-04-01')];
  const d=buildRange(input,'2026-01-01','2026-04-30');
  assert.deepEqual(Array.from(d.items,p=>p.from),['2026-03-01','2026-04-01']);assert.equal(d.current.total,2);
  assert.throws(()=>buildRange(input,'2026-01-01','2026-04-30','month',['2026-01-01','2026-02-01','2026-03-01']),/최대 2개/);
});
test('four checked quarters are chronological and retain all adjacent transitions',()=>{
  const input=['2025-10-01','2026-01-01','2026-04-01','2026-07-01','2026-10-01'].map(date=>row(date));
  const d=buildRange(input,'2025-10-01','2026-12-31','quarter');
  assert.deepEqual(Array.from(d.items,p=>p.label),['2026년 1분기','2026년 2분기','2026년 3분기','2026년 4분기']);
  assert.equal(d.current.total,4);assert.equal(d.selectedDays,365);assert.equal(d.current.daily,4/365);
  const custom=buildRange(input,'2025-10-01','2026-12-31','quarter',['2026-10-01','2026-01-01','2026-07-01','2026-04-01']);
  assert.deepEqual(Array.from(custom.items,p=>p.from),Array.from(d.items,p=>p.from));
  const insights=context.window.JungcarReportInsights.analyze(d.items);assert.equal(insights.comparisons.length,3);
  const visible=text(report.reportHtml(d,'전체','테스트'));
  for(const [from,to] of [[1,2],[2,3],[3,4],[1,4]])assert.ok(visible.includes(`2026년 ${from}분기 → 2026년 ${to}분기`));
  assert.ok(!visible.includes('2025년 4분기'));
  assert.throws(()=>buildRange(input,'2025-10-01','2026-12-31','quarter',input.map(p=>p.inquiryDate)),/최대 4개/);
});
test('an explicit empty selection does not silently revert to default periods',()=>{
  const input=[row('2026-07-01'),row('2026-08-01')],d=buildRange(input,'2026-07-01','2026-08-31','month',[]);
  assert.equal(d.availableItems.length,2);assert.equal(d.items.length,0);assert.equal(d.current.total,0);assert.equal(d.current.daily,null);
  assert.ok(report.reportHtml(d,'전체','테스트').includes('입력된 상담 기록이 없습니다'));
});
test('selected month daily averages use only the chosen clipped calendar days',()=>{
  const input=[row('2026-01-20'),row('2026-02-20',{budgetMax:99999}),row('2026-03-10')];
  const d=buildRange(input,'2026-01-20','2026-03-10','month',['2026-03-01','2026-01-01']);
  assert.equal(d.selectedDays,22);assert.equal(d.current.total,2);assert.equal(d.current.daily,2/22);assert.equal(d.current.averageBudget,null);
  assert.ok(d.items.every(p=>p.partial));assert.equal(d.items[0].daily,1/12);assert.equal(d.items[1].daily,1/10);
});
test('daily limit is inclusive 62 calendar days even when most dates lack records',()=>{
  assert.equal(report.rangeLimit('day','2026-07-01','2026-08-31'),'');
  assert.match(report.rangeLimit('day','2026-07-01','2026-09-01'),/62일/);
  const d=buildRange([row('2026-07-01'),row('2026-08-31')],'2026-07-01','2026-08-31','day');
  assert.equal(d.items.length,2);assert.equal(d.selectedDays,62);assert.equal(d.current.daily,2/62);
  assert.throws(()=>buildRange([row('2026-07-01')],'2026-07-01','2026-09-01','day'),/62일/);
  assert.equal(report.rangeLimit('day','2024-02-01','2024-04-02'),'');
  assert.match(report.rangeLimit('day','2024-02-01','2024-04-03'),/62일/);
});
test('weekly limit uses two calendar months with ten intersecting weeks when needed',()=>{
  assert.equal(report.rangeLimit('week','2026-07-01','2026-08-31'),'');
  assert.match(report.rangeLimit('week','2026-07-01','2026-09-01'),/두 달/);
  assert.equal(report.rangeLimit('week','2026-12-01','2027-01-31'),'');
  assert.match(report.rangeLimit('week','2026-12-01','2027-02-01'),/두 달/);
  assert.equal(report.rangeLimit('week','2024-01-01','2024-02-29'),'');
  assert.match(report.rangeLimit('week','2024-01-01','2024-03-01'),/두 달/);
  const d=buildRange(dates('2026-07-01',62).map(date=>row(date)),'2026-07-01','2026-08-31','week');
  assert.equal(d.items.length,10);assert.equal(d.selectedDays,62);assert.equal(d.current.total,62);assert.equal(d.current.daily,1);
  assert.equal(d.items[0].label,'2026-07-01 ~ 2026-07-05');assert.equal(d.items.at(-1).label,'2026-08-31 ~ 2026-08-31');
  assert.equal(d.items.reduce((sum,p)=>sum+p.total,0),62);
  assert.throws(()=>buildRange([row('2026-07-01')],'2026-07-01','2026-09-01','week'),/두 달/);
  const html=report.reportHtml(d,'전체','테스트');assert.ok(!/<svg\b|class="(?:rc-demand|br-demand|br-track|br-composition-chart)/.test(html));
  assert.ok(html.includes('요일별 상담량'));assert.ok(html.includes('기간별 변화 수치'));
});
test('monthly inquiry pies include date labels and category leader lines',()=>{
  const input=[row('2026-08-01'),row('2026-08-02',{inquiryType:'판매'}),row('2026-09-01',{inquiryType:'할부/한도',financeStatus:'아니오'}),row('2026-09-02',{financeStatus:'예'})];
  const d=buildRange(input,'2026-08-01','2026-09-30');
  const html=report.reportHtml(d,'전체','테스트');
  assert.equal((html.match(/class="rc-pie-card"/g)||[]).length,2);assert.equal((html.match(/class="rc-pie-label"/g)||[]).length,4);
  assert.match(html,/rc-pie-label[\s\S]*?<polyline/);assert.match(html,/aria-label="2026년 8월 문의 종류 2건"/);assert.match(html,/aria-label="2026년 9월 문의 종류 2건"/);
  assert.ok(html.includes('2026-08-01 ~ 2026-08-31'));assert.ok(html.includes('2026-09-01 ~ 2026-09-30'));
  assert.ok(!text(html).includes('26.08'));assert.ok(!text(html).includes('26.09'));
  const transitions=context.window.JungcarReportInsights.analyze(d.items).comparisons;
  assert.equal(transitions[0].finance.beforeCount,0);assert.equal(transitions[0].finance.afterCount,1);assert.equal(transitions[0].finance.percentagePoints,50);
});
test('visible report text never substitutes A/B or comparison-role wording for dates',()=>{
  const input=[row('2026-08-01'),row('2026-08-02'),row('2026-09-01')];
  for(const unit of ['day','week','month','quarter']){
    const visible=text(report.reportHtml(buildRange(input,'2026-08-01','2026-09-30',unit),'전체','테스트'));
    assert.ok(!/\b[AB]\b|비교\s*기준|비교\s*대상/.test(visible),`${unit}: removed labels must stay absent`);
  }
});
test('report aggregation, rendering and insight generation never mutate source records',()=>{
  const input=[row('2026-08-01',{models:['GV70','GV70'],conditionRaw:'출퇴근 희망'}),row('2026-09-01',{financeStatus:'예',conditionRaw:'가족 출퇴근'})],before=JSON.stringify(input);
  const d=buildRange(input,'2026-08-01','2026-09-30');report.reportHtml(d,'전체','테스트');
  assert.equal(JSON.stringify(input),before);
});
test('imported category whitespace cannot zero or duplicate counts in daily and weekly tables',()=>{
  const input=[row('2026-08-01',{models:[' GV70 ','GV70'],inquiryType:' 구매 '}),row('2026-08-02',{models:['GV70'],inquiryType:'구매'})],before=JSON.stringify(input);
  for(const unit of ['day','week']){
    const d=buildRange(input,'2026-08-01','2026-08-07',unit),html=report.reportHtml(d,'전체','테스트');
    const model=html.match(/<tr><th scope="row">GV70<\/th>(.*?)<\/tr>/)?.[1];
    const type=html.match(/<tr><th scope="row">구매<\/th>(.*?)<\/tr>/)?.[1];
    assert.ok(model,`${unit}: canonical model row`);assert.ok(type,`${unit}: canonical inquiry row`);
    const count=unit==='day'?1:2,columns=unit==='day'?2:1;
    assert.equal((model.match(new RegExp(`<td>${count}건 <small>\\(100\\.0%\\)<\\/small><\\/td>`,'g'))||[]).length,columns);
    assert.equal((type.match(new RegExp(`<td>${count}건 <small>\\(100\\.0%\\)<\\/small><\\/td>`,'g'))||[]).length,columns);
    assert.ok(!html.includes('<th scope="row"> GV70 </th>'));assert.ok(!html.includes('<th scope="row"> 구매 </th>'));
    const insights=context.window.JungcarReportInsights.analyze(d.items);
    for(const period of insights.periods){
      assert.equal(period.models.length,1);assert.equal(period.models[0].label,'GV70');assert.equal(period.models[0].count,count);
      assert.equal(period.inquiryTypes.length,1);assert.equal(period.inquiryTypes[0].label,'구매');
    }
    for(const change of insights.comparisons){
      assert.ok(change.models.every(model=>model.percentagePoints===0));
      assert.ok(change.inquiryTypes.every(type=>type.percentagePoints===0));
    }
  }
  assert.equal(JSON.stringify(input),before);
});
