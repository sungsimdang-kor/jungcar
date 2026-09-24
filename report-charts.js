/* Pure, read-only report visualizations. Customer content is always escaped. */
(() => {
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=(value,decimals=0)=>Number(value||0).toLocaleString('ko-KR',{minimumFractionDigits:decimals,maximumFractionDigits:decimals});
  const periodColors=['#3374dc','#8054bf','#138776','#c47c22'];
  const knownColors={'구매':'#3374dc','판매 후 구매':'#138776','판매':'#8054bf','할부/한도':'#c47c22','방문 일정':'#cc6683','수리/보증':'#627a94','기타/문의':'#72812e','미입력':'#94a3b8'};
  const rows=item=>Array.isArray(item?.rows)?item.rows:[];
  const total=item=>Number.isFinite(Number(item?.total))&&Number(item.total)>=0?Number(item.total):rows(item).length;
  const share=(count,item)=>total(item)>0?count/total(item)*100:0;
  const empty=()=>'<p class="rc-empty">선택한 기간에 표시할 상담 기록이 없습니다.</p>';
  function groups(records,key){
    const counts=new Map();
    records.forEach(row=>{
      const values=key==='models'?[...new Set((Array.isArray(row?.models)?row.models:[]).map(v=>String(v??'').trim()).filter(Boolean))]:[String(row?.[key]??'').trim()||'미입력'];
      values.forEach(label=>counts.set(label,(counts.get(label)||0)+1));
    });
    return counts;
  }
  function categoryColor(label){
    if(Object.hasOwn(knownColors,label))return knownColors[label];
    let hash=2166136261;
    for(const c of String(label))hash=Math.imul(hash^c.codePointAt(0),16777619)>>>0;
    return `hsl(${hash%360} ${48+(hash>>>8)%18}% ${37+(hash>>>16)%13}%)`;
  }
  function categoryData(items,key='models',limit=10){
    const maps=items.map(p=>groups(rows(p),key)),labels=[...new Set(maps.flatMap(map=>[...map.keys()]))];
    return labels.map(label=>({label,counts:maps.map(map=>map.get(label)||0)}))
      .sort((a,b)=>b.counts.reduce((s,n)=>s+n,0)-a.counts.reduce((s,n)=>s+n,0)||a.label.localeCompare(b.label,'ko'))
      .slice(0,Number.isFinite(limit)?Math.max(0,limit):undefined);
  }
  function dateNote(item){
    const start=String(item?.start||item?.from||''),end=String(item?.cutoff||item?.to||'');
    return [start&&end?(start===end?start:`${start} ~ ${end}`):start,item?.partial?'부분 집계':''].filter(Boolean).join(' · ');
  }
  function shortName(label){
    const chars=Array.from(label),display=chars.length>26?chars.slice(0,25).join('')+'…':label;
    return Array.from(display).reduce((lines,c,i)=>{if(i%13===0)lines.push('');lines[lines.length-1]+=c;return lines;},[]);
  }
  /* Packing is per side, preserving angular order, so tiny adjacent slices cannot overlap labels. */
  function layoutPieLabels(segments,centerY,height){
    const top=18,bottom=height-18,gap=11;
    const labels=segments.map(segment=>{
      const lines=shortName(segment.label),angle=(segment.start+segment.end)/2;
      return {...segment,angle,side:Math.cos(angle)>=0?'right':'left',lines,height:(lines.length+1)*17,target:centerY+Math.sin(angle)*118};
    });
    for(const side of ['left','right']){
      const same=labels.filter(label=>label.side===side).sort((a,b)=>a.target-b.target);
      let edge=top;
      for(const label of same){label.y=Math.max(label.target,edge+label.height/2);edge=label.y+label.height/2+gap;}
      let last=bottom;
      for(let i=same.length-1;i>=0;i--){const label=same[i];label.y=Math.min(label.y,last-label.height/2);last=label.y-label.height/2-gap;}
    }
    return labels;
  }
  function pie(item,sharedHeight=336){
    const values=[...groups(rows(item),'inquiryType')].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'ko'));
    const count=values.reduce((sum,[,value])=>sum+value,0);
    if(!count)return `<article class="rc-pie-card"><h3>${esc(item.label)}</h3><p>${esc(dateNote(item))}</p><svg class="rc-pie" viewBox="0 0 640 ${sharedHeight}" role="img" aria-label="기록 없음"><text x="320" y="${sharedHeight/2}" text-anchor="middle" fill="#64748b" font-size="14">표시할 상담 기록이 없습니다.</text></svg></article>`;
    let angle=-Math.PI/2;
    const segments=values.map(([label,value])=>{const start=angle;angle+=value/count*Math.PI*2;return {label,value,start,end:angle,color:categoryColor(label)};});
    const sideHeight=side=>segments.filter(p=>(Math.cos((p.start+p.end)/2)>=0?'right':'left')===side).reduce((sum,p)=>sum+(shortName(p.label).length+1)*17+11,0);
    const width=640,height=Math.max(sharedHeight,sideHeight('left')+36,sideHeight('right')+36),cx=320,cy=height/2,r=105,inner=59;
    const point=(a,radius)=>[cx+Math.cos(a)*radius,cy+Math.sin(a)*radius];
    const path=segment=>{
      if(segments.length===1)return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${segment.color}"><title>${esc(segment.label)} ${count}건 (100.0%)</title></circle>`;
      const [x1,y1]=point(segment.start,r),[x2,y2]=point(segment.end,r),large=segment.end-segment.start>Math.PI?1:0;
      return `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z" fill="${segment.color}"><title>${esc(segment.label)} ${segment.value}건 (${number(segment.value/count*100,1)}%)</title></path>`;
    };
    const labels=layoutPieLabels(segments,cy,height).map(label=>{
      const right=label.side==='right',[x,y]=point(label.angle,r+2),[outerX,outerY]=point(label.angle,r+13),bend=right?433:207,end=right?445:195,textX=right?451:189;
      const nameY=label.y-label.height/2+13;
      return `<g class="rc-pie-label" data-category="${esc(label.label)}"><title>${esc(label.label)} ${label.value}건 (${number(label.value/count*100,1)}%)</title><polyline points="${x},${y} ${outerX},${outerY} ${bend},${outerY} ${bend},${label.y} ${end},${label.y}" fill="none" stroke="${label.color}" stroke-width="1.4"/><circle cx="${x}" cy="${y}" r="2" fill="${label.color}"/><text x="${textX}" y="${nameY}" text-anchor="${right?'start':'end'}" font-size="13" font-weight="600" fill="#23466d">${label.lines.map((line,i)=>`<tspan x="${textX}" dy="${i?17:0}">${esc(line)}</tspan>`).join('')}<tspan x="${textX}" dy="17" font-size="12" font-weight="400" fill="#64748b">${number(label.value)}건 · ${number(label.value/count*100,1)}%</tspan></text></g>`;
    }).join('');
    return `<article class="rc-pie-card"><h3>${esc(item.label)}</h3><p>${esc(dateNote(item))}</p><svg class="rc-pie" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(item.label)} 문의 종류 ${number(count)}건"><title>${esc(item.label)} 문의 종류: ${esc(values.map(([label,value])=>`${label} ${value}건 (${number(value/count*100,1)}%)`).join(', '))}</title>${segments.map(path).join('')}<circle cx="${cx}" cy="${cy}" r="${inner}" fill="white"/><text x="${cx}" y="${cy-2}" text-anchor="middle" font-size="27" font-weight="700" fill="#173765">${number(count)}</text><text x="${cx}" y="${cy+23}" text-anchor="middle" font-size="13" fill="#64748b">상담 건수</text>${labels}</svg></article>`;
  }
  function monthlyPies(items){
    if(!items.length)return empty();
    // One shared canvas keeps cards AND ring sizes identical, even with many small categories.
    const height=Math.max(336,...items.map(item=>{
      const entries=[...groups(rows(item),'inquiryType')].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'ko'));
      const count=entries.reduce((sum,[,value])=>sum+value,0),sides={left:0,right:0};let angle=-Math.PI/2;
      entries.forEach(([label,value])=>{const end=angle+value/count*Math.PI*2;const side=Math.cos((angle+end)/2)>=0?'right':'left';sides[side]+=(shortName(label).length+1)*17+11;angle=end;});
      return Math.max(sides.left,sides.right)+36;
    }));
    return '<div class="rc-pies">'+items.map(item=>pie(item,height)).join('')+'</div>';
  }
  function demandBars(items,key='models',limit=10,start=0,end=limit){
    const all=categoryData(items,key,limit),data=all.slice(start,end),max=Math.max(1,...all.flatMap(p=>p.counts));
    if(!data.length)return empty();
    return `<div class="rc-demand-bars">${data.map(category=>`<article class="rc-demand-category"><h4>${esc(category.label)}</h4>${items.map((item,index)=>{
      const value=category.counts[index],color=periodColors[index%periodColors.length],percent=share(value,item);
      return `<div class="rc-demand-line"><span class="rc-demand-date" style="color:${color}">${esc(item.label)}${item.partial?'<small>부분 집계</small>':''}</span><i class="rc-demand-track" role="img" aria-label="${esc(item.label)} ${esc(category.label)} ${number(value)}건"><em style="width:${value/max*100}%;background:${color}"></em></i><b>${number(value)}건 <small>(${number(percent,1)}%)</small></b></div>`;
    }).join('')}</article>`).join('')}</div>`;
  }
  function categoryTable(items,key='models',limit=10,labelsOverride){
    const maps=items.map(item=>groups(rows(item),key));
    const data=Array.isArray(labelsOverride)?[...new Set(labelsOverride.map(label=>String(Array.isArray(label)?label[0]:label?.label??label)))].slice(0,limit).map(label=>({label,counts:maps.map(map=>map.get(label)||0)})):categoryData(items,key,limit);
    if(!items.length||!data.length)return empty();
    return `<div class="rc-table-scroll"><table class="rc-category-table"><thead><tr><th scope="col">${key==='models'?'희망 차종':'문의 종류'}</th>${items.map(item=>`<th scope="col">${esc(item.label)}${item.partial?'<small>부분 집계</small>':''}</th>`).join('')}</tr></thead><tbody><tr class="rc-total"><th scope="row">전체 상담</th>${items.map(item=>`<td>${number(total(item))}건</td>`).join('')}</tr>${data.map(category=>`<tr><th scope="row">${esc(category.label)}</th>${items.map((item,index)=>`<td>${number(category.counts[index])}건 <small>(${number(share(category.counts[index],item),1)}%)</small></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  window.JungcarReportCharts={monthlyPies,demandBars,categoryTable,categoryData,categoryColor,layoutPieLabels};
})();
