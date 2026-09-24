import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context={window:{}};
for(const file of ['report-insights.js','report-charts.js','report-layout.js','business-reports.js'])vm.runInNewContext(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),context);
const report=context.window.JungcarBusinessReports,layout=context.window.JungcarReportLayout;
const rows=[...Array.from({length:4},(_,i)=>({inquiryDate:'2026-07-07',phone:'0101111000'+i,budgetMax:1000,financeStatus:i===0?'예':'아니오',visitStatus:i<2?'예':'아니오',inquiryType:'구매',models:['쏘나타']})),
  ...Array.from({length:8},(_,i)=>({inquiryDate:'2026-08-04',phone:'0102222000'+i,budgetMax:1500,financeStatus:i<3?'예':'아니오',visitStatus:i===0?'예':'아니오',inquiryType:'구매',models:['쏘나타']}))];
const build=(input=rows,extra={})=>report.build(input,'range',2026,0,'2026-10-01',{from:'2026-07-01',to:'2026-08-31',unit:'month',...extra});
test('report removes prose and English decorations but prints actual selected dates and aggregation',()=>{
  const html=report.reportHtml(build(),'전체','생성 시간');
  for(const text of ['집계 범위','선택 기간 비교','BUSINESS REVIEW','JUNGCAR','일평균 분모','유효한 입력 기준','조건 ·','생성 시간','부가 설명','표본이 적거나','광고 노출'])assert.ok(!html.includes(text),text);
  assert.match(html,/br-report-period[\s\S]*2026-07-01 ~ 2026-08-31[\s\S]*집계 단위 · 월별/);
  assert.ok(!html.includes('br-executive'));assert.ok(!html.includes('br-chart-note'));
});
test('customer composition includes absolute and relative changes for all six numeric fields',()=>{
  const html=report.periodTable(build().items),last=html.match(/<tr class="br-selected-row">(.*?)<\/tr>/)[1];
  assert.equal((last.match(/br-stat-cell/g)||[]).length,6);
  assert.equal((last.match(/br-stat-delta/g)||[]).length,6);
  assert.equal((last.match(/br-stat-rate/g)||[]).length,6);
  for(const value of ['+4건','+4명','+500만원','+2건','-1건','+100.0%','+50.0%','+200.0%','-50.0%'])assert.ok(last.includes(value),value);
  assert.ok(last.includes('<strong>3건</strong>'));assert.ok(last.includes('37.5%'));assert.ok(last.includes('12.5%'));
});
test('weekday table compares each named weekday with the same weekday in previous period',()=>{
  const html=report.reportHtml(build(),'','');
  const table=html.match(/<table class="br-table br-weekday-table">([\s\S]*?)<\/table>/)[1];
  assert.equal((table.match(/br-stat-delta/g)||[]).length,14);
  assert.equal((table.match(/br-stat-rate/g)||[]).length,14);
  assert.ok(table.includes('+4건'));assert.ok(table.includes('+100.0%'));
  assert.ok(!table.includes('Infinity'));assert.ok(!table.includes('NaN'));
});
test('zero and missing baselines use dashes rather than invented percentage changes',()=>{
  assert.match(report.changeCell(4,0,{unit:'건',hasPrevious:true}),/trend-up">\+4건/);
  assert.match(report.changeCell(4,0,{unit:'건',hasPrevious:true}),/br-stat-rate[\s\S]*trend-neutral">—/);
  assert.match(report.changeCell(0,0,{hasPrevious:true}),/0.0%/);
  assert.match(report.changeCell(null,500,{unit:'만원',hasPrevious:true}),/<strong>—<\/strong>/);
  assert.match(report.changeCell(5,undefined,{hasPrevious:false}),/br-stat-delta[\s\S]*>—/);
});
test('continued table pages preserve previous selected period as their baseline',()=>{
  const items=build().items,html=report.periodTable([items[1]],'month',items[0]);
  assert.ok(html.includes('+4건'));assert.ok(html.includes('+100.0%'));
});
test('header excludes unchecked months, separates gaps and clips unfinished periods',()=>{
  const input=[...rows,{...rows[0],inquiryDate:'2026-09-01'}];
  const data=build(input,{to:'2026-09-30',selectedPeriods:['2026-07-01','2026-09-01']});
  assert.deepEqual(JSON.parse(JSON.stringify(layout.reportRanges(data))),[{from:'2026-07-01',to:'2026-07-31'},{from:'2026-09-01',to:'2026-09-30'}]);
  const partial=report.build(input,'range',2026,0,'2026-09-24',{from:'2026-07-01',to:'2026-09-30',unit:'month',selectedPeriods:['2026-08-01','2026-09-01']});
  assert.deepEqual(JSON.parse(JSON.stringify(layout.reportRanges(partial))),[{from:'2026-08-01',to:'2026-09-24'}]);
});
