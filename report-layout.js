/* Read-only presentation. All panels share the same checked periods. */
(() => {
  function render(data,filterSummary,createdAt,helpers){
    const {number:n,esc:e,delta,chart,periodTable,groups,unitNames}=helpers;
    const {items,unit,current:m,context:c}=data,tabular=unit==='day'||unit==='week';
    const charts=window.JungcarReportCharts;
    const insights=data.insights||window.JungcarReportInsights.analyze(items,{includeMemo:false});
    const pages=[],selectedRows=items.flatMap(p=>p.rows),titles=items.map(p=>p.label);
    const heading=(title,description='')=>'<header class="br-page-heading"><span>JUNGCAR TV · '+unitNames[unit]+'</span><h2>'+e(title)+'</h2><p>'+e(description)+'</p></header>';
    const section=(title,note='')=>'<div class="br-section-heading"><div><h3>'+e(title)+'</h3></div><p>'+e(note)+'</p></div>';
    const tags='<div class="br-selected-periods">'+items.map(p=>'<span>'+e(p.label)+(p.partial?' · 부분 집계':'')+'</span>').join('')+'</div>';
    const partial=items.some(p=>p.partial);
    const warning='<p class="br-chart-note">'+(partial?'진행 중이거나 기간 경계에서 잘린 부분 집계가 포함되어 있습니다. ':'')+'집계 일수가 다를 수 있으므로 건수와 함께 일평균·비중을 확인하세요. 비교는 체크한 기간의 시간순이며, 생략한 기간이 있으면 바로 직전 달·분기와 다를 수 있습니다.</p>';
    const kpi=(label,value,suffix,decimals=0)=>'<article class="br-kpi"><h3>'+label+'</h3><strong>'+n(value,decimals)+'<span>'+(value==null?'':suffix)+'</span></strong></article>';
    const selectedText=titles.length<=4?titles.join(' · '):items.length?items[0].label+' ~ '+items.at(-1).label:'선택된 기록 없음';
    pages.push('<header class="br-cover"><div><span class="br-eyebrow">JUNGCAR TV · BUSINESS REVIEW</span><h2>중카TV '+unitNames[unit]+' 분석 리포트</h2><p>'+e(tabular?'기간별 수치 보고서':'선택 기간 비교')+'</p></div><div class="br-cover-meta"><strong>'+e(c.current.from+' ~ '+c.current.to)+'</strong><span>조회 범위 · '+e(createdAt)+' 생성</span></div></header>'+
      '<div class="br-filter-note">조건 · '+e(filterSummary)+' / '+(tabular?'기록 없는 구간은 표에서 생략':'체크한 기간만 집계')+'</div>'+tags+
      '<div class="br-kpis">'+kpi('상담 수',m.total,'건')+kpi('중복 제외 고객 수',m.customers,'명')+kpi('일평균 상담',m.daily,'건',1)+kpi('평균 최대 예산',m.averageBudget,'만원')+kpi('할부 조회 요청률',m.finance,'%',1)+kpi('방문·예약률',m.visit,'%',1)+'</div>'+
      '<section class="br-executive"><h3>집계 범위</h3><p>'+e(items.length?selectedText:'입력된 상담 기록이 없습니다. 기간을 선택하거나 필터를 확인해 주세요.')+'</p><div><span>일평균 분모 '+n(data.selectedDays)+'일 · 상담 없는 날 포함</span><span>예산 평균 '+n(m.budgetCount)+'건의 유효한 입력 기준</span><span>중복 고객은 전체 선택 기간에서 1명으로 집계</span></div></section>'+
      (tabular?'<div class="br-quality"><h3>수치표 중심 보고서</h3><p class="br-chart-note">기간별 실적, 요일별 상담량, 희망 차종과 문의 종류를 다음 페이지의 수치표로 제공합니다. 일별·주별 보고서에는 비교 그래프를 사용하지 않습니다.</p></div>':'<section class="br-trend">'+section('상담량 변화 추이','실제 연도와 월·분기로 표시 · 체크한 기간만 포함')+chart(items,unitNames[unit]+' 상담 수')+'</section>')+warning);
    if(!items.length)return finish();

    // A bounded page contains every selected period exactly once, including long daily reports.
    for(let offset=0;offset<items.length;offset+=10){
      const batch=items.slice(offset,offset+10);
      pages.push(heading(unitNames[unit]+' 실적',batch[0].label+' ~ '+batch.at(-1).label)+
        section('상담과 고객 구성','증감은 시간순으로 직전에 선택한 구간과 비교 · 할부·방문은 토글 활성화 기준')+
        periodTable(batch,unit,items[offset-1])+warning+
        section('요일별 상담량','건수 / 해당 요일 하루 평균 · 평균 계산에는 상담 없는 날도 포함')+
        weekdayTable(insights.periods.slice(offset,offset+10)));
    }
    if(!tabular){
      if(unit==='month')pages.push(heading('월별 문의 종류 구성','범주명과 선을 연결했습니다. 같은 문의 종류는 모든 월에 같은 색으로 표시합니다.')+charts.monthlyPies(items)+warning);
      else pages.push(heading('분기별 문의 종류 구성','분기별 문의 건수와 비중 비교')+'<div class="br-demand-grid"><section>'+charts.demandBars(items,'inquiryType',8,0,4)+'</section><section>'+charts.demandBars(items,'inquiryType',8,4,8)+'</section></div>'+warning);
      pages.push(heading('고객 수요 · 희망 차종','선택한 기간의 합산 상위 10개 · 복수 차종은 각각 집계')+
        '<div class="br-demand-grid"><section>'+charts.demandBars(items,'models',10,0,5)+'</section><section>'+charts.demandBars(items,'models',10,5,10)+'</section></div>'+warning);
    }else{
      for(let offset=0;offset<items.length;offset+=6){
        const batch=items.slice(offset,offset+6);
        pages.push(heading('고객 수요 · 수치표',batch[0].label+' ~ '+batch.at(-1).label)+
          section('희망 차종','선택 전체 기간의 상위 10개 · 상담당 동일 차종은 1회 · 괄호는 해당 구간 상담 대비 비중')+
          charts.categoryTable(batch,'models',10,groups(selectedRows,'models').slice(0,10).map(p=>p[0])));
        pages.push(heading('상담 구성 · 수치표',batch[0].label+' ~ '+batch.at(-1).label)+
          section('문의 종류','선택 전체 기간의 상위 8개 · 괄호는 해당 구간 상담 대비 비중')+
          charts.categoryTable(batch,'inquiryType',8,groups(selectedRows,'inquiryType').slice(0,8).map(p=>p[0])));
      }
    }
    const transitions=insights.comparisons||[];
    if(tabular){
      for(let offset=0;offset<Math.max(1,transitions.length);offset+=10){
        pages.push(heading('기간별 변화 수치','바로 직전에 선택된 구간 대비 · 건수와 비율 변화를 구분합니다.')+
          transitionTable(transitions.slice(offset,offset+10))+warning);
      }
    }else{
      pages.push(heading('트렌드 변화와 운영 참고','통계적 인과관계가 아닌 상담 기록의 변화입니다. 광고 조정 전 표본과 집계 일수를 확인하세요.')+
        transitionCards(transitions)+section('첫 선택 기간부터 마지막까지','중간 변화는 위의 각 구간 비교를 참고하세요.')+
        transitionTable(items.length>2?window.JungcarReportInsights.analyze([items[0],items.at(-1)],{includeMemo:false}).comparisons:transitions)+warning);
    }
    return finish();

    function finish(){
      return pages.map((html,i)=>'<section class="br-page" data-report-page>'+html+'<footer class="br-footer"><span>중카TV · 내부 업무용 / '+unitNames[unit]+' 집계</span><span>'+n(i+1)+' / '+n(pages.length)+'</span></footer></section>').join('');
    }
    function table(headers,rows,cls=''){
      return '<div class="br-table-scroll"><table class="br-table '+cls+'"><thead><tr>'+headers.map(h=>'<th>'+e(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>';
    }
    function weekdayTable(periods){
      return table(['기간','월요일','화요일','수요일','목요일','금요일','토요일','일요일','하루 평균 최다 요일'],periods.map(p=>'<tr><th>'+e(p.label)+'</th>'+p.weekdays.map(w=>'<td>'+n(w.count)+'건 / '+n(w.perDay,1)+'</td>').join('')+'<td>'+e((p.peakWeekdays||[]).join(' · ')||'—')+'</td></tr>'));
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
        const single=t.weekday.before.length===1&&t.weekday.after.length===1;
        let advice=!single?'최다 요일이 동률이므로 특정 요일로 광고를 집중하기보다 추가 기록을 확인하세요.':t.weekday.changed?'응대 인력과 광고 노출 요일을 '+to+' 중심으로 검토해 보세요.':'상담 집중 요일을 유지 관찰하고 응대 공백을 점검해 보세요.';
        if(t.finance.percentagePoints>=5)advice+=' 할부 절차·필요 서류 안내를 보강할지 검토할 수 있습니다.';
        if(t.visit.percentagePoints<0&&t.total.change>0)advice+=' 문의량 증가에 비해 방문 비중이 낮아져, 문의 후 방문 안내 과정을 확인할 필요가 있습니다.';
        const model=t.models.find(p=>Math.abs(p.percentagePoints)>=.1),type=t.inquiryTypes.find(p=>Math.abs(p.percentagePoints)>=.1);
        const changeLine=(label,value)=>value?'<div><dt>'+label+' · '+e(value.label)+'</dt><dd>'+n(value.shareBefore,1)+'% → <span class="'+tone(value.percentagePoints)+'">'+n(value.shareAfter,1)+'%</span> ('+signed(value.percentagePoints,1,'%p')+')</dd></div>':'';
        return '<article class="br-insight-card"><h3>'+e(t.fromLabel)+' → '+e(t.toLabel)+'</h3><dl><div><dt>하루 평균 최다 문의 요일</dt><dd>'+e(from||'—')+' → '+e(to||'—')+'</dd></div><div><dt>할부 조회 요청</dt><dd>'+changed(t.finance.beforeCount,t.finance.afterCount,'건')+' / '+signed(t.finance.percentagePoints,1,'%p')+'</dd></div><div><dt>일평균 상담</dt><dd>'+changed(t.daily.before,t.daily.after,'건',1)+'</dd></div>'+changeLine('비중 변화가 가장 큰 차종',model)+changeLine('비중 변화가 가장 큰 문의 종류',type)+'</dl><p>'+e(advice)+'</p><small>표본이 적거나 기간이 미완료인 경우 탐색적 참고로만 사용하세요.</small></article>';
      }).join('')+'</div>';
    }
  }
  window.JungcarReportLayout={render};
})();
