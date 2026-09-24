import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context={window:{}};
vm.runInNewContext(fs.readFileSync(new URL('../report-charts.js',import.meta.url),'utf8'),context);
const charts=context.window.JungcarReportCharts;
const item=(label,rows,extra={})=>({label,total:rows.length,rows,start:'2026-08-01',cutoff:'2026-08-31',...extra});
const row=(inquiryType='구매',models=['쏘나타'])=>({inquiryType,models});
test('monthly pies name actual periods and connect every category to its count and share',()=>{
  const html=charts.monthlyPies([item('2026년 8월',[row(),row('판매')]),item('2026년 9월',[row('판매')],{partial:true})]);
  assert.equal((html.match(/<polyline /g)||[]).length,3);
  assert.ok(html.includes('2026년 8월'));assert.ok(html.includes('2026년 9월'));assert.ok(html.includes('50.0%'));assert.ok(html.includes('부분 집계'));
  assert.ok(!html.includes('A ·'));assert.ok(!html.includes('B ·'));assert.ok(!html.includes('비교 기준'));
});
test('single-category and 99-percent pies retain true area without invalid SVG',()=>{
  const single=charts.monthlyPies([item('2026년 8월',[row(),row()])]);
  assert.ok(single.includes('100.0%'));assert.equal((single.match(/<polyline /g)||[]).length,1);
  const dominant=charts.monthlyPies([item('2026년 8월',[...Array.from({length:99},()=>row()),row('판매')])]);
  assert.ok(dominant.includes('99.0%'));assert.ok(dominant.includes('1.0%'));assert.equal((dominant.match(/<path /g)||[]).length,2);
  assert.ok(!/NaN|Infinity|undefined/.test(dominant));
});
test('tiny adjacent segments receive nonoverlapping, in-bounds leader labels',()=>{
  const segments=Array.from({length:16},(_,i)=>({label:`유형${i}`,start:-1.5+i*.005,end:-1.5+(i+1)*.005,value:1}));
  const height=800,labels=charts.layoutPieLabels(segments,height/2,height).sort((a,b)=>a.y-b.y);
  for(let i=0;i<labels.length;i++){
    assert.ok(labels[i].y-labels[i].height/2>=17);assert.ok(labels[i].y+labels[i].height/2<=height-17);
    if(i)assert.ok(labels[i].y-labels[i].height/2>=labels[i-1].y+labels[i-1].height/2+10);
  }
  const html=charts.monthlyPies([item('2026년 8월',[...Array.from({length:99},()=>row()),...segments.map(p=>row(p.label))])]);
  assert.equal((html.match(/<polyline /g)||[]).length,17);assert.ok(!/NaN|Infinity/.test(html));
});
test('category colors are deterministic across period order and subsets',()=>{
  const color=charts.categoryColor('방문 예약');assert.equal(charts.categoryColor('방문 예약'),color);
  const one=charts.monthlyPies([item('2026년 8월',[row('판매'),row()])]),two=charts.monthlyPies([item('2026년 9월',[row()])]);
  assert.ok(one.includes(charts.categoryColor('구매')));assert.ok(two.includes(charts.categoryColor('구매')));
});
test('demand categories deduplicate models within a consultation and use one scale for split pages',()=>{
  const items=[item('2026년 1분기',[row('구매',['포터','포터']),row('구매',['포터'])]),item('2026년 2분기',[row('구매',['봉고'])]),item('2026년 3분기',[row('구매',['포터'])]),item('2026년 4분기',[row('구매',['쏘나타'])])];
  const data=charts.categoryData(items,'models',10);assert.equal(data.find(p=>p.label==='포터').counts[0],2);
  const first=charts.demandBars(items,'models',10,0,1),second=charts.demandBars(items,'models',10,1,10);
  assert.ok(first.includes('width:100%'));assert.ok(second.includes('width:50%'));assert.ok(!second.includes('width:100%'));
  for(const period of items)assert.ok(second.includes(period.label));
  assert.equal((first.match(/class="rc-demand-date"/g)||[]).length,4);
});
test('day/week category tables contain values and dates, never comparison charts',()=>{
  const html=charts.categoryTable([item('2026-08-01',[row()]),item('2026-08-02',[row('판매')])],'inquiryType',8);
  assert.ok(html.includes('2026-08-01'));assert.ok(html.includes('2026-08-02'));assert.ok(html.includes('100.0%'));assert.ok(html.includes('0.0%'));assert.ok(html.includes('전체 상담'));
  assert.ok(!html.includes('<svg'));assert.ok(!html.includes('rc-demand-track'));
});
test('category tables retain the same global categories across paginated date batches',()=>{
  const html=charts.categoryTable([item('2026-08-01',[row('구매',['포터'])])],'models',10,['쏘나타','포터','봉고']);
  assert.ok(html.indexOf('쏘나타')<html.indexOf('포터'));assert.ok(html.indexOf('포터')<html.indexOf('봉고'));
  assert.equal((html.match(/0건 <small>\(0.0%\)<\/small>/g)||[]).length,2);
});
test('all renderers escape labels, dates, model names and long category text',()=>{
  const unsafe='<img src=x onerror="alert(1)">',items=[item(unsafe,[row(unsafe,[unsafe])],{start:unsafe})];
  for(const html of [charts.monthlyPies(items),charts.demandBars(items),charts.categoryTable(items)]){
    assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;img'));assert.ok(!/NaN|Infinity/.test(html));
  }
});
test('empty, missing inquiry-type and zero-denominator periods are explicit',()=>{
  for(const html of [charts.monthlyPies([]),charts.demandBars([]),charts.categoryTable([])])assert.ok(html.includes('상담 기록이 없습니다'));
  const html=charts.monthlyPies([item('2026년 8월',[row('')])]);assert.ok(html.includes('미입력'));
  const zero=charts.demandBars([item('2026년 8월',[row()],{total:0})]);assert.ok(zero.includes('0.0%'));assert.ok(!/NaN|Infinity/.test(zero));
});
