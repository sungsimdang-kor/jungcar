/* Read-only reporting: calculations use the current server-confirmed CRM snapshot. */
(() => {
  const DAY=86400000;
  const state={mode:'month',year:null,period:null,from:'',to:'',filters:{}};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=(value,decimals=0)=>value==null?'—':Number(value).toLocaleString('ko-KR',{maximumFractionDigits:decimals,minimumFractionDigits:decimals});
  const iso=date=>date.toISOString().slice(0,10);
  const time=value=>Date.parse(value+'T00:00:00Z');
  const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&Number.isFinite(time(value))&&iso(new Date(time(value)))===value;
  const days=(from,to)=>Math.max(0,Math.round((time(to)-time(from))/DAY)+1);
  const shiftDay=(date,offset)=>iso(new Date(time(date)+offset*DAY));
  function period(mode,year,index){
    const month=mode==='quarter'?(index-1)*3:index-1,length=mode==='quarter'?3:1;
    const start=new Date(Date.UTC(year,month,1)),end=new Date(Date.UTC(year,month+length,0));
    const normalizedYear=start.getUTCFullYear(),normalizedIndex=mode==='quarter'?Math.floor(start.getUTCMonth()/3)+1:start.getUTCMonth()+1;
    return {mode,year:normalizedYear,index:normalizedIndex,from:iso(start),to:iso(end),label:`${normalizedYear}년 ${normalizedIndex}${mode==='quarter'?'분기':'월'}`,short:`${String(normalizedYear).slice(2)}.${mode==='quarter'?'Q':''}${String(normalizedIndex).padStart(mode==='quarter'?1:2,'0')}`};
  }
  function periodContext(mode,year,index,asOf){
    const current=period(mode,year,index),previous=period(mode,year,index-1),lastYear=period(mode,year-1,index);
    const partial=current.from<=asOf&&current.to>asOf,future=current.from>asOf;
    const cutoff=current.to<asOf?current.to:asOf,elapsed=future?0:days(current.from,cutoff);
    const comparisonEnd=p=>partial?shiftDay(p.from,Math.min(elapsed,days(p.from,p.to))-1):p.to;
    return {current,previous,lastYear,cutoff,partial,future,elapsed,previousEnd:comparisonEnd(previous),lastYearEnd:comparisonEnd(lastYear)};
  }
  function rangeContext(from,to,asOf){
    if(!validDate(from)||!validDate(to)||from>to)throw new Error('시작일과 종료일을 확인해 주세요.');
    const length=days(from,to),previousFrom=shiftDay(from,-length),cutoff=to<asOf?to:asOf;
    const partial=to>asOf&&from<=asOf,elapsed=from>asOf?0:days(from,cutoff);
    const priorYear=value=>{const y=Number(value.slice(0,4))-1,m=Number(value.slice(5,7)),d=Number(value.slice(8,10));return iso(new Date(Date.UTC(y,m-1,Math.min(d,new Date(Date.UTC(y,m,0)).getUTCDate()))));};
    return {current:{mode:'range',from,to,label:`${from} ~ ${to}`},previous:{from:previousFrom,to:shiftDay(from,-1)},lastYear:{from:priorYear(from),to:priorYear(to)},cutoff,partial,future:from>asOf,elapsed,
      previousEnd:partial?shiftDay(previousFrom,elapsed-1):shiftDay(from,-1),lastYearEnd:priorYear(cutoff)};
  }
  const range=(rows,from,to)=>rows.filter(r=>validDate(r.inquiryDate)&&r.inquiryDate>=from&&r.inquiryDate<=to);
  function metrics(rows,from,to){
    const budgets=rows.map(r=>Number(r.budgetMax)).filter(n=>Number.isFinite(n)&&n>0);
    const contacts=new Set(rows.map(r=>String(r.phone||'').replace(/\D/g,'')).filter(Boolean));
    const count=rows.length;
    return {total:count,customers:contacts.size,daily:days(from,to)>0?count/days(from,to):null,
      averageBudget:budgets.length?budgets.reduce((a,b)=>a+b,0)/budgets.length:null,budgetCount:budgets.length,
      finance:count?rows.filter(r=>r.financeStatus==='예').length/count*100:null,
      visit:count?rows.filter(r=>r.visitStatus==='예').length/count*100:null};
  }
  function visibleSeries(rows,mode,from,to){
    const firstYear=Number(from.slice(0,4)),firstMonth=Number(from.slice(5,7));
    const lastYear=Number(to.slice(0,4)),lastMonth=Number(to.slice(5,7));
    const divisor=mode==='quarter'?3:1,firstIndex=Math.floor((firstMonth-1)/divisor)+1,lastIndex=Math.floor((lastMonth-1)/divisor)+1;
    const length=(lastYear-firstYear)*(12/divisor)+lastIndex-firstIndex+1;
    if(length<=0)return [];
    return Array.from({length},(_,i)=>{
      const p=period(mode,firstYear,firstIndex+i),start=p.from<from?from:p.from,cutoff=p.to>to?to:p.to;
      const subset=range(rows,start,cutoff),prior=period(mode,p.year,p.index-1);
      return {...p,...metrics(subset,start,cutoff),start,cutoff,partial:start!==p.from||cutoff!==p.to,hasRecords:subset.length>0,previousTotal:range(rows,prior.from,prior.to).length};
    }).filter(p=>p.hasRecords);
  }
  function delta(current,previous,{rate=false,unit='',decimals=0}={}){
    if(current==null||previous==null)return '<span class="br-neutral">비교 데이터 없음</span>';
    const diff=current-previous,sign=diff>0?'+':'';
    if(rate)return `<span class="${diff>0?'br-up':diff<0?'br-down':'br-neutral'}">${sign}${number(diff,1)}%p</span>`;
    const change=previous===0?(current===0?'변화 없음':'기준값 0 · 증감률 산출 제외'):`${diff>0?'+':''}${number(diff/previous*100,1)}%`;
    return `<span class="${diff>0?'br-up':diff<0?'br-down':'br-neutral'}">${sign}${number(diff,decimals)}${unit}</span><small>${change}</small>`;
  }
  function groups(rows,key){
    const counts=new Map();
    rows.forEach(row=>{const values=key==='models'?[...new Set((row.models||[]).filter(Boolean))]:[row[key]||'미입력'];values.forEach(value=>counts.set(value,(counts.get(value)||0)+1));});
    return [...counts].sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]),'ko'));
  }
  function chart(items,title){
    if(!items.length)return '<p class="br-empty">선택 기간에 표시할 상담 기록이 없습니다.</p>';
    if(items.length===1){const p=items[0];return `<div class="br-single-period"><div><strong>${esc(p.label)}${p.partial?' · 부분 집계':''}</strong><p>${p.start} ~ ${p.cutoff} · 기록이 있는 ${p.mode==='quarter'?'분기':'월'} 1개</p></div><b>${number(p.total)}<span>건</span></b></div>`;}
    const W=1200,H=280,left=55,right=28,top=35,bottom=55,max=Math.max(3,Math.ceil(Math.max(0,...items.map(p=>p.total))/3)*3);
    const plotH=H-top-bottom,step=(W-left-right)/items.length;
    const grid=Array.from({length:4},(_,i)=>{const y=top+plotH*i/3;return `<line x1="${left}" y1="${y}" x2="${W-right}" y2="${y}" stroke="#e4eaf2"/><text x="${left-12}" y="${y+5}" text-anchor="end" fill="#64748b" font-size="13">${number(max*(3-i)/3)}</text>`;}).join('');
    const points=items.map((p,i)=>`${left+step*(i+.5)},${top+plotH*(1-p.total/max)}`).join(' ');
    return `<svg class="br-chart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}"><title>${esc(title)}. ${esc(items.map(p=>`${p.label}${p.partial?' 부분 집계':''} ${p.total}건`).join(', '))}</title>${grid}<polyline points="${points}" fill="none" stroke="#3374dc" stroke-width="3"/>
      ${items.map((p,i)=>{const x=left+step*(i+.5),y=top+plotH*(1-p.total/max),selected=i===items.length-1;return `<circle cx="${x}" cy="${y}" r="${selected?6:4}" fill="${selected?'#173765':'#3374dc'}" stroke="white" stroke-width="2"/><text x="${x}" y="${y-13}" text-anchor="middle" fill="#173765" font-size="15" font-weight="700">${number(p.total)}</text><text x="${x}" y="${H-27}" text-anchor="middle" fill="#475569" font-size="14">${p.short}</text>${p.partial?`<text x="${x}" y="${H-8}" text-anchor="middle" fill="#ad6500" font-size="12">부분 집계</text>`:''}`;}).join('')}</svg>`;
  }
  function ranking(current,previous,total,limit=10){
    if(!current.length)return '<p class="br-empty">해당 기간에 입력된 기록이 없습니다.</p>';
    const old=new Map(previous);
    return `<div class="br-rank-list">${current.slice(0,limit).map(([label,value],i)=>`<div class="br-rank-row"><span class="br-rank">${i+1}</span><div><strong>${esc(label)}</strong><div class="br-track"><i style="width:${total?Math.min(100,value/total*100):0}%"></i></div></div><b>${number(value)}건</b><span class="br-rank-diff">${delta(value,old.get(label)||0,{unit:'건'})}</span></div>`).join('')}</div>`;
  }
  function sectionHeading(numberText,title,subtitle){return `<header class="br-section-heading"><div><span>${numberText}</span><h3>${title}</h3></div><p>${subtitle}</p></header>`;}
  function periodTable(items){
    if(!items.length)return '<p class="br-empty">선택 기간에 표시할 상담 기록이 없습니다.</p>';
    return `<div class="br-table-scroll"><table class="br-table"><thead><tr><th>기간</th><th>상담 수</th><th>고객 수</th><th>직전 달 대비</th><th>일평균</th><th>평균 최대 예산</th><th>할부 요청</th><th>방문·예약</th></tr></thead><tbody>${items.map((p,i)=>`<tr class="${i===items.length-1?'br-selected-row':''}"><th>${esc(p.label)}${p.partial?'<span class="br-inline-tag">부분 집계</span>':''}</th><td>${number(p.total)}건</td><td>${number(p.customers)}명</td><td>${p.partial?'부분 기간 · 비교 제외':delta(p.total,p.previousTotal,{unit:'건'})}</td><td>${number(p.daily,1)}건</td><td>${number(p.averageBudget)}${p.averageBudget==null?'':'만원'}</td><td>${number(p.finance,1)}${p.finance==null?'':'%'}</td><td>${number(p.visit,1)}${p.visit==null?'':'%'}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function build(rows,mode,year,index,asOf,selection={}){
    const context=mode==='range'?rangeContext(selection.from,selection.to,asOf):periodContext(mode,year,index,asOf),c=context;
    const currentRows=range(rows,c.current.from,c.cutoff),previousRows=range(rows,c.previous.from,c.previousEnd),lastYearRows=range(rows,c.lastYear.from,c.lastYearEnd);
    const current=metrics(currentRows,c.current.from,c.cutoff),previous=metrics(previousRows,c.previous.from,c.previousEnd),lastYear=metrics(lastYearRows,c.lastYear.from,c.lastYearEnd);
    const months=visibleSeries(rows,'month',c.current.from,c.cutoff),quarters=visibleSeries(rows,'quarter',c.current.from,c.cutoff);
    return {context,current,previous,lastYear,currentRows,previousRows,months,quarters,missingDates:rows.filter(r=>!validDate(r.inquiryDate)).length};
  }
  function reportHtml(data,filterSummary,createdAt){
    const {context:c,current:m,previous:p,lastYear:y,currentRows,previousRows,months,quarters}=data;
    const types=groups(currentRows,'inquiryType'),oldTypes=groups(previousRows,'inquiryType'),models=groups(currentRows,'models'),oldModels=groups(previousRows,'models');
    const reference=c.current.mode==='quarter'?'직전 분기':c.current.mode==='range'?'직전 동길이 기간':'직전 월';
    const badge=c.partial?'진행 중 · 동기간 비교':'완료 기간';
    const kpi=(title,key,unit,decimals=0,rate=false)=>`<article class="br-kpi"><h3>${title}</h3><strong>${number(m[key],decimals)}<span>${m[key]==null?'':unit}</span></strong><div class="br-kpi-delta">${delta(m[key],p[key],{unit,decimals,rate})}</div><p>${reference} ${number(p[key],decimals)}${p[key]==null?'':unit}</p></article>`;
    const footer=(page)=>`<footer class="br-footer"><span>중카TV · 내부 업무용 / CRM 상담 기록 기준</span><span>${esc(c.current.label)} · ${page} / 3</span></footer>`;
    const change=m.total-p.total;
    const summary=m.total?`상담 ${number(m.total)}건, 고객 ${number(m.customers)}명. ${reference}${c.partial?' 동기간':''}보다 ${number(Math.abs(change))}건 ${change>0?'증가':change<0?'감소':'으로 동일'}했습니다.`:'해당 조건과 기간에 입력된 상담 기록이 없습니다.';
    return `<section class="br-page" data-report-page>
      <header class="br-cover"><div><span class="br-eyebrow">JUNGCAR TV · BUSINESS REVIEW</span><h2>중카TV ${c.current.mode==='quarter'?'분기':c.current.mode==='range'?'기간별':'월간'} 상담 리포트</h2><p>${esc(c.current.label)} <span class="br-status">${badge}</span></p></div><div class="br-cover-meta"><strong>집계 ${c.current.from} ~ ${c.cutoff}</strong><span>비교 ${c.previous.from} ~ ${c.previousEnd}</span><span>${esc(createdAt)} 생성</span></div></header>
      <div class="br-filter-note">대상 · ${esc(filterSummary)}</div>
      <div class="br-kpis">${kpi('상담 수','total','건')}${kpi('고객 수','customers','명')}${kpi('일평균 상담','daily','건',1)}${kpi('평균 최대 예산','averageBudget','만원')}${kpi('할부 조회 요청','finance','%',1,true)}${kpi('방문·예약','visit','%',1,true)}</div>
      <section class="br-executive"><h3>핵심 요약</h3><p>${esc(summary)}</p><div><span>최다 문의 차종 <b>${esc(models[0]?.[0]||'—')}</b> ${models.length?number(models[0][1])+'건':''}</span><span>주요 문의 유형 <b>${esc(types[0]?.[0]||'—')}</b></span><span>전년 같은 기간 상담 ${number(y.total)}건 · ${delta(m.total,y.total,{unit:'건'})}</span></div></section>
      <section class="br-trend">${sectionHeading('01','월별 상담 변화 추이',`${c.current.from} ~ ${c.cutoff} · 기록이 있는 ${months.length}개 월 / 단위: 건`)}${chart(months,'선택 기간의 월별 상담 수')}<p class="br-chart-note">선택 기간에 포함된 기록만 집계하며, 기록이 없는 월·분기는 그래프와 표에서 생략합니다. 월·분기 전체가 아닌 경우 부분 집계로 표시합니다.</p></section>${footer(1)}
    </section>
    <section class="br-page" data-report-page>
      <header class="br-page-heading"><span>PERIOD PERFORMANCE</span><h2>분기 추이와 기간별 실적</h2><p>${esc(c.current.label)} 기준 · 상담량의 흐름과 기간별 변화</p></header>
      <section class="br-trend">${sectionHeading('02','분기별 상담 변화 추이',`선택 기간 내 기록이 있는 ${quarters.length}개 분기 · 기간 밖 기록 제외`)}${chart(quarters,'선택 기간의 분기별 상담 수')}</section>
      <section>${sectionHeading('03','월별 실적','기록이 없는 월 생략 · 증감은 화면의 직전 행이 아닌 실제 직전 달 대비 / 부분 월은 비교 제외')}${periodTable(months)}</section>${footer(2)}
    </section>
    <section class="br-page" data-report-page>
      <header class="br-page-heading"><span>CUSTOMER DEMAND</span><h2>고객 수요와 상담 구성</h2><p>${c.current.from} ~ ${c.cutoff} · ${reference}${c.partial?' 동기간':''} 대비</p></header>
      <div class="br-demand-grid"><section>${sectionHeading('04','인기 문의 차종 TOP 10','복수 차종은 각각 집계 · 동일 상담 내 같은 차종은 1회')}${ranking(models,oldModels,m.total,10)}</section><section>${sectionHeading('05','문의 종류 TOP 8','건수 및 직전 기간 대비 변화')}${ranking(types,oldTypes,m.total,8)}${types.length>8?'<p class="br-chart-note">상위 8개 유형 표시 · 전체 합계는 상단 상담 수 기준</p>':''}<div class="br-quality"><h3>집계 기준과 데이터 확인</h3><ul><li>고객 수: 해당 기간 내 전화번호 중복 제외. 신규 고객 수와는 다릅니다.</li><li>일평균: 상담 없는 날을 포함한 집계 기간 ${days(c.current.from,c.cutoff)}일 기준.</li><li>예산 평균: 유효한 최대 예산이 있는 ${number(m.budgetCount)}건 기준.</li><li>할부·방문 비율: 전체 상담 중 해당 토글이 활성화된 기록 비율.</li><li>동기간 비교: 진행 중이면 직전 기간의 동일 경과 일수까지 집계(기간 말일로 제한).</li><li>날짜 누락·오류 ${number(data.missingDates)}건은 기간 집계에서 제외.</li><li>저장된 상담 기록만 분석하며 매출·계약 성과를 의미하지 않습니다.</li></ul></div></section></div>${footer(3)}
    </section>`;
  }
  function mount(){
    const now=today();
    if(!state.year){state.year=Number(now.slice(0,4));state.period=Number(now.slice(5,7));}
    if(state.mode!=='range'){const p=period(state.mode,state.year,state.period);state.from=p.from;state.to=p.to;}
    const years=[...new Set([Number(now.slice(0,4)),state.year,...leads.filter(r=>validDate(r.inquiryDate)).map(r=>Number(r.inquiryDate.slice(0,4)))])].sort((a,b)=>b-a);
    const periodControls=state.mode==='range'?`<label>시작일<input type="date" name="from" value="${esc(state.from)}"></label><label>종료일<input type="date" name="to" value="${esc(state.to)}"></label>`:`<label>연도<select name="year">${years.map(y=>`<option ${y===state.year?'selected':''}>${y}</option>`).join('')}</select></label><label>${state.mode==='quarter'?'분기':'월'}<select name="period">${Array.from({length:state.mode==='quarter'?4:12},(_,i)=>`<option value="${i+1}" ${i+1===state.period?'selected':''}>${i+1}${state.mode==='quarter'?'분기':'월'}</option>`).join('')}</select></label>`;
    app.innerHTML=`<section class="panel br-controls"><div class="br-control-title"><div><h2>회사 보고서로 바로 출력하세요</h2><p>선택 기간 안에서만 집계합니다. 기록이 없는 월·분기는 자동으로 숨깁니다.</p></div><div class="report-actions"><button id="businessPng">PNG 저장</button><button id="businessPdf" class="br-primary">PDF 보고서 저장</button></div></div><form id="businessPeriod" class="br-period-controls"><label>기간 설정<select name="mode"><option value="month" ${state.mode==='month'?'selected':''}>월간 리포트</option><option value="quarter" ${state.mode==='quarter'?'selected':''}>분기 리포트</option><option value="range" ${state.mode==='range'?'selected':''}>기간 직접 설정</option></select></label>${periodControls}<button type="button" id="businessThisPeriod">이번 ${state.mode==='quarter'?'분기':'달'}</button></form><details class="br-extra-filters"><summary>상세 필터 · 차종, 문의 종류, 할부, 방문, 예산</summary><form id="businessFilters" class="filter-grid">${analysisFilterFields(state.filters)}</form><button type="button" id="businessResetFilters">필터 초기화</button></details></section><div id="businessReport" class="business-report" aria-live="polite"></div>`;
    const form=document.querySelector('#businessPeriod');
    form.addEventListener('submit',event=>event.preventDefault());
    form.addEventListener('change',()=>{
      const values=Object.fromEntries(new FormData(form)),oldMode=state.mode;
      if(oldMode==='range'&&values.mode==='range'){state.from=values.from;state.to=values.to;refresh();return;}
      const month=oldMode==='range'?(Number(state.from.slice(5,7))||Number(now.slice(5,7))):oldMode==='quarter'?(state.period-1)*3+1:state.period;
      state.mode=values.mode;state.year=Number(values.year)||Number(state.from.slice(0,4))||state.year;
      if(state.mode!=='range')state.period=oldMode===state.mode?Number(values.period):state.mode==='quarter'?Math.ceil(month/3):month;
      mount();
    });
    document.querySelector('#businessThisPeriod').onclick=()=>{if(state.mode==='range')state.mode='month';state.year=Number(now.slice(0,4));state.period=state.mode==='quarter'?Math.ceil(Number(now.slice(5,7))/3):Number(now.slice(5,7));mount();};
    const filters=document.querySelector('#businessFilters');
    filters.querySelectorAll('[name="dateFrom"],[name="dateTo"]').forEach(input=>input.closest('label').remove());
    const update=()=>{state.filters=Object.fromEntries(new FormData(filters));refresh();};
    filters.addEventListener('input',update);filters.addEventListener('change',update);filters.addEventListener('submit',event=>event.preventDefault());bindAnalysisModels(filters);
    document.querySelector('#businessResetFilters').onclick=()=>{state.filters={};mount();};
    for(const format of ['png','pdf']){
      const button=document.querySelector(format==='png'?'#businessPng':'#businessPdf');
      button.onclick=()=>window.JungcarReportExport.save({report:document.querySelector('#businessReport'),button,format,filename:`jungcar-${state.mode}-${state.from}_${state.to}`});
    }
    refresh();
  }
  function refresh(){
    const report=document.querySelector('#businessReport');if(!report)return;
    const now=today(),invalid=!validDate(state.from)||!validDate(state.to)||state.from>state.to,future=state.from>now;
    document.querySelector('#businessPng').disabled=future||invalid;document.querySelector('#businessPdf').disabled=future||invalid;
    if(invalid){report.innerHTML='<p class="panel br-empty" role="alert">시작일과 종료일을 확인해 주세요. 종료일은 시작일보다 빠를 수 없습니다.</p>';return;}
    if(future){report.innerHTML='<p class="panel br-empty">아직 시작하지 않은 기간입니다. 현재 또는 과거 기간을 선택해 주세요.</p>';return;}
    const data=build(filteredAnalysisRows(state.filters),state.mode,state.year,state.period,now,{from:state.from,to:state.to});
    report.innerHTML=reportHtml(data,analysisFilterSummary(state.filters),reportGeneratedAt());
  }
  window.JungcarBusinessReports={mount,refresh,period,periodContext,rangeContext,metrics,visibleSeries,build,reportHtml,validDate,delta};
})();
