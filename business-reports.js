/* Read-only reporting: calculations use the current server-confirmed CRM snapshot. */
(() => {
  const DAY=86400000;
  const state={mode:'month',year:null,period:null,from:'',to:'',unit:'month',compareA:'',compareB:'',filters:{}};
  const unitNames={day:'일별',week:'주별',month:'월별',quarter:'분기별'};
  const unitNouns={day:'일',week:'주',month:'월',quarter:'분기'};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=(value,decimals=0)=>value==null?'—':(Math.abs(Number(value))<.5*10**(-decimals)?0:Number(value)).toLocaleString('ko-KR',{maximumFractionDigits:decimals,minimumFractionDigits:decimals});
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
  function bucket(mode,date){
    if(mode==='day')return {mode,from:date,to:date,label:date,short:date.slice(5).replace('-','/')};
    if(mode==='week'){
      const offset=(new Date(time(date)).getUTCDay()+6)%7,from=shiftDay(date,-offset),to=shiftDay(from,6);
      return {mode,from,to,label:`${from} ~ ${to}`,short:`${from.slice(5).replace('-','/')} 주`};
    }
    return period(mode,Number(date.slice(0,4)),mode==='quarter'?Math.ceil(Number(date.slice(5,7))/3):Number(date.slice(5,7)));
  }
  function visibleSeries(rows,mode,from,to){
    if(!unitNames[mode]||!validDate(from)||!validDate(to)||from>to)return [];
    const bins=new Map(),totals=new Map();
    rows.forEach(row=>{
      if(!validDate(row.inquiryDate))return;
      const p=bucket(mode,row.inquiryDate);
      totals.set(p.from,(totals.get(p.from)||0)+1);
      if(row.inquiryDate<from||row.inquiryDate>to)return;
      if(!bins.has(p.from))bins.set(p.from,{...p,rows:[]});
      bins.get(p.from).rows.push(row);
    });
    return [...bins.values()].sort((a,b)=>a.from.localeCompare(b.from)).map(p=>{
      const start=p.from<from?from:p.from,cutoff=p.to>to?to:p.to;
      const prior=bucket(mode,shiftDay(p.from,-1));
      return {...p,...metrics(p.rows,start,cutoff),start,cutoff,partial:start!==p.from||cutoff!==p.to,hasRecords:true,previousTotal:totals.get(prior.from)||0};
    });
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
    if(items.length===1){const p=items[0];return `<div class="br-single-period"><div><strong>${esc(p.label)}${p.partial?' · 부분 집계':''}</strong><p>${p.start} ~ ${p.cutoff} · 기록이 있는 ${unitNouns[p.mode]} 1개</p></div><b>${number(p.total)}<span>건</span></b></div>`;}
    const W=1200,H=280,left=55,right=28,top=35,bottom=55,max=Math.max(3,Math.ceil(Math.max(0,...items.map(p=>p.total))/3)*3);
    const plotH=H-top-bottom,step=(W-left-right)/items.length;
    const grid=Array.from({length:4},(_,i)=>{const y=top+plotH*i/3;return `<line x1="${left}" y1="${y}" x2="${W-right}" y2="${y}" stroke="#e4eaf2"/><text x="${left-12}" y="${y+5}" text-anchor="end" fill="#64748b" font-size="13">${number(max*(3-i)/3)}</text>`;}).join('');
    const points=items.map((p,i)=>`${left+step*(i+.5)},${top+plotH*(1-p.total/max)}`).join(' '),stride=Math.ceil(items.length/12);
    return `<svg class="br-chart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}"><title>${esc(title)}. ${esc(items.map(p=>`${p.label}${p.partial?' 부분 집계':''} ${p.total}건`).join(', '))}</title>${grid}<polyline points="${points}" fill="none" stroke="#3374dc" stroke-width="3"/>
      ${items.map((p,i)=>{const x=left+step*(i+.5),y=top+plotH*(1-p.total/max),selected=i===items.length-1,show=i%stride===0||selected;return `<circle cx="${x}" cy="${y}" r="${selected?6:items.length>40?2:4}" fill="${selected?'#173765':'#3374dc'}" stroke="white" stroke-width="1"><title>${esc(p.label)}: ${p.total}건</title></circle>${show?`<text x="${x}" y="${y-13}" text-anchor="middle" fill="#173765" font-size="15" font-weight="700">${number(p.total)}</text><text x="${x}" y="${H-27}" text-anchor="middle" fill="#475569" font-size="14">${esc(p.short)}</text>${p.partial?`<text x="${x}" y="${H-8}" text-anchor="middle" fill="#ad6500" font-size="12">부분 집계</text>`:''}`:''}`;}).join('')}</svg>`;
  }
  function ranking(current,previous,total,limit=10){
    if(!current.length)return '<p class="br-empty">해당 기간에 입력된 기록이 없습니다.</p>';
    const old=new Map(previous);
    return `<div class="br-rank-list">${current.slice(0,limit).map(([label,value],i)=>`<div class="br-rank-row"><span class="br-rank">${i+1}</span><div><strong>${esc(label)}</strong><div class="br-track"><i style="width:${total?Math.min(100,value/total*100):0}%"></i></div></div><b>${number(value)}건</b><span class="br-rank-diff">${delta(value,old.get(label)||0,{unit:'건'})}</span></div>`).join('')}</div>`;
  }
  function sectionHeading(numberText,title,subtitle){return `<header class="br-section-heading"><div><span>${numberText}</span><h3>${title}</h3></div><p>${subtitle}</p></header>`;}
  function periodTable(items,unit='month'){
    if(!items.length)return '<p class="br-empty">선택 기간에 표시할 상담 기록이 없습니다.</p>';
    return `<div class="br-table-scroll"><table class="br-table"><thead><tr><th>기간</th><th>상담 수</th><th>고객 수</th><th>직전 ${unitNouns[unit]} 대비</th><th>일평균</th><th>평균 최대 예산</th><th>할부 요청</th><th>방문·예약</th></tr></thead><tbody>${items.map((p,i)=>`<tr class="${i===items.length-1?'br-selected-row':''}"><th>${esc(p.label)}${p.partial?'<span class="br-inline-tag">부분 집계</span>':''}</th><td>${number(p.total)}건</td><td>${number(p.customers)}명</td><td>${p.partial?'부분 기간 · 비교 제외':delta(p.total,p.previousTotal,{unit:'건'})}</td><td>${number(p.daily,1)}건</td><td>${number(p.averageBudget)}${p.averageBudget==null?'':'만원'}</td><td>${number(p.finance,1)}${p.finance==null?'':'%'}</td><td>${number(p.visit,1)}${p.visit==null?'':'%'}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function build(rows,mode,year,index,asOf,selection={}){
    const context=mode==='range'?rangeContext(selection.from,selection.to,asOf):periodContext(mode,year,index,asOf),c=context;
    const currentRows=range(rows,c.current.from,c.cutoff),previousRows=range(rows,c.previous.from,c.previousEnd),lastYearRows=range(rows,c.lastYear.from,c.lastYearEnd);
    const current=metrics(currentRows,c.current.from,c.cutoff),previous=metrics(previousRows,c.previous.from,c.previousEnd),lastYear=metrics(lastYearRows,c.lastYear.from,c.lastYearEnd);
    const months=visibleSeries(rows,'month',c.current.from,c.cutoff),quarters=visibleSeries(rows,'quarter',c.current.from,c.cutoff);
    const unit=unitNames[selection.unit]?selection.unit:'month',items=visibleSeries(rows,unit,c.current.from,c.cutoff);
    const compareB=items.find(p=>p.from===selection.compareB)||items.at(-1)||null;
    const compareA=items.find(p=>p.from===selection.compareA&&p.from!==compareB?.from)||items.filter(p=>p.from!==compareB?.from).at(-1)||null;
    return {context,current,previous,lastYear,currentRows,previousRows,months,quarters,unit,items,compareA,compareB,missingDates:rows.filter(r=>!validDate(r.inquiryDate)).length};
  }
  function demandData(a,b,key,limit){
    const before=new Map(groups(a?.rows||[],key)),after=new Map(groups(b?.rows||[],key));
    return [...new Set([...before.keys(),...after.keys()])].map(label=>({label,a:before.get(label)||0,b:after.get(label)||0}))
      .sort((x,y)=>(y.a+y.b)-(x.a+x.b)||String(x.label).localeCompare(String(y.label),'ko')).slice(0,limit);
  }
  function demandBars(a,b,key,limit,start=0,end=limit){
    const all=demandData(a,b,key,limit),data=all.slice(start,end),max=Math.max(1,...all.flatMap(p=>[p.a,p.b]));
    if(!data.length)return '<p class="br-empty">표시할 상담 기록이 없습니다.</p>';
    return `<div class="br-demand-bars">${data.map(p=>{
      const ap=a?.total?p.a/a.total*100:0,bp=b?.total?p.b/b.total*100:0,diff=p.b-p.a,pp=bp-ap;
      return `<article class="br-demand-row"><header><strong>${esc(p.label)}</strong><small>${a?`B − A <b>${diff>0?'+':''}${number(diff)}건</b> · ${pp>0?'+':''}${number(pp,1)}%p`:'비교 구간 없음'}</small></header>
        <div class="br-demand-bar"><span>A</span><i><em style="width:${p.a/max*100}%"></em></i><b>${a?`${number(p.a)}건 <small>(${number(ap,1)}%)</small>`:'—'}</b></div>
        <div class="br-demand-bar br-demand-b"><span>B</span><i><em style="width:${p.b/max*100}%"></em></i><b>${number(p.b)}건 <small>(${number(bp,1)}%)</small></b></div></article>`;
    }).join('')}</div>`;
  }
  function typeCategories(rows){
    const colors=['#3374dc','#169b8d','#8b5ac5','#dfa23e','#64748b'];
    const groupsList=groups(rows,'inquiryType');
    const categories=groupsList.slice(0,5).map(([label],i)=>({label,color:colors[i]}));
    if(groupsList.length>5)categories.push({label:'기타 유형 합계',color:'#ce7184',other:true});
    return categories;
  }
  function compositionChart(items,categories){
    if(!items.length)return '<p class="br-empty">표시할 상담 기록이 없습니다.</p>';
    const W=1200,H=260,left=55,right=24,top=30,base=200,step=(W-left-right)/items.length,barWidth=Math.min(75,step*.6);
    const named=new Set(categories.filter(c=>!c.other).map(c=>c.label));
    return `<div class="br-composition-legend">${categories.map(c=>`<span><i style="background:${c.color}"></i>${esc(c.label)}</span>`).join('')}</div><svg class="br-chart br-composition-chart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="기간별 문의 종류 비중"><title>기간별 문의 종류 비중, 각 구간 전체 상담을 100%로 표시</title>${[0,50,100].map(p=>`<line x1="${left}" y1="${base-(base-top)*p/100}" x2="${W-right}" y2="${base-(base-top)*p/100}" stroke="#e4eaf2"/><text x="${left-10}" y="${base-(base-top)*p/100+4}" text-anchor="end" font-size="12" fill="#64748b">${p}%</text>`).join('')}${items.map((p,i)=>{
      const values=new Map(groups(p.rows,'inquiryType')),x=left+step*(i+.5);let used=0;
      const bars=categories.map(c=>{const value=c.other?[...values].filter(([key])=>!named.has(key)).reduce((sum,[,v])=>sum+v,0):(values.get(c.label)||0),height=value/p.total*(base-top),y=base-used-height;used+=height;
        return `<rect x="${x-barWidth/2}" y="${y}" width="${barWidth}" height="${height}" fill="${c.color}"><title>${esc(p.label)} · ${esc(c.label)} ${value}건 (${number(value/p.total*100,1)}%)</title></rect>`;
      }).join('');
      return `${bars}<text x="${x}" y="${top-10}" text-anchor="middle" font-size="14" font-weight="700" fill="#173765">${number(p.total)}건</text><text x="${x}" y="${base+24}" text-anchor="middle" font-size="13" fill="#475569">${esc(p.short)}</text>${p.partial?`<text x="${x}" y="${base+43}" text-anchor="middle" font-size="11" fill="#ad6500">부분 집계</text>`:''}`;
    }).join('')}</svg>`;
  }
  function reportHtml(data,filterSummary,createdAt){
    const {context:c,current:m,previous:p,lastYear:y,currentRows,unit,items,compareA:a,compareB:b}=data;
    const types=groups(currentRows,'inquiryType'),models=groups(currentRows,'models'),reference=c.current.mode==='quarter'?'직전 분기':c.current.mode==='range'?'직전 동길이 기간':'직전 월';
    const kpi=(title,key,unitText,decimals=0,rate=false)=>`<article class="br-kpi"><h3>${title}</h3><strong>${number(m[key],decimals)}<span>${m[key]==null?'':unitText}</span></strong><div class="br-kpi-delta">${delta(m[key],p[key],{unit:unitText,decimals,rate})}</div><p>${reference} ${number(p[key],decimals)}${p[key]==null?'':unitText}</p></article>`;
    const change=m.total-p.total,summary=m.total?`선택 기간 상담 ${number(m.total)}건, 고객 ${number(m.customers)}명. ${reference}${c.partial?' 동기간':''}보다 ${number(Math.abs(change))}건 ${change>0?'증가':change<0?'감소':'으로 동일'}했습니다.`:'해당 조건과 기간에 입력된 상담 기록이 없습니다.';
    const pages=[`<header class="br-cover"><div><span class="br-eyebrow">JUNGCAR TV · BUSINESS REVIEW</span><h2>중카TV ${unitNames[unit]} 분석 리포트</h2><p>${esc(c.current.label)} <span class="br-status">${c.partial?'진행 중 · 부분 집계':'완료 기간'}</span></p></div><div class="br-cover-meta"><strong>집계 ${c.current.from} ~ ${c.cutoff}</strong><span>요약 비교 ${c.previous.from} ~ ${c.previousEnd}</span><span>${esc(createdAt)} 생성</span></div></header>
      <div class="br-filter-note">대상 · ${esc(filterSummary)} / 표시 단위 · ${unitNames[unit]}${unit==='week'?' (월요일~일요일)':''}</div>
      <div class="br-kpis">${kpi('전체 기간 상담 수','total','건')}${kpi('전체 기간 고객 수','customers','명')}${kpi('일평균 상담','daily','건',1)}${kpi('평균 최대 예산','averageBudget','만원')}${kpi('할부 조회 요청','finance','%',1,true)}${kpi('방문·예약','visit','%',1,true)}</div>
      <section class="br-executive"><h3>선택 전체 기간 요약</h3><p>${esc(summary)}</p><div><span>최다 문의 차종 <b>${esc(models[0]?.[0]||'—')}</b></span><span>주요 문의 유형 <b>${esc(types[0]?.[0]||'—')}</b></span><span>전년 같은 기간 ${number(y.total)}건 · ${delta(m.total,y.total,{unit:'건'})}</span></div></section>
      <section class="br-trend">${sectionHeading('01',`${unitNames[unit]} 상담 변화 추이`,`기록이 있는 ${items.length}개 구간 · 모든 구간의 건수는 다음 실적표에 표시`)}${chart(items,`${unitNames[unit]} 상담 수`)}<p class="br-chart-note">기록이 없는 구간은 생략합니다. 선택 기간 경계 또는 오늘에서 잘린 구간은 부분 집계입니다. 고객 수요 비교는 마지막 페이지의 A/B 구간 기준입니다.</p></section>`];
    const categories=typeCategories(currentRows),batches=[];
    for(let i=0;i<items.length;i+=12)batches.push(items.slice(i,i+12));
    if(!batches.length)batches.push([]);
    batches.forEach((batch,i)=>pages.push(`<header class="br-page-heading"><span>PERIOD PERFORMANCE</span><h2>${unitNames[unit]} 실적과 상담 구성</h2><p>${batch.length?`${esc(batch[0].label)} ~ ${esc(batch.at(-1).label)}`:'기록 없음'}${batches.length>1?` · ${i+1} / ${batches.length}`:''}</p></header>
      <section>${sectionHeading('02',`${unitNames[unit]} 실적`,`증감은 실제 직전 ${unitNouns[unit]} 대비 · 부분 구간은 비교 제외 · 고객 수는 구간별 중복 제외`)}${periodTable(batch,unit)}</section>
      <section class="br-trend">${sectionHeading('03',`${unitNames[unit]} 문의 종류 구성`,'각 구간 전체 상담 = 100% · 같은 색은 같은 문의 유형')}${compositionChart(batch,categories)}</section>`));
    const pair= (item,label)=>`<div class="br-pair br-pair-${label.toLowerCase()}"><span>${label} · ${label==='A'?'비교 기준':'비교 대상'}</span><strong>${item?esc(item.label):'비교 가능한 구간 없음'}</strong><p>${item?`${item.start} ~ ${item.cutoff}${item.partial?' · 부분 집계':''}`:'선택 기간에 기록이 있는 구간이 하나뿐입니다.'}</p><b>${item?`${number(item.total)}건 · 일평균 ${number(item.daily,1)}건`:'—'}</b></div>`;
    const demandHeader=`<header class="br-page-heading"><span>CUSTOMER DEMAND · ${unit.toUpperCase()}</span><h2>고객 수요와 상담 구성 · ${unitNames[unit]} 비교</h2><p>선택 기간 안의 A와 B 비교 · 변화 = B − A · A 파랑 / B 보라</p></header><div class="br-pair-grid">${pair(a,'A')}${pair(b,'B')}</div>
      <p class="br-chart-note">${a&&b?`상담 수 변화 ${delta(b.total,a.total,{unit:'건'})} · 일평균 변화 ${delta(b.daily,a.daily,{unit:'건',decimals:1})}`:'비교할 구간이 부족하여 B의 구성만 표시합니다.'}${a&&b&&(a.partial||b.partial||days(a.start,a.cutoff)!==days(b.start,b.cutoff))?' · 집계 일수 또는 완결 여부가 다릅니다. 누적 건수와 함께 일평균·비중을 확인해 주세요.':''}</p>`;
    const quality=`<div class="br-quality"><h3>비교 기준</h3><p class="br-chart-note">막대는 건수, 괄호는 각 구간 상담 대비 비중입니다. 같은 그래프의 막대는 같은 척도이며, 비중 차이는 %p입니다. 복수 차종은 각각 집계합니다. 고객 수는 전화번호 중복 제외, 예산은 유효한 입력만 포함합니다. 날짜 누락·오류 ${number(data.missingDates)}건은 제외하며 상담 기록을 매출·계약 성과로 해석하지 않습니다.</p></div>`;
    if(demandData(a,b,'models',10).length>6||demandData(a,b,'inquiryType',8).length>6){
      for(const [key,limit,half,title] of [['models',10,5,'희망 차종 TOP 10'],['inquiryType',8,4,'문의 종류 TOP 8']]){
        const size=demandData(a,b,key,limit).length;
        pages.push(`${demandHeader}${sectionHeading(key==='models'?'04':'05',`${title} 비교`,'A+B 합산 순위 · 왼쪽 상위 순위, 오른쪽 다음 순위')}<div class="br-demand-grid"><section>${demandBars(a,b,key,limit,0,half)}</section><section>${size>half?demandBars(a,b,key,limit,half,limit):''}</section></div>${quality}`);
      }
    }else pages.push(`${demandHeader}<div class="br-demand-grid"><section>${sectionHeading('04','희망 차종 TOP 10 비교','A+B 합산 순위 · 복수 차종은 각각 집계')}${demandBars(a,b,'models',10)}</section><section>${sectionHeading('05','문의 종류 TOP 8 비교','A+B 합산 순위 · 괄호는 구간 상담 대비 비중')}${demandBars(a,b,'inquiryType',8)}</section></div>${quality}`);
    return pages.map((html,i)=>`<section class="br-page" data-report-page>${html}<footer class="br-footer"><span>중카TV · 내부 업무용 / ${unitNames[unit]} 집계</span><span>${esc(c.current.label)} · ${i+1} / ${pages.length}</span></footer></section>`).join('');
  }
  function mount(){
    const now=today();
    if(!state.year){state.year=Number(now.slice(0,4));state.period=Number(now.slice(5,7));}
    if(state.mode!=='range'){const p=period(state.mode,state.year,state.period);state.from=p.from;state.to=p.to;}
    const years=[...new Set([Number(now.slice(0,4)),state.year,...leads.filter(r=>validDate(r.inquiryDate)).map(r=>Number(r.inquiryDate.slice(0,4)))])].sort((a,b)=>b-a);
    const periodControls=state.mode==='range'?`<label>시작일<input type="date" name="from" value="${esc(state.from)}"></label><label>종료일<input type="date" name="to" value="${esc(state.to)}"></label>`:`<label>연도<select name="year">${years.map(y=>`<option ${y===state.year?'selected':''}>${y}</option>`).join('')}</select></label><label>${state.mode==='quarter'?'분기':'월'}<select name="period">${Array.from({length:state.mode==='quarter'?4:12},(_,i)=>`<option value="${i+1}" ${i+1===state.period?'selected':''}>${i+1}${state.mode==='quarter'?'분기':'월'}</option>`).join('')}</select></label>`;
    app.innerHTML=`<section class="panel br-controls"><div class="br-control-title"><div><h2>기간과 집계 단위로 분석하세요</h2><p>일별·주별·월별·분기별 추이와 고객 수요를 비교합니다. 기록이 없는 구간은 숨깁니다.</p></div><div class="report-actions"><button id="businessPng">PNG 저장</button><button id="businessPdf" class="br-primary">PDF 보고서 저장</button></div></div><form id="businessPeriod" class="br-period-controls"><label>기간 설정<select name="mode"><option value="month" ${state.mode==='month'?'selected':''}>한 달 선택</option><option value="quarter" ${state.mode==='quarter'?'selected':''}>한 분기 선택</option><option value="range" ${state.mode==='range'?'selected':''}>기간 직접 설정</option></select></label>${periodControls}<label>집계 단위<select name="unit">${Object.entries(unitNames).map(([key,label])=>`<option value="${key}" ${key===state.unit?'selected':''}>${label}${key==='week'?' (월~일)':''}</option>`).join('')}</select></label><button type="button" id="businessThisPeriod">이번 ${state.mode==='quarter'?'분기':'달'}</button></form><div id="businessCompareControls" class="br-compare-controls"></div><details class="br-extra-filters"><summary>상세 필터 · 차종, 문의 종류, 할부, 방문, 예산</summary><form id="businessFilters" class="filter-grid">${analysisFilterFields(state.filters)}</form><button type="button" id="businessResetFilters">필터 초기화</button></details></section><div id="businessReport" class="business-report" aria-live="polite"></div>`;
    const form=document.querySelector('#businessPeriod');
    form.addEventListener('submit',event=>event.preventDefault());
    form.addEventListener('change',event=>{
      const values=Object.fromEntries(new FormData(form)),oldMode=state.mode;
      if(event.target.name==='unit'){state.unit=values.unit;state.compareA='';state.compareB='';refresh();return;}
      if(oldMode==='range'&&values.mode==='range'){state.from=values.from;state.to=values.to;refresh();return;}
      const month=oldMode==='range'?(Number(state.from.slice(5,7))||Number(now.slice(5,7))):oldMode==='quarter'?(state.period-1)*3+1:state.period;
      state.mode=values.mode;state.year=Number(values.year)||Number(state.from.slice(0,4))||state.year;
      if(state.mode!=='range')state.period=oldMode===state.mode?Number(values.period):state.mode==='quarter'?Math.ceil(month/3):month;
      mount();
    });
    document.querySelector('#businessThisPeriod').onclick=()=>{if(state.mode==='range')state.mode='month';state.year=Number(now.slice(0,4));state.period=state.mode==='quarter'?Math.ceil(Number(now.slice(5,7))/3):Number(now.slice(5,7));mount();};
    document.querySelector('#businessCompareControls').onchange=()=>{state.compareA=document.querySelector('#reportCompareA')?.value||'';state.compareB=document.querySelector('#reportCompareB')?.value||'';refresh();};
    const filters=document.querySelector('#businessFilters');
    filters.querySelectorAll('[name="dateFrom"],[name="dateTo"]').forEach(input=>input.closest('label').remove());
    const update=()=>{state.filters=Object.fromEntries(new FormData(filters));refresh();};
    filters.addEventListener('input',update);filters.addEventListener('change',update);filters.addEventListener('submit',event=>event.preventDefault());bindAnalysisModels(filters);
    document.querySelector('#businessResetFilters').onclick=()=>{state.filters={};mount();};
    for(const format of ['png','pdf']){
      const button=document.querySelector(format==='png'?'#businessPng':'#businessPdf');
      button.onclick=()=>window.JungcarReportExport.save({report:document.querySelector('#businessReport'),button,format,filename:`jungcar-${state.unit}-${state.from}_${state.to}`});
    }
    refresh();
  }
  function refresh(){
    const report=document.querySelector('#businessReport');if(!report)return;
    const now=today(),invalid=!validDate(state.from)||!validDate(state.to)||state.from>state.to,future=state.from>now;
    document.querySelector('#businessPng').disabled=future||invalid;document.querySelector('#businessPdf').disabled=future||invalid;
    if(invalid||future)document.querySelector('#businessCompareControls').innerHTML='';
    if(invalid){report.innerHTML='<p class="panel br-empty" role="alert">시작일과 종료일을 확인해 주세요. 존재하는 날짜를 입력하고 종료일은 시작일 이후로 설정해 주세요.</p>';return;}
    if(future){report.innerHTML='<p class="panel br-empty">아직 시작하지 않은 기간입니다. 현재 또는 과거 기간을 선택해 주세요.</p>';return;}
    const data=build(filteredAnalysisRows(state.filters),state.mode,state.year,state.period,now,{from:state.from,to:state.to,unit:state.unit,compareA:state.compareA,compareB:state.compareB});
    state.compareA=data.compareA?.from||'';state.compareB=data.compareB?.from||'';
    const options=(selectedKey,otherKey)=>data.items.filter(p=>p.from!==otherKey).map(p=>`<option value="${p.from}" ${p.from===selectedKey?'selected':''}>${esc(p.label)}${p.partial?' (부분 집계)':''}</option>`).join('');
    document.querySelector('#businessCompareControls').innerHTML=`<div><strong>고객 수요 비교 구간 · ${unitNames[state.unit]}</strong><p>표·구성 추이는 모든 구간을 표시합니다. 차종·문의 유형의 상세 비교는 아래 A/B를 사용합니다.</p></div><div class="br-compare-pickers"><label>A · 비교 기준<select id="reportCompareA" ${data.compareA?'':'disabled'}>${data.compareA?options(state.compareA,state.compareB):'<option value="">비교 구간 없음</option>'}</select></label><label>B · 비교 대상<select id="reportCompareB" ${data.compareB?'':'disabled'}>${data.compareB?options(state.compareB,state.compareA):'<option value="">기록 없음</option>'}</select></label></div>`;
    report.innerHTML=reportHtml(data,analysisFilterSummary(state.filters),reportGeneratedAt());
  }
  window.JungcarBusinessReports={mount,refresh,period,periodContext,rangeContext,metrics,bucket,visibleSeries,build,reportHtml,validDate,delta,demandData,typeCategories};
})();
