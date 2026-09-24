import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context={window:{}};
for(const file of ['report-insights.js','report-charts.js','report-layout.js','business-reports.js']){
  vm.runInNewContext(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),context);
}
const {JungcarBusinessReports:report,JungcarReportCharts:charts,JungcarReportInsights:insights}=context.window;
const row=(date,type='구매',finance='아니오')=>({inquiryDate:date,phone:'010-1111-2222',inquiryType:type,financeStatus:finance,models:['GV70'],conditionRaw:'출퇴근 가족'});
test('monthly charts share identical canvas dimensions for unequal category counts, including empty charts',()=>{
  const items=[{label:'2026년 8월',rows:[row('2026-08-01')],total:1},
    {label:'2026년 9월',rows:Array.from({length:14},(_,i)=>row('2026-09-01',i?'상세 문의 '+i:'구매')),total:14},
    {label:'기록 없음',rows:[],total:0}];
  const html=charts.monthlyPies(items);
  const dimensions=[...html.matchAll(/viewBox="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(dimensions.length,3);assert.equal(new Set(dimensions).size,1);
  assert.ok(html.includes('상세 문의 13'));assert.ok(!html.includes('NaN'));
});
test('disabled memo analysis never reads customer memo text and is absent from rendered reports',()=>{
  const input=[row('2026-08-01'),row('2026-09-01')];
  input.forEach(r=>Object.defineProperty(r,'conditionRaw',{get(){throw Error('Memo must not be read');}}));
  const data=report.build(input,'range',2026,0,'2026-10-01',{from:'2026-08-01',to:'2026-09-30',unit:'month'});
  const result=insights.analyze(data.items,{includeMemo:false});
  assert.equal(result.memoTerms.length,0);assert.equal(result.memoCoverage,null);
  assert.ok(!result.suggestions.some(s=>s.kind==='memo'));
  const html=report.reportHtml(data,'전체','테스트');
  assert.ok(!html.includes('메모 반복'));assert.ok(!html.includes('반복 표현'));assert.ok(html.includes('트렌드 변화'));
});
test('financing count increase and rate decrease are colored independently',()=>{
  const input=[...Array.from({length:4},(_,i)=>row('2026-08-01','구매',i<3?'예':'아니오')),
    ...Array.from({length:6},(_,i)=>row('2026-09-01','구매',i<4?'예':'아니오'))];
  const data=report.build(input,'range',2026,0,'2026-10-01',{from:'2026-08-01',to:'2026-09-30',unit:'month'});
  const html=report.reportHtml(data,'전체','테스트');
  assert.ok(html.includes('<span class="trend-up">+1건</span>'));
  assert.ok(html.includes('<span class="trend-down">-8.3%p</span>'));
  assert.match(report.delta(12,10,{unit:'건'}),/<small class="br-up">\+20.0%/);
  assert.match(report.delta(8,10,{unit:'건'}),/<small class="br-down">-20.0%/);
  assert.match(report.delta(10,10),/br-neutral/);
});
test('green and red change colors have readable contrast against white',()=>{
  const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  const luminance=hex=>{
    const rgb=hex.match(/../g).map(h=>parseInt(h,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
    return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
  };
  for(const name of ['up','down']){
    const hex=css.match(new RegExp('--trend-'+name+':#([0-9a-f]{6})'))[1];
    assert.ok(1.05/(luminance(hex)+.05)>=4.5);
    assert.ok(css.includes('.comparison-delta.'+(name==='up'?'increase':'decrease')));
  }
});
