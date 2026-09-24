/* Read-only presentation. All panels share the same checked periods. */
(() => {
  function render(data,filterSummary,createdAt,helpers){
    const {number:n,esc:e,delta,changeCell,chart,periodTable,groups,unitNames}=helpers;
    const {items,unit,current:m,context:c}=data,tabular=unit==='day'||unit==='week';
    const charts=window.JungcarReportCharts;
    const insights=data.insights||window.JungcarReportInsights.analyze(items,{includeMemo:false});
    const pages=[],selectedRows=items.flatMap(p=>p.rows);
    const heading=title=>'<header class="br-page-heading"><h2>'+e(title)+'</h2></header>';
    const section=title=>'<div class="br-section-heading"><div><h3>'+e(title)+'</h3></div></div>';
    const kpi=(label,value,suffix,decimals=0)=>'<article class="br-kpi"><h3>'+label+'</h3><strong>'+n(value,decimals)+'<span>'+(value==null?'':suffix)+'</span></strong></article>';
    const intervals=reportRanges(data);
    const periodHeader='<div class="br-report-period"><span>기간</span>'+intervals.map(p=>'<strong>'+e(p.from+' ~ '+p.to)+'</strong>').join('')+'<b>집계 단위 · '+unitNames[unit]+'</b></div>';
    pages.push('<header class="br-cover br-cover-clean"><h2>중카TV '+unitNames[unit]+' 분석 리포트</h2>'+periodHeader+'</header>'+
      '<div class="br-kpis">'+kpi('상담 수',m.total,'건')+kpi('고객 수',m.customers,'명')+kpi('일평균 상담',m.daily,'건',1)+kpi('평균 최대 예산',m.averageBudget,'만원')+kpi('할부 조회 요청률',m.finance,'%',1)+kpi('방문·예약률',m.visit,'%',1)+'</div>'+
      (!items.length?'<p class="br-empty">입력된 상담 기록이 없습니다.</p>':tabular?'':'<section class="br-trend">'+section('상담량 변화 추이')+chart(items,unitNames[unit]+' 상담 수')+'</section>'));
    if(!items.length)return finish();

    for(let offset=0;offset<items.length;offset+=7){
      const batch=items.slice(offset,offset+7);
      pages.push(heading('상담과 고객 구성')+periodTable(batch,unit,items[offset-1]));
      pages.push(heading('요일별 상담량')+weekdayTable(insights.periods.slice(offset,offset+7),insights.periods[offset-1]));
    }
    if(!tabular){
      if(unit==='month')pages.push(heading('월별 문의 종류 구성')+charts.monthlyPies(items));
      else pages.push(heading('분기별 문의 종류 구성')+'<div class="br-demand-grid"><section>'+charts.demandBars(items,'inquiryType',8,0,4)+'</section><section>'+charts.demandBars(items,'inquiryType',8,4,8)+'</section></div>');
      pages.push(heading('고객 수요 · 희망 차종')+
        '<div class="br-demand-grid"><section>'+charts.demandBars(items,'models',10,0,5)+'</section><section>'+charts.demandBars(items,'models',10,5,10)+'</section></div>');
    }else{
      for(let offset=0;offset<items.length;offset+=6){
        const batch=items.slice(offset,offset+6);
        pages.push(heading('고객 수요 · 수치표')+
          section('희망 차종')+
          charts.categoryTable(batch,'models',10,groups(selectedRows,'models').slice(0,10).map(p=>p[0])));
        pages.push(heading('상담 구성 · 수치표')+
          section('문의 종류')+
          charts.categoryTable(batch,'inquiryType',8,groups(selectedRows,'inquiryType').slice(0,8).map(p=>p[0])));
      }
    }
    const transitions=insights.comparisons||[];
    if(tabular){
      for(let offset=0;offset<Math.max(1,transitions.length);offset+=10){
        pages.push(heading('기간별 변화 수치')+
          transitionTable(transitions.slice(offset,offset+10)));
      }
    }else{
      pages.push(heading('트렌드 변화')+
        transitionCards(transitions)+section('첫 선택 기간부터 마지막까지')+
        transitionTable(items.length>2?window.JungcarReportInsights.analyze([items[0],items.at(-1)],{includeMemo:false}).comparisons:transitions));
    }
    return finish();

    function finish(){
      return pages.map((html,i)=>'<section class="br-page" data-report-page>'+html+'<footer class="br-footer"><span>'+n(i+1)+' / '+n(pages.length)+'</span></footer></section>').join('');
    }
    function table(headers,rows,cls=''){
      return '<div class="br-table-scroll"><table class="br-table '+cls+'"><thead><tr>'+headers.map(h=>'<th>'+e(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>';
    }
    function weekdayTable(periods,previous=null){
      return table(['기간','월요일','화요일','수요일','목요일','금요일','토요일','일요일'],periods.map((p,index)=>{
        const prior=index?periods[index-1]:previous;
        return '<tr><th>'+e(p.label)+'</th>'+p.weekdays.map((w,i)=>'<td>'+changeCell(w.count,prior?.weekdays[i].count,{unit:'건',sub:'일평균 '+n(w.perDay,1)+'건',hasPrevious:!!prior})+'</td>').join('')+'</tr>';
      }),'br-weekday-table');
    }
    function transitionTable(list){
      if(!list.length)return '<p class="br-empty">변화를 비교하려면 기록이 있는 기간을 2개 이상 선택해 주세요.</p>';
      return table(['기간 변화','상담 증감','일평균 증감','할부 요청 건수','할부 요청률 변화','방문·예약률 변화'],list.map(t=>'<tr><th>'+e(t.fromLabel)+'<br>→ '+e(t.toLabel)+'</th><td>'+delta(t.total.after,t.total.before,{unit:'건'})+'</td><td>'+delta(t.daily.after,t.daily.before,{unit:'건',decimals:1})+'</td><td>'+signed(t.finance.countChange,0,'건')+'</td><td>'+signed(t.finance.percentagePoints,1,'%p')+'</td><td>'+signed(t.visit.percentagePoints,1,'%p')+'</td></tr>'));
    }
    function tone(value){return value==null?'trend-neutral':value>0?'trend-up':value<0?'trend-down':'trend-neutral';}
    function signed(value,decimals=0,unit=''){return '<span class="'+tone(value)+'">'+(value==null?'—':(value>0?'+':'')+n(value,decimals)+unit)+'</span>';}
    function changed(before,after,unit='',decimals=0){return n(before,decimals)+' → <span class="'+tone(before==null||after==null?null:after-before)+'">'+n(after,decimals)+unit+'</span>';}
    function transitionCards(list){
      if(!list.length)return '<p class="br-empty">트렌드를 비교하려면 기간을 2개 이상 선택해 주세요.</p>';
      return '<div class="br-insight-grid">'+list.map(t=>{
        const names=list=>list.length>3?list.length+'개 요일 동률':list.join(' · ');
        const from=names(t.weekday.before||[]),to=names(t.weekday.after||[]);
        const model=t.models.find(p=>Math.abs(p.percentagePoints)>=.1),type=t.inquiryTypes.find(p=>Math.abs(p.percentagePoints)>=.1);
        const changeLine=(label,value)=>value?'<div><dt>'+label+' · '+e(value.label)+'</dt><dd>'+n(value.shareBefore,1)+'% → <span class="'+tone(value.percentagePoints)+'">'+n(value.shareAfter,1)+'%</span> ('+signed(value.percentagePoints,1,'%p')+')</dd></div>':'';
        return '<article class="br-insight-card"><h3>'+e(t.fromLabel)+' → '+e(t.toLabel)+'</h3><dl><div><dt>하루 평균 최다 문의 요일</dt><dd>'+e(from||'—')+' → '+e(to||'—')+'</dd></div><div><dt>할부 조회 요청</dt><dd>'+changed(t.finance.beforeCount,t.finance.afterCount,'건')+' / '+signed(t.finance.percentagePoints,1,'%p')+'</dd></div><div><dt>일평균 상담</dt><dd>'+changed(t.daily.before,t.daily.after,'건',1)+'</dd></div>'+changeLine('비중 변화가 가장 큰 차종',model)+changeLine('비중 변화가 가장 큰 문의 종류',type)+'</dl></article>';
      }).join('')+'</div>';
    }
  }
  function reportRanges(data){
    const {items,unit,context:c}=data;
    if(!items.length||unit==='day'||unit==='week')return [{from:c.current.from,to:c.cutoff>=c.current.from?c.cutoff:c.current.to}];
    const merged=[];
    for(const item of items){
      const last=merged.at(-1);
      if(last&&Date.parse(item.start+'T00:00:00Z')-Date.parse(last.to+'T00:00:00Z')<=86400000)last.to=item.cutoff;
      else merged.push({from:item.start,to:item.cutoff});
    }
    return merged;
  }
  window.JungcarReportLayout={render,reportRanges};
})();
