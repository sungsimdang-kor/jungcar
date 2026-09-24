import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context={window:{}};
vm.runInNewContext(fs.readFileSync(new URL('../report-insights.js',import.meta.url),'utf8'),context);
const {analyze}=context.window.JungcarReportInsights;
const row=(inquiryDate,extra={})=>({inquiryDate,phone:'010-1234-5678',models:['GV70'],inquiryType:'구매',financeStatus:'미확인',...extra});
const item=(from,to,rows,extra={})=>({from,to,start:from,cutoff:to,label:from.slice(0,7),rows,...extra});
const plain=value=>JSON.parse(JSON.stringify(value));

test('selected periods are sorted chronologically and comparison labels use dates',()=>{
  const result=analyze([item('2026-09-01','2026-09-30',[row('2026-09-01'),row('2026-09-02')]),item('2026-08-01','2026-08-31',[row('2026-08-01')])]);
  assert.equal(result.periods[0].label,'2026-08');assert.equal(result.comparisons[0].fromLabel,'2026-08');assert.equal(result.comparisons[0].toLabel,'2026-09');
  assert.equal(result.comparisons[0].total.change,1);assert.equal(result.comparisons[0].total.percentChange,100);
  assert.equal(result.periods[1].days,30);assert.equal(result.periods[0].daily,1/31);
});
test('weekday leaders normalize calendar occurrences and preserve all ties',()=>{
  // August 2026 has five Saturdays and four Tuesdays: 5 Saturday vs 4 Tuesday calls are both 1 per weekday occurrence.
  const dates=['2026-08-01','2026-08-08','2026-08-15','2026-08-22','2026-08-29','2026-08-04','2026-08-11','2026-08-18','2026-08-25'];
  const result=analyze([item('2026-08-01','2026-08-31',dates.map(date=>row(date)))]).periods[0];
  assert.deepEqual(plain(result.peakWeekdays),['화요일','토요일']);assert.deepEqual(plain(result.countPeakWeekdays),['토요일']);
  assert.equal(result.weekdays.find(day=>day.day==='화요일').occurrences,4);assert.equal(result.weekdays.find(day=>day.day==='토요일').occurrences,5);
});
test('weekday occurrences use clipped effective dates and never divide by unavailable weekdays',()=>{
  const result=analyze([item('2026-09-01','2026-09-30',[row('2026-09-01'),row('2026-09-02'),row('2026-09-10')],{cutoff:'2026-09-02',partial:true})]);
  assert.equal(result.periods[0].days,2);assert.equal(result.periods[0].total,2);assert.equal(result.periods[0].weekdays[0].perDay,null);
  assert.deepEqual(plain(result.periods[0].peakWeekdays),['화요일','수요일']);assert.ok(result.cautions.some(text=>text.includes('부분')));
});
test('financing uses enabled toggle only, not inquiry category or financing memo',()=>{
  const first=[row('2026-08-01',{financeStatus:'예'}),row('2026-08-02',{inquiryType:'할부',conditionRaw:'할부 문의',financeStatus:'아니오'})];
  const second=[row('2026-09-01',{financeStatus:'예'}),row('2026-09-02',{financeStatus:'예'})];
  const result=analyze([item('2026-08-01','2026-08-31',first),item('2026-09-01','2026-09-30',second)]);
  assert.equal(result.periods[0].finance.count,1);assert.equal(result.periods[0].finance.rate,50);
  assert.equal(result.comparisons[0].finance.percentagePoints,50);assert.equal(result.comparisons[0].finance.countChange,1);
});
test('four periods produce three sequential comparisons, empty/zero denominators are null',()=>{
  const input=[1,2,3,4].map(month=>item(`2026-0${month}-01`,`2026-0${month}-28`,month===1?[]:[row(`2026-0${month}-01`)]));
  const result=analyze(input);assert.equal(result.comparisons.length,3);assert.equal(result.comparisons[0].total.percentChange,null);
  assert.equal(result.comparisons[0].finance.percentagePoints,null);assert.equal(result.periods[0].peakWeekdays.length,0);
  assert.equal(result.comparisons[0].models[0].percentagePoints,null);
  assert.ok(!JSON.stringify(result).includes('NaN'));assert.ok(!JSON.stringify(result).includes('Infinity'));
  assert.equal(analyze([]).periods.length,0);
});
test('models are deduplicated within consultations and changing shares retain actual labels',()=>{
  const result=analyze([item('2026-08-01','2026-08-31',[row('2026-08-01',{models:['GV70','GV70','아반떼']})]),item('2026-09-01','2026-09-30',[row('2026-09-01',{models:['아반떼']})])]);
  assert.equal(result.periods[0].models.find(value=>value.label==='GV70').count,1);
  assert.equal(result.comparisons[0].models.find(value=>value.label==='GV70').percentagePoints,-100);
});
test('memo words count once per consultation and repeated words need three mentions and two identified customers',()=>{
  const first=[row('2026-08-01',{conditionRaw:'출퇴근 출퇴근용 출근. 무사고 희망'}),row('2026-08-02',{conditionRaw:'출퇴근. 무사고'})];
  const second=[row('2026-09-01',{conditionRaw:'출퇴근용 무사고',phone:'010-2345-6789'})];
  const result=analyze([item('2026-08-01','2026-08-31',first),item('2026-09-01','2026-09-30',second)]);
  const term=result.memoTerms.find(value=>value.term==='출퇴근');assert.equal(term.total,3);assert.equal(term.customers,2);assert.equal(term.periods[0].count,2);assert.equal(term.periods[1].share,100);
  assert.equal(term.changes[0].change,-1);assert.equal(term.changes[0].percentagePoints,0);assert.equal(term.consecutive,true);
  assert.ok(result.memoTerms.some(value=>value.term==='무사고'));assert.ok(!result.memoTerms.some(value=>value.term==='사고'));
  const singleCustomer=analyze([item('2026-08-01','2026-08-31',[...first,row('2026-08-03',{conditionRaw:'출퇴근'})])]);assert.equal(singleCustomer.memoTerms.length,0);
});
test('memo privacy vocabulary excludes models, fuels, trims, names, contacts, URLs and custom exclusions',()=>{
  const text='김영희 010-9876-5432 customer@example.com https://example.com/방문 GV70 가솔린 프레스티지 차량 구매 희망 캠핑 저신용 출퇴근 무사고';
  const rows=[1,2,3].map(day=>row(`2026-08-0${day}`,{phone:day===1?'01012345678':'01023456789',conditionRaw:text,models:['GV70','캠핑']}));
  const result=analyze([item('2026-08-01','2026-08-31',rows)],{excludedTerms:['출퇴근']});
  assert.deepEqual(plain(result.memoTerms.map(value=>value.term).sort()),['무사고','저신용']);
  const serialized=JSON.stringify(result.memoTerms);
  for(const secret of ['김영희','010','customer@example.com','example.com','가솔린','프레스티지','GV70','캠핑','출퇴근'])assert.ok(!serialized.includes(secret),secret);
  assert.ok(!serialized.includes('conditionRaw'));assert.ok(!serialized.includes('phone'));
});
test('unknown memo tokens are never surfaced and memos without contacts are clearly anonymous',()=>{
  const result=analyze([item('2026-08-01','2026-08-31',[1,2,3].map(day=>row(`2026-08-0${day}`,{phone:'',conditionRaw:'사람이름 서울특별시 임의문자열 고객 담당자 보증 보증금 저신용 신용 방문예정 첫 차'})))]);
  const terms=result.memoTerms.map(value=>value.term);assert.ok(terms.includes('보증'));assert.ok(terms.includes('보증금'));assert.ok(terms.includes('저신용'));assert.ok(terms.includes('신용'));assert.ok(terms.includes('방문'));assert.ok(terms.includes('첫차'));
  assert.ok(!terms.includes('사람이름'));assert.ok(result.memoTerms.every(value=>value.customers===null));
});
test('memo new/emerging term shares use all consultations, not only rows with notes',()=>{
  const first=[row('2026-08-01'),row('2026-08-02')];
  const second=[1,2,3,4].map(day=>row(`2026-09-0${day}`,{phone:day%2?'01012345678':'01023456789',conditionRaw:day<=3?'탁송 요청':' '}));
  const term=analyze([item('2026-08-01','2026-08-31',first),item('2026-09-01','2026-09-30',second)]).memoTerms[0];
  assert.equal(term.term,'탁송');assert.equal(term.periods[0].share,0);assert.equal(term.periods[1].share,75);assert.equal(term.changes[0].percentagePoints,75);assert.equal(term.consecutive,false);
});
test('inputs are not mutated and no raw records or phones escape in aggregate output',()=>{
  const input=[item('2026-08-01','2026-08-31',[row('2026-08-01',{budgetMax:'1,500',conditionRaw:'비밀메모'})])];
  const before=JSON.stringify(input),result=analyze(input);assert.equal(JSON.stringify(input),before);assert.equal(result.periods[0].averageBudget,1500);
  const json=JSON.stringify(result);assert.ok(!json.includes('010-1234-5678'));assert.ok(!json.includes('비밀메모'));assert.ok(!json.includes('conditionRaw'));
});
test('memo coverage is explicit and suggestions are checks rather than causal claims',()=>{
  const first=[row('2026-08-04'),row('2026-08-04')];
  const second=[1,2,3].map(value=>row('2026-09-06',{phone:value===1?'01012345678':'01023456789',financeStatus:'예',conditionRaw:'탁송'}));
  const result=analyze([item('2026-08-01','2026-08-31',first),item('2026-09-01','2026-09-30',second)]);
  assert.equal(result.memoCoverage.total,5);assert.equal(result.memoCoverage.withMemo,3);assert.equal(result.memoCoverage.share,60);
  assert.equal(result.memoCoverage.periods[0].share,0);assert.equal(result.memoCoverage.periods[1].share,100);
  assert.ok(result.suggestions.some(value=>value.kind==='weekday'&&value.detail.includes('화요일')&&value.detail.includes('일요일')));
  assert.ok(result.suggestions.some(value=>value.kind==='finance'&&value.detail.includes('+100.0%p')));
  assert.ok(result.suggestions.length<=4);assert.ok(result.suggestions.every(value=>value.caution.includes('20건 미만')));
});
