/* Aggregate-only, read-only reporting. Never return memo text, contacts or individual records. */
(() => {
  const DAY=86400000;
  const WEEKDAYS=[['월요일',1],['화요일',2],['수요일',3],['목요일',4],['금요일',5],['토요일',6],['일요일',0]];
  const dateTime=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?Date.parse(`${value}T00:00:00Z`):NaN;
  const validDate=value=>Number.isFinite(dateTime(value))&&new Date(dateTime(value)).toISOString().slice(0,10)===value;
  const dayCount=(from,to)=>validDate(from)&&validDate(to)&&from<=to?Math.round((dateTime(to)-dateTime(from))/DAY)+1:0;
  const percent=(count,total)=>total>0?count/total*100:null;
  const phone=value=>{const digits=String(value||'').replace(/\D/g,'');return /^\d{8,11}$/.test(digits)?digits:'';};
  const cleanTerm=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^가-힣a-z0-9]/g,'');
  const numeric=value=>{if(value==null||String(value).trim()==='')return null;const result=Number(String(value).replace(/,/g,''));return Number.isFinite(result)?result:null;};
  const difference=(before,after)=>({before,after,change:before==null||after==null?null:after-before,
    percentChange:before==null||after==null||before===0?null:(after-before)/before*100});

  // A controlled vocabulary prevents customer names, addresses, identifiers and arbitrary memo content from leaking into exports.
  // This is word mention analysis, not inference of intent, sentiment, approval or causality.
  const SIGNALS=[
    ['출퇴근',['출퇴근','출근','퇴근']],['첫차',['첫차','첫 차']],['초보운전',['초보운전','초보 운전','초보']],
    ['가족',['가족','패밀리']],['육아',['육아','아이동승','아이 동승']],['캠핑',['캠핑']],['차박',['차박']],
    ['여행',['여행']],['장거리',['장거리']],['단거리',['단거리']],['고속도로',['고속도로']],['시내주행',['시내주행','시내 주행']],
    ['업무용',['업무용','업무 용']],['영업용',['영업용','영업 용']],['배달',['배달']],
    ['무사고',['무사고']],['사고',['사고']],['침수',['침수']],['보험이력',['보험이력','보험 이력']],
    ['교환',['교환']],['수리',['수리']],['정비',['정비']],['보증',['보증']],['환불',['환불']],
    ['비흡연',['비흡연','금연']],['냄새',['냄새']],['소음',['소음']],['누유',['누유']],['점검',['점검']],
    ['저신용',['저신용']],['신용회복',['신용회복','신용 회복']],['개인회생',['개인회생','개인 회생','회생']],
    ['파산',['파산']],['신용',['신용']],['대출',['대출']],['할부',['할부']],['현금',['현금']],
    ['선수금',['선수금']],['무보증',['무보증']],['보증금',['보증금']],['금리',['금리']],
    ['할인',['할인']],['가격협의',['가격협의','가격 협의','가격협상','가격 협상','가격조정','가격 조정','네고']],
    ['탁송',['탁송']],['배송',['배송']],['방문',['방문']],['시승',['시승']],['예약',['예약']],
    ['실매물',['실매물']],['허위매물',['허위매물','허위 매물']],['매입',['매입']],['대차',['대차']],
    ['판매후구매',['판매후구매','판매 후 구매']],['급구',['급구']],['즉시구매',['즉시구매','즉시 구매']],
    ['유지비',['유지비']],['경제성',['경제성']],['안전',['안전']],['적재',['적재']],['주차',['주차']]
  ];
  const GENERIC=new Set(['희망','문의','가능','차량','구매','고객','전화','연락','상담','확인','요청','모델','차종','이름','담당자']);
  const VEHICLE_TERMS=new Set(('현대 기아 제네시스 쉐보레 대우 르노 삼성 쌍용 케이지모빌리티 벤츠 비엠더블유 아우디 폭스바겐 볼보 렉서스 토요타 도요타 혼다 닛산 인피니티 푸조 시트로엥 지프 포드 링컨 미니 테슬라 포르쉐 랜드로버 재규어 페라리 마세라티 람보르기니 벤틀리 롤스로이스 '+
    '가솔린 휘발유 경유 디젤 하이브리드 전기 수소 엘피지 lpg hev phev ev 터보 자동 수동 오토 미션 이륜 사륜 전륜 후륜 awd 4wd 2wd suv rv 세단 해치백 왜건 쿠페 컨버터블 픽업 '+
    '프리미엄 프레스티지 익스클루시브 인스퍼레이션 노블레스 시그니처 캘리그래피 모던 스마트 럭셔리 디럭스 트렌디 스타일 플래티넘 리미티드 어드벤처 인텐스 르블랑 lt ltz ls premier classic ultimate sport amg mline sline '+
    '옵션 트림 등급 연식 주행거리 배기량 마력 토크 색상 화이트 블랙 그레이 흰색 검정색 회색 은색 베이지 썬루프 선루프 파노라마 내비 네비 내비게이션 네비게이션 통풍 열선 시트 가죽 휠').split(/\s+/).map(cleanTerm));
  const SUFFIX=/^(?:(?:은|는|을|를|이|가|에|에서|으로|로|과|와|도|만|랑|이나|거나|이며|하고|이고|입니다|용|요청|희망|문의|가능|불가|필요|예정|원함|원합니다|고려|선호|확인|관련|여부|차량|차|등급|문제|내역|이력|많음|있음|없음|없고|있고|없는|있는|없다|있다|상담|부탁|조건|때문|위주|목적|비용|견적|진행|계획))*$/;
  const PHRASES=SIGNALS.flatMap(([,aliases])=>aliases).filter(alias=>alias.includes(' ')).sort((a,b)=>b.length-a.length);
  const SIGNAL_ALIASES=SIGNALS.flatMap(([term,list])=>list.map(alias=>({term,alias:cleanTerm(alias)}))).sort((a,b)=>b.alias.length-a.alias.length);
  function exclusions(items,additional){
    const excluded=new Set(VEHICLE_TERMS);
    const add=value=>{
      const full=cleanTerm(value);if(full)excluded.add(full);
      String(value||'').split(/[\s/(),·]+/).map(cleanTerm).filter(Boolean).forEach(term=>excluded.add(term));
    };
    (Array.isArray(additional)?additional:[]).forEach(add);
    items.forEach(item=>(item.rows||[]).forEach(row=>{
      (Array.isArray(row.models)?row.models:[]).forEach(add);
      ['manufacturer','maker','brand','fuel','fuelType','trim','grade'].forEach(key=>{if(row[key])add(row[key]);});
    }));
    return excluded;
  }
  function memoTokens(raw,excluded){
    if(typeof raw!=='string'||!raw.trim())return new Set();
    let text=raw.normalize('NFKC').toLowerCase().replace(/(?:https?:\/\/|www\.)\S+|[^\s@]+@[^\s@]+/g,' ')
      .replace(/\d[\d\s().-]{5,}\d/g,' ');
    // Join only known phrases. We never return an unrecognized token from customer notes.
    PHRASES.forEach(alias=>{text=text.split(alias).join(alias.replace(/\s/g,''));});
    const found=new Set();
    for(const token of text.match(/[가-힣a-z0-9]+/g)||[]){
      if(/\d/.test(token)||GENERIC.has(token)||excluded.has(token))continue;
      // Exclusion prefixes cover model/trim strings with Korean grammatical suffixes.
      if([...excluded].some(term=>term.length>=2&&token.startsWith(term)&&SUFFIX.test(token.slice(term.length))))continue;
      for(const {term,alias} of SIGNAL_ALIASES){
        if(excluded.has(cleanTerm(term))||excluded.has(alias))continue;
        if(token.startsWith(alias)&&SUFFIX.test(token.slice(alias.length))){found.add(term);break;}
      }
    }
    return found;
  }
  function categoryCounts(rows,key){
    const counts=new Map();
    rows.forEach(row=>{
      const values=key==='models'?[...new Set((Array.isArray(row.models)?row.models:[]).map(value=>String(value??'').trim()).filter(Boolean))]:[String(row[key]??'').trim()||'미입력'];
      values.forEach(value=>counts.set(value,(counts.get(value)||0)+1));
    });
    return [...counts].map(([label,count])=>({label,count,share:percent(count,rows.length)})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,'ko'));
  }
  function periodMetrics(item){
    const start=item.start||item.from,end=item.cutoff||item.to,days=dayCount(start,end);
    const rows=(Array.isArray(item.rows)?item.rows:[]).filter(row=>row&&validDate(row.inquiryDate)&&(!days||(row.inquiryDate>=start&&row.inquiryDate<=end)));
    const weekdays=WEEKDAYS.map(([day,index])=>({day,index,count:0,occurrences:0,perDay:null}));
    const weekdayMap=new Map(weekdays.map(value=>[value.index,value]));
    // Count complete weeks arithmetically; the remainder is at most six days.
    if(days){
      weekdays.forEach(value=>value.occurrences=Math.floor(days/7));
      const first=new Date(dateTime(start)).getUTCDay();
      for(let offset=0;offset<days%7;offset++)weekdayMap.get((first+offset)%7).occurrences++;
    }
    rows.forEach(row=>weekdayMap.get(new Date(dateTime(row.inquiryDate)).getUTCDay()).count++);
    weekdays.forEach(value=>value.perDay=value.occurrences?value.count/value.occurrences:null);
    const highest=Math.max(0,...weekdays.map(value=>value.perDay||0)),maxCount=Math.max(0,...weekdays.map(value=>value.count));
    const budgets=rows.map(row=>numeric(row.budgetMax)).filter(value=>value!=null&&value>0),contacts=new Set(rows.map(row=>phone(row.phone)).filter(Boolean));
    const countStatus=key=>{const count=rows.filter(row=>row[key]==='예').length;return {count,rate:percent(count,rows.length)};};
    return {key:String(item.from||start||''),label:String(item.label||`${start} ~ ${end}`),start,end,partial:Boolean(item.partial),days,total:rows.length,
      customers:contacts.size,daily:days?rows.length/days:null,finance:countStatus('financeStatus'),visit:countStatus('visitStatus'),
      averageBudget:budgets.length?budgets.reduce((a,b)=>a+b,0)/budgets.length:null,budgetCount:budgets.length,
      weekdays,peakWeekdays:highest>0?weekdays.filter(value=>Math.abs(value.perDay-highest)<1e-9).map(value=>value.day):[],
      countPeakWeekdays:maxCount>0?weekdays.filter(value=>value.count===maxCount).map(value=>value.day):[],
      models:categoryCounts(rows,'models'),inquiryTypes:categoryCounts(rows,'inquiryType')};
  }
  function categoryChanges(before,after,beforeTotal,afterTotal){
    const old=new Map(before.map(item=>[item.label,item])),current=new Map(after.map(item=>[item.label,item]));
    return [...new Set([...old.keys(),...current.keys()])].map(label=>{
      const first=old.get(label)||{count:0,share:beforeTotal?0:null},last=current.get(label)||{count:0,share:afterTotal?0:null};
      return {label,before:first.count,after:last.count,change:last.count-first.count,shareBefore:first.share,shareAfter:last.share,
        percentagePoints:first.share==null||last.share==null?null:last.share-first.share};
    }).sort((a,b)=>Math.abs(b.percentagePoints)-Math.abs(a.percentagePoints)||(b.before+b.after)-(a.before+a.after)||a.label.localeCompare(b.label,'ko'));
  }
  function compare(before,after){
    const warnings=[];
    if(before.partial||after.partial)warnings.push('부분 집계가 포함되어 있습니다. 누적 건수보다 일평균과 비중을 함께 확인하세요.');
    if(before.days!==after.days)warnings.push('집계 일수가 다릅니다. 건수 증감은 기간 길이의 영향을 받습니다.');
    if(before.total<20||after.total<20)warnings.push('20건 미만의 구간이 포함되어 작은 표본에 따른 변동이 클 수 있습니다.');
    const status=key=>({before:before[key].rate,after:after[key].rate,beforeCount:before[key].count,afterCount:after[key].count,
      countChange:after[key].count-before[key].count,percentagePoints:before[key].rate==null||after[key].rate==null?null:after[key].rate-before[key].rate});
    return {fromKey:before.key,toKey:after.key,fromLabel:before.label,toLabel:after.label,total:difference(before.total,after.total),daily:difference(before.daily,after.daily),
      finance:status('finance'),visit:status('visit'),budget:difference(before.averageBudget,after.averageBudget),
      weekday:{before:before.peakWeekdays,after:after.peakWeekdays,changed:before.peakWeekdays.join('|')!==after.peakWeekdays.join('|'),normalized:true},
      models:categoryChanges(before.models,after.models,before.total,after.total),inquiryTypes:categoryChanges(before.inquiryTypes,after.inquiryTypes,before.total,after.total),warnings};
  }
  function memoAnalysis(items,periods,excluded){
    const terms=new Map();
    items.forEach((item,index)=>{
      const period=periods[index];
      (item.rows||[]).forEach(row=>{
        if(!row||!validDate(row.inquiryDate)||(period.days&&(row.inquiryDate<period.start||row.inquiryDate>period.end)))return;
        memoTokens(row.conditionRaw,excluded).forEach(term=>{
          if(!terms.has(term))terms.set(term,{term,counts:Array(items.length).fill(0),contacts:new Set(),identifiedMentions:0});
          const value=terms.get(term),contact=phone(row.phone);value.counts[index]++;
          if(contact){value.contacts.add(contact);value.identifiedMentions++;}
        });
      });
    });
    return [...terms.values()].filter(value=>value.counts.reduce((sum,count)=>sum+count,0)>=3&&(!value.identifiedMentions||value.contacts.size>=2))
      .map(value=>{
        const entries=periods.map((period,index)=>({key:period.key,label:period.label,count:value.counts[index],share:percent(value.counts[index],period.total)}));
        return {term:value.term,total:value.counts.reduce((sum,count)=>sum+count,0),customers:value.identifiedMentions?value.contacts.size:null,
          identifiedMentions:value.identifiedMentions,periods:entries,periodCount:value.counts.filter(Boolean).length,
          consecutive:value.counts.some((count,index)=>index>0&&count>0&&value.counts[index-1]>0),
          changes:entries.slice(1).map((entry,index)=>({fromKey:entries[index].key,toKey:entry.key,fromLabel:entries[index].label,toLabel:entry.label,
            before:entries[index].count,after:entry.count,change:entry.count-entries[index].count,
            shareBefore:entries[index].share,shareAfter:entry.share,percentagePoints:entries[index].share==null||entry.share==null?null:entry.share-entries[index].share}))};
      }).sort((a,b)=>b.total-a.total||b.periodCount-a.periodCount||a.term.localeCompare(b.term,'ko')).slice(0,16);
  }
  function coverage(items,periods){
    const entries=periods.map((period,index)=>{
      const withMemo=items[index].rows.filter(row=>row&&validDate(row.inquiryDate)&&(!period.days||(row.inquiryDate>=period.start&&row.inquiryDate<=period.end))&&typeof row.conditionRaw==='string'&&row.conditionRaw.trim()).length;
      return {key:period.key,label:period.label,total:period.total,withMemo,share:percent(withMemo,period.total)};
    });
    const total=entries.reduce((sum,entry)=>sum+entry.total,0),withMemo=entries.reduce((sum,entry)=>sum+entry.withMemo,0);
    return {total,withMemo,share:percent(withMemo,total),periods:entries};
  }
  function suggestions(comparisons,memoTerms){
    const last=comparisons.at(-1);if(!last)return [];
    const out=[],scope=`${last.fromLabel} → ${last.toLabel}`,format=value=>(Math.abs(value)<.05?0:value).toFixed(1),signed=value=>`${value>0?'+':''}${format(value)}`;
    const add=(kind,title,detail,action)=>out.push({kind,fromLabel:last.fromLabel,toLabel:last.toLabel,title,detail,action,caution:last.warnings.join(' ')});
    if(last.weekday.changed&&last.weekday.before.length&&last.weekday.after.length){
      add('weekday','문의 집중 요일 점검',`${scope}: 요일당 평균 최다 문의가 ${last.weekday.before.join('·')}에서 ${last.weekday.after.join('·')}로 바뀌었습니다.`,
        '해당 요일의 응대 인력과 광고 노출 일정을 점검하세요. 광고 효과는 노출·비용·전환 자료로 별도 확인해야 합니다.');
    }
    if(last.finance.percentagePoints!=null&&Math.abs(last.finance.percentagePoints)>=5){
      add('finance','할부 안내 비중 점검',`${scope}: 할부 조회 요청 비중 ${format(last.finance.before)}% → ${format(last.finance.after)}% (${signed(last.finance.percentagePoints)}%p), 요청 건수 ${last.finance.beforeCount}건 → ${last.finance.afterCount}건입니다.`,
        '할부 안내 문구와 상담 준비사항을 점검하세요. 조회 요청은 승인이나 계약 실적이 아닙니다.');
    }
    const recurring=memoTerms.filter(term=>term.periods.at(-1)?.count>=3).sort((a,b)=>Math.abs(b.changes.at(-1)?.percentagePoints||0)-Math.abs(a.changes.at(-1)?.percentagePoints||0)||b.total-a.total)[0];
    if(recurring){
      const change=recurring.changes.at(-1),now=recurring.periods.at(-1);
      add('memo','반복 언급 내용 확인',`${now.label}: ‘${recurring.term}’ ${now.count}건 (${format(now.share)}%)${change?.percentagePoints==null?'':`, 직전 선택 기간보다 ${signed(change.percentagePoints)}%p`}입니다.`,
        '원문 상담 내용을 확인한 뒤 안내 문구나 준비 매물을 조정할지 검토하세요. 단어 언급만으로 실제 선호나 긍정·부정을 판단하지 않습니다.');
    }
    if(last.daily.percentChange!=null&&Math.abs(last.daily.percentChange)>=10){
      add('daily','일평균 문의 유입 점검',`${scope}: 일평균 상담 ${format(last.daily.before)}건 → ${format(last.daily.after)}건 (${signed(last.daily.percentChange)}%)입니다.`,
        '운영일·휴일·유입 경로를 함께 확인하고 광고 집행 기록과 대조하세요. 상담량 변화만으로 특정 광고의 성과를 단정하지 않습니다.');
    }
    if(out.length<4){
      const changed=last.models.find(value=>Math.abs(value.percentagePoints)>=10&&Math.max(value.before,value.after)>=3);
      if(changed)add('model','차종 안내 우선순위 검토',`${scope}: ${changed.label} 언급 비중 ${format(changed.shareBefore)}% → ${format(changed.shareAfter)}% (${signed(changed.percentagePoints)}%p)입니다.`,
        '차종별 문의 내용과 보유 매물을 함께 확인해 소개 순서를 검토하세요. 복수 차종 문의는 각각 집계되며 판매량을 뜻하지 않습니다.');
    }
    return out.slice(0,4);
  }
  function analyze(items,{excludedTerms=[]}={}){
    const ordered=(Array.isArray(items)?items:[]).filter(item=>item&&Array.isArray(item.rows)).slice().sort((a,b)=>String(a.from||a.start||'').localeCompare(String(b.from||b.start||'')));
    const periods=ordered.map(periodMetrics),comparisons=periods.slice(1).map((period,index)=>compare(periods[index],period));
    const cautions=[];
    if(periods.some(period=>period.partial))cautions.push('진행 중이거나 선택 범위에서 잘린 기간은 부분 집계입니다.');
    if(periods.some(period=>period.total<20))cautions.push('20건 미만 구간은 작은 표본이므로 일반적인 고객 성향으로 단정하지 마세요.');
    if(periods.length<2)cautions.push('변화 비교를 위해 기록이 있는 기간을 두 개 이상 선택하세요.');
    const memoTerms=memoAnalysis(ordered,periods,exclusions(ordered,excludedTerms));
    return {periods,comparisons,memoTerms,memoCoverage:coverage(ordered,periods),suggestions:suggestions(comparisons,memoTerms),cautions,
      methodology:{weekdays:'요일별 건수를 해당 기간의 동일 요일 수로 나눈 평균으로 비교합니다. 동률 요일은 모두 표시합니다.',
        finance:'할부 조회 요청 토글이 켜진 기록(financeStatus=예)을 집계하며 문의 종류나 메모 단어로 추정하지 않습니다.',
        memo:'개인정보 보호를 위해 업무 키워드 사전만 탐지합니다. 상담 1건당 단어 1회, 총 3건 이상을 표시하며 전화번호가 있는 기록은 2명 이상이어야 합니다. 차종·제조사·유종·트림·제원 및 일반 표현은 제외합니다. 단어 언급은 실제 수요나 긍정·부정을 뜻하지 않습니다.',
        comparison:'선택한 기간을 날짜순으로 정렬해 이웃한 기간끼리 비교합니다. 비중 차이는 %p이며 광고 성과·매출·인과관계를 의미하지 않습니다.'}};
  }
  window.JungcarReportInsights={analyze};
})();
