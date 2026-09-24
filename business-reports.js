/* Read-only reporting: calculations use the current server-confirmed CRM snapshot. */
(() => {
  const DAY=86400000;
  const state={mode:'month',year:null,period:null,from:'',to:'',unit:'month',selectedPeriods:null,filters:{}};
  const unitNames={day:'일별',week:'주별',month:'월별',quarter:'분기별'};
  const unitNouns={day:'일',week:'주',month:'월',quarter:'분기'};
  const limits={month:2,quarter:4};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=(value,decimals=0)=>value==null?'—':(Math.abs(Number(value))<.5*10**(-decimals)?0:Number(value)).toLocaleString('ko-KR',{maximumFractionDigits:decimals,minimumFractionDigits:decimals});
  const iso=date=>date.toISOString().slice(0,10);
  const time=value=>Date.parse(value+'T00:00:00Z');
  const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&Number.isFinite(time(value))&&iso(new Date(time(value)))===value;
  const days=(from,to)=>Math.max(0,Math.round((time(to)-time(from))/DAY)+1);
  const shiftDay=(date,offset)=>iso(new Date(time(date)+offset*DAY));
  function rangeLimit(unit,from,to){
    if(!validDate(from)||!validDate(to)||from>to)return '시작일과 종료일을 확인해 주세요.';
    if(unit==='day'&&days(from,to)>62)return '일별은 최대 62일입니다. 시작일과 종료일을 줄여 주세요.';
    const end=new Date(time(from)),date=end.getUTCDate();end.setUTCDate(1);end.setUTCMonth(end.getUTCMonth()+2);
    end.setUTCDate(Math.min(date,new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()+1,0)).getUTCDate()));
    const last=shiftDay(iso(end),-1);
    if(unit==='week'&&to>last)return `주별은 시작일부터 두 달 이내로 설정해 주세요. 현재 시작일 기준 종료일은 ${last}까지입니다.`;
    return '';
  }
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
      financeCount:rows.filter(r=>r.financeStatus==='예').length,visitCount:rows.filter(r=>r.visitStatus==='예').length,
      averageBudget:budgets.length?budgets.reduce((a,b)=>a+b,0)/budgets.length:null,budgetCount:budgets.length,
      finance:count?rows.filter(r=>r.financeStatus==='예').length/count*100:null,
      visit:count?rows.filter(r=>r.visitStatus==='예').length/count*100:null};
  }
  function bucket(mode,date){
    if(mode==='day')return {mode,from:date,to:date,label:date,short:date.slice(5).replace('-','/')};
    if(mode==='week'){
      const offset=(new Date(time(date)).getUTCDay()+6)%7,from=shiftDay(date,-offset),to=shiftDay(from,6);
      return {mode,from,to,label:`${from} ~ ${to}`,short:`${from} ~ ${to}`};
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
      return {...p,...metrics(p.rows,start,cutoff),label:mode==='week'?`${start} ~ ${cutoff}`:p.label,start,cutoff,partial:start!==p.from||cutoff!==p.to,hasRecords:true,previousTotal:totals.get(prior.from)||0};
    });
  }
  function delta(current,previous,{rate=false,unit='',decimals=0}={}){
    if(current==null||previous==null)return '<span class="br-neutral">비교 데이터 없음</span>';
    const diff=current-previous,sign=diff>0?'+':'';
    if(rate)return `<span class="${diff>0?'br-up':diff<0?'br-down':'br-neutral'}">${sign}${number(diff,1)}%p</span>`;
    const change=previous===0?(current===0?'변화 없음':'기준값 0 · 증감률 산출 제외'):`${diff>0?'+':''}${number(diff/previous*100,1)}%`;
    return `<span class="${diff>0?'br-up':diff<0?'br-down':'br-neutral'}">${sign}${number(diff,decimals)}${unit}</span><small class="${diff>0?'br-up':diff<0?'br-down':'br-neutral'}">${change}</small>`;
  }
  function groups(rows,key){
    const counts=new Map();
    rows.forEach(row=>{const values=key==='models'?[...new Set((Array.isArray(row.models)?row.models:[]).map(value=>String(value??'').trim()).filter(Boolean))]:[String(row[key]??'').trim()||'미입력'];values.forEach(value=>counts.set(value,(counts.get(value)||0)+1));});
    return [...counts].sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]),'ko'));
  }
  function chart(items,title){
    if(!items.length)return '<p class="br-empty">선택 기간에 표시할 상담 기록이 없습니다.</p>';
    if(items.length===1){const p=items[0];return `<div class="br-single-period"><div><strong>${esc(p.label)}${p.partial?' · 부분 집계':''}</strong><p>${p.start} ~ ${p.cutoff}</p></div><b>${number(p.total)}<span>건</span></b></div>`;}
    const W=1200,H=280,left=55,right=28,top=35,bottom=55,max=Math.max(3,Math.ceil(Math.max(0,...items.map(p=>p.total))/3)*3);
    const plotH=H-top-bottom,step=(W-left-right)/items.length;
    const grid=Array.from({length:4},(_,i)=>{const y=top+plotH*i/3;return `<line x1="${left}" y1="${y}" x2="${W-right}" y2="${y}" stroke="#e4eaf2"/><text x="${left-12}" y="${y+5}" text-anchor="end" fill="#64748b" font-size="13">${number(max*(3-i)/3)}</text>`;}).join('');
    const points=items.map((p,i)=>`${left+step*(i+.5)},${top+plotH*(1-p.total/max)}`).join(' '),stride=Math.ceil(items.length/12);
    return `<svg class="br-chart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}"><title>${esc(title)}. ${esc(items.map(p=>`${p.label}${p.partial?' 부분 집계':''} ${p.total}건`).join(', '))}</title>${grid}<polyline points="${points}" fill="none" stroke="#3374dc" stroke-width="3"/>
      ${items.map((p,i)=>{const x=left+step*(i+.5),y=top+plotH*(1-p.total/max),selected=i===items.length-1,show=i%stride===0||selected;return `<circle cx="${x}" cy="${y}" r="${selected?6:items.length>40?2:4}" fill="${selected?'#173765':'#3374dc'}" stroke="white" stroke-width="1"><title>${esc(p.label)}: ${p.total}건</title></circle>${show?`<text x="${x}" y="${y-13}" text-anchor="middle" fill="#173765" font-size="15" font-weight="700">${number(p.total)}</text><text x="${x}" y="${H-27}" text-anchor="middle" fill="#475569" font-size="14">${esc(p.label)}</text>${p.partial?`<text x="${x}" y="${H-8}" text-anchor="middle" fill="#ad6500" font-size="12">부분 집계</text>`:''}`:''}`;}).join('')}</svg>`;
  }
  function changeCell(value,previous,{unit='',decimals=0,sub='',hasPrevious=false}={}){
    const missing=value==null||previous==null,diff=hasPrevious&&!missing?value-previous:null;
    const rate=diff==null?null:previous===0?(value===0?0:null):diff/previous*100;
    const tone=v=>v==null||v===0?'trend-neutral':v>0?'trend-up':'trend-down';
    const signed=(v,d,suffix)=>v==null?'—':(v>0?'+':'')+number(v,d)+suffix;
    return '<div class="br-stat-cell"><strong>'+number(value,decimals)+(value==null?'':unit)+'</strong>'+(sub?'<span class="br-stat-sub">'+esc(sub)+'</span>':'')+
      '<span class="br-stat-delta"><i>증감</i> <b class="'+tone(diff)+'">'+signed(diff,decimals,unit)+'</b></span>'+
      '<small class="br-stat-rate"><i>증감률</i> <b class="'+tone(rate)+'">'+signed(rate,1,'%')+'</b></small></div>';
  }
  function periodTable(items,unit='month',previousItem=null){
    if(!items.length)return '<p class="br-empty">선택 기간에 표시할 상담 기록이 없습니다.</p>';
    const headers=['기간','상담 수','고객 수','일평균 상담','평균 최대 예산','할부 요청','방문·예약'];
    return '<div class="br-table-scroll"><table class="br-table br-customer-metrics"><thead><tr>'+headers.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+items.map((p,i)=>{
      const prior=i?items[i-1]:previousItem,cell=(key,suffix,decimals=0,sub='')=>'<td>'+changeCell(p[key],prior?.[key],{unit:suffix,decimals,sub,hasPrevious:!!prior})+'</td>';
      return '<tr class="'+(i===items.length-1?'br-selected-row':'')+'"><th>'+esc(p.label)+(p.partial?'<span class="br-inline-tag">부분 집계</span>':'')+'</th>'+
        cell('total','건')+cell('customers','명')+cell('daily','건',1)+cell('averageBudget','만원')+
        cell('financeCount','건',0,number(p.finance,1)+'%')+cell('visitCount','건',0,number(p.visit,1)+'%')+'</tr>';
    }).join('')+'</tbody></table></div>';
  }
  function build(rows,mode,year,index,asOf,selection={}){
    const context=mode==='range'?rangeContext(selection.from,selection.to,asOf):periodContext(mode,year,index,asOf),c=context;
    const currentRows=range(rows,c.current.from,c.cutoff),previousRows=range(rows,c.previous.from,c.previousEnd),lastYearRows=range(rows,c.lastYear.from,c.lastYearEnd);
    const current=metrics(currentRows,c.current.from,c.cutoff),previous=metrics(previousRows,c.previous.from,c.previousEnd),lastYear=metrics(lastYearRows,c.lastYear.from,c.lastYearEnd);
    const months=visibleSeries(rows,'month',c.current.from,c.cutoff),quarters=visibleSeries(rows,'quarter',c.current.from,c.cutoff);
    const unit=unitNames[selection.unit]?selection.unit:'month',error=rangeLimit(unit,c.current.from,c.current.to);
    if(error)throw new Error(error);
    const availableItems=visibleSeries(rows,unit,c.current.from,c.cutoff);
    const legacy=[selection.compareA,selection.compareB].filter(Boolean);
    const chosen=Array.isArray(selection.selectedPeriods)?selection.selectedPeriods:legacy.length?legacy:null;
    const items=chosen?availableItems.filter(p=>chosen.includes(p.from)):limits[unit]?availableItems.slice(-limits[unit]):availableItems;
    if(limits[unit]&&items.length>limits[unit])throw new Error(`${unitNames[unit]}은 최대 ${limits[unit]}개 기간을 선택할 수 있습니다.`);
    const selectedRows=items.flatMap(p=>p.rows),selectedDays=limits[unit]?items.reduce((sum,p)=>sum+days(p.start,p.cutoff),0):days(c.current.from,c.cutoff);
    const selected=metrics(selectedRows,c.current.from,c.cutoff);selected.daily=selectedDays?selected.total/selectedDays:null;
    const compareB=items.find(p=>p.from===selection.compareB)||items.at(-1)||null;
    const compareA=items.find(p=>p.from===selection.compareA&&p.from!==compareB?.from)||items.filter(p=>p.from!==compareB?.from).at(-1)||null;
    return {context,current:selected,previous,lastYear,currentRows:selectedRows,previousRows,months,quarters,unit,items,availableItems,selectedDays,compareA,compareB,missingDates:rows.filter(r=>!validDate(r.inquiryDate)).length};
  }
  function demandData(a,b,key,limit){
    const before=new Map(groups(a?.rows||[],key)),after=new Map(groups(b?.rows||[],key));
    return [...new Set([...before.keys(),...after.keys()])].map(label=>({label,a:before.get(label)||0,b:after.get(label)||0}))
      .sort((x,y)=>(y.a+y.b)-(x.a+x.b)||String(x.label).localeCompare(String(y.label),'ko')).slice(0,limit);
  }
  function reportHtml(data,filterSummary,createdAt){
    return window.JungcarReportLayout.render(data,filterSummary,createdAt,{chart,periodTable,delta,changeCell,groups,number,esc,unitNames});
  }
  function mount(){
    const now=today();
    if(!state.year){state.year=Number(now.slice(0,4));state.period=Number(now.slice(5,7));}
    if(state.mode!=='range'){const p=period(state.mode,state.year,state.period);state.from=p.from;state.to=p.to;}
    const years=[...new Set([Number(now.slice(0,4)),state.year,...leads.filter(r=>validDate(r.inquiryDate)).map(r=>Number(r.inquiryDate.slice(0,4)))])].sort((a,b)=>b-a);
    const periodControls=state.mode==='range'?`<label>시작일<input type="date" name="from" value="${esc(state.from)}"></label><label>종료일<input type="date" name="to" value="${esc(state.to)}"></label>`:`<label>연도<select name="year">${years.map(y=>`<option ${y===state.year?'selected':''}>${y}</option>`).join('')}</select></label><label>${state.mode==='quarter'?'분기':'월'}<select name="period">${Array.from({length:state.mode==='quarter'?4:12},(_,i)=>`<option value="${i+1}" ${i+1===state.period?'selected':''}>${i+1}${state.mode==='quarter'?'분기':'월'}</option>`).join('')}</select></label>`;
    app.innerHTML=`<section class="panel br-controls"><div class="br-control-title"><div><h2>리포트</h2></div><div class="report-actions"><button id="businessPng">PNG 저장</button><button id="businessPdf" class="br-primary">PDF 보고서 저장</button></div></div><form id="businessPeriod" class="br-period-controls"><label>기간 설정<select name="mode"><option value="month" ${state.mode==='month'?'selected':''}>한 달 선택</option><option value="quarter" ${state.mode==='quarter'?'selected':''}>한 분기 선택</option><option value="range" ${state.mode==='range'?'selected':''}>기간 직접 설정</option></select></label>${periodControls}<label>집계 단위<select name="unit">${Object.entries(unitNames).map(([key,label])=>`<option value="${key}" ${key===state.unit?'selected':''}>${label}${key==='week'?' (월~일)':''}</option>`).join('')}</select></label><button type="button" id="businessThisPeriod">이번 ${state.mode==='quarter'?'분기':'달'}</button></form><div id="businessCompareControls" class="br-compare-controls"></div><details class="br-extra-filters"><summary>상세 필터 · 차종, 문의 종류, 할부, 방문, 예산</summary><form id="businessFilters" class="filter-grid">${analysisFilterFields(state.filters)}</form><button type="button" id="businessResetFilters">필터 초기화</button></details></section><div id="businessReport" class="business-report" aria-live="polite"></div>`;
    const form=document.querySelector('#businessPeriod');
    form.addEventListener('submit',event=>event.preventDefault());
    form.addEventListener('change',event=>{
      const values=Object.fromEntries(new FormData(form)),oldMode=state.mode;
      state.selectedPeriods=null;
      if(event.target.name==='unit'){state.unit=values.unit;refresh();return;}
      if(oldMode==='range'&&values.mode==='range'){state.from=values.from;state.to=values.to;refresh();return;}
      const month=oldMode==='range'?(Number(state.from.slice(5,7))||Number(now.slice(5,7))):oldMode==='quarter'?(state.period-1)*3+1:state.period;
      state.mode=values.mode;state.year=Number(values.year)||Number(state.from.slice(0,4))||state.year;
      if(state.mode!=='range')state.period=oldMode===state.mode?Number(values.period):state.mode==='quarter'?Math.ceil(month/3):month;
      mount();
    });
    document.querySelector('#businessThisPeriod').onclick=()=>{if(state.mode==='range')state.mode='month';state.year=Number(now.slice(0,4));state.period=state.mode==='quarter'?Math.ceil(Number(now.slice(5,7))/3):Number(now.slice(5,7));state.selectedPeriods=null;mount();};
    document.querySelector('#businessCompareControls').onchange=()=>{state.selectedPeriods=[...document.querySelectorAll('[name="reportPeriod"]:checked')].map(input=>input.value);refresh();};
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
    const error=invalid?'존재하는 날짜를 입력하고 종료일은 시작일 이후로 설정해 주세요.':future?'아직 시작하지 않은 기간입니다. 현재 또는 과거 기간을 선택해 주세요.':rangeLimit(state.unit,state.from,state.to);
    for(const id of ['businessPng','businessPdf'])document.getElementById(id).disabled=!!error;
    if(error){document.querySelector('#businessCompareControls').innerHTML='';report.innerHTML='<p class="panel br-empty" role="alert">'+esc(error)+'</p>';return;}
    const data=build(filteredAnalysisRows(state.filters),state.mode,state.year,state.period,now,{from:state.from,to:state.to,unit:state.unit,selectedPeriods:state.selectedPeriods});
    if(limits[state.unit]){
      const chosen=new Set(data.items.map(p=>p.from)),max=limits[state.unit];
      document.querySelector('#businessCompareControls').innerHTML='<strong>'+unitNames[state.unit]+' · '+data.items.length+' / '+max+'</strong><div class="br-period-checks">'+data.availableItems.map(p=>'<label><input type="checkbox" name="reportPeriod" value="'+p.from+'" '+(chosen.has(p.from)?'checked':chosen.size>=max?'disabled':'')+'><span>'+esc(p.label)+(p.partial?' <small>부분 집계</small>':'')+'</span></label>').join('')+'</div>';
    }else document.querySelector('#businessCompareControls').innerHTML='';
    data.insights=window.JungcarReportInsights.analyze(data.items,{includeMemo:false});
    report.innerHTML=reportHtml(data,analysisFilterSummary(state.filters),reportGeneratedAt());
    if(!data.items.length)for(const id of ['businessPng','businessPdf'])document.getElementById(id).disabled=true;
  }
  window.JungcarBusinessReports={mount,refresh,period,periodContext,rangeContext,metrics,bucket,visibleSeries,build,reportHtml,validDate,rangeLimit,delta,changeCell,periodTable,demandData};
})();
