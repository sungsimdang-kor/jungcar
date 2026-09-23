import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const functions=['filteredAnalysisRows','comparisonMetrics','comparisonMetric'];
const context={leads:[],analysisFilters:{},parseDate:value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')?new Date(value):null,buildCustomers:rows=>[...new Set(rows.map(r=>r.phone))]};
for(const name of functions){const start=source.indexOf(`function ${name}(`),end=source.indexOf('\nfunction ',start+1);vm.runInNewContext(source.slice(start,end),context);}
const rows=[{id:'a',phone:'one',inquiryDate:'2026-09-01',models:['GV70'],inquiryType:'구매',budgetMax:1000,financeStatus:'예',visitStatus:'아니오'},
 {id:'b',phone:'one',inquiryDate:'2026-09-03',models:['GV80'],inquiryType:'판매',budgetMax:null,financeStatus:'아니오',visitStatus:'예'}];
test('comparison reuses analysis filters without mutating the other cohort',()=>{context.leads=rows;assert.equal(context.filteredAnalysisRows({model:'GV',inquiryType:'구매'}).length,1);assert.equal(context.filteredAnalysisRows({}).length,2);assert.equal(context.filteredAnalysisRows({financeStatus:'예',dateFrom:'2026-09-02'}).length,0);});
test('date filters exclude consultations without a date',()=>{context.leads=[...rows,{id:'missing',phone:'two'}];assert.equal(context.filteredAnalysisRows({dateTo:'2026-09-03'}).length,2);assert.equal(context.filteredAnalysisRows({dateFrom:'2026-09-03',dateTo:'2026-09-03'}).length,1);});
test('unique customers, calendar days, populated budgets and rates have explicit denominators',()=>{const m=context.comparisonMetrics(rows,{});assert.equal(m.customers,1);assert.equal(m.total,2);assert.equal(m.days,3);assert.equal(m.daily,2/3);assert.equal(m.averageBudget,1000);assert.equal(m.finance,50);assert.equal(m.visit,50);});
test('specified calendar periods include days without calls',()=>{const m=context.comparisonMetrics(rows,{dateFrom:'2026-09-01',dateTo:'2026-09-10'});assert.equal(m.days,10);assert.equal(m.daily,0.2);});
test('empty conditions do not produce NaN or misleading zero-percent rates',()=>{const m=context.comparisonMetrics([],{});assert.equal(m.finance,null);assert.equal(m.averageBudget,null);assert.equal(m.daily,null);const html=context.comparisonMetric('비율',null,50,'%',1,true);assert.ok(!html.includes('NaN'));assert.ok(html.includes('비교할 데이터 없음'));});
test('percentage-point differences and zero baselines are distinguished',()=>{assert.ok(context.comparisonMetric('비율',20,50,'%',1,true).includes('+30.0%p'));assert.ok(context.comparisonMetric('건수',0,5,'건').includes('증감률 계산 불가'));});
test('PDF page slices cover every source pixel without overlap or gaps',()=>{const c={window:{}};vm.runInNewContext(fs.readFileSync(new URL('../report-export.js',import.meta.url),'utf8'),c);const ranges=c.window.JungcarReportExport.pageRanges(2800,1000,[650,1450,2300]);assert.equal(ranges[0][0],0);assert.equal(ranges.at(-1)[1],2800);ranges.forEach(([start,end],i)=>{assert.ok(end>start&&end-start<=1000);if(i)assert.equal(start,ranges[i-1][1]);});});
