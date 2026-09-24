/* Local-only report rendering. No report data is sent to a conversion service. */
(() => {
  const loading=new Map();
  let busy=false;
  function library(src,ready){
    if(ready())return Promise.resolve(ready());
    if(loading.has(src))return loading.get(src);
    const promise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      const timer=setTimeout(()=>fail(),20000);
      const fail=()=>{clearTimeout(timer);script.remove();reject(new Error('보고서 저장 도구를 불러오지 못했습니다. 연결 확인 후 다시 시도해 주세요.'));};
      script.src=src;script.onload=()=>{clearTimeout(timer);ready()?resolve(ready()):fail();};script.onerror=fail;
      document.head.appendChild(script);
    }).catch(error=>{loading.delete(src);throw error;});
    loading.set(src,promise);return promise;
  }
  function download(blob,name){
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  function pageRanges(height,capacity,boundaries){
    const pages=[];let start=0;
    while(start<height){
      const limit=Math.min(height,start+capacity);
      const safe=boundaries.filter(y=>y>start+1&&y<=limit);
      const end=limit===height?height:safe.at(-1)||limit;
      pages.push([start,end]);start=end;
    }
    return pages;
  }
  const crcTable=Uint32Array.from({length:256},(_,value)=>{
    for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;
    return value>>>0;
  });
  function crc32(bytes){
    let crc=0xffffffff;
    for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);
    return (crc^0xffffffff)>>>0;
  }
  function pageFileName(index){
    if(!Number.isInteger(index)||index<0||index>=65535)throw new Error('PNG 페이지 수가 저장 가능한 범위를 벗어났습니다.');
    return `page-${String(index+1).padStart(3,'0')}.png`;
  }
  // Uncompressed ZIP32: PNG already compresses its pixels, so another codec adds cost without benefit.
  function packZip(entries){
    if(!Array.isArray(entries)||entries.length>65535)throw new Error('ZIP 파일에 포함할 페이지 수를 확인해 주세요.');
    const locals=[],central=[],names=new Set();let offset=0,centralSize=0;
    const header=size=>{const bytes=new Uint8Array(size);return {bytes,view:new DataView(bytes.buffer)};};
    for(const entry of entries){
      if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}\.png$/.test(entry?.name||'')||names.has(entry.name))throw new Error('PNG 페이지 파일명이 올바르지 않거나 중복되었습니다.');
      if(!ArrayBuffer.isView(entry.data)||entry.data.BYTES_PER_ELEMENT!==1)throw new Error('PNG 페이지 데이터가 올바르지 않습니다.');
      names.add(entry.name);
      const name=Uint8Array.from(entry.name,c=>c.charCodeAt(0)),data=new Uint8Array(entry.data.buffer,entry.data.byteOffset,entry.data.byteLength),size=data.byteLength;
      if(size>0xffffffff||offset+30+name.length+size>0xffffffff)throw new Error('ZIP 파일이 너무 큽니다. 기간을 나누어 저장해 주세요.');
      const crc=crc32(data),local=header(30),l=local.view;
      l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x0800,true);l.setUint16(10,0,true);l.setUint16(12,33,true);
      l.setUint32(14,crc,true);l.setUint32(18,size,true);l.setUint32(22,size,true);l.setUint16(26,name.length,true);
      locals.push(local.bytes,name,data);
      const directory=header(46),d=directory.view;
      d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x0800,true);d.setUint16(12,0,true);d.setUint16(14,33,true);
      d.setUint32(16,crc,true);d.setUint32(20,size,true);d.setUint32(24,size,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);
      central.push(directory.bytes,name);centralSize+=46+name.length;offset+=30+name.length+size;
    }
    if(offset+centralSize+22>0xffffffff)throw new Error('ZIP 파일이 너무 큽니다. 기간을 나누어 저장해 주세요.');
    const end=header(22),e=end.view;
    e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
    return new Blob([...locals,...central,end.bytes],{type:'application/zip'});
  }
  function shouldZipPng(width,height,pageCount,format='png'){
    return format==='png'&&pageCount>0&&width>0&&height>0&&Math.min(2,16000/width,16000/height,Math.sqrt(24000000/(width*height)))<1.5;
  }
  async function save({report,button,format,filename}){
    if(busy||!report||!button)return;
    busy=true;const label=button.textContent;button.disabled=true;button.textContent='파일 만드는 중…';
    const host=document.createElement('div');
    host.className='report-export-host';host.setAttribute('aria-hidden','true');host.inert=true;
    const copy=report.cloneNode(true);
    copy.removeAttribute('id');copy.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
    copy.classList.add('report-export');host.appendChild(copy);document.body.appendChild(host);
    try{
      const [renderer,pdfLibrary]=await Promise.all([
        library('./vendor/html-to-image-1.11.13.js',()=>window.htmlToImage),
        format==='pdf'?library('./vendor/jspdf-4.2.1.umd.min.js',()=>window.jspdf):null,
        document.fonts?.ready
      ]);
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const explicitPages=[...copy.querySelectorAll('[data-report-page]')];
      // Render each report page independently so long daily reports keep readable resolution.
      if(format==='pdf'&&explicitPages.length){
        const pdf=new pdfLibrary.jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
        const pageWidth=pdf.internal.pageSize.getWidth(),pageHeight=pdf.internal.pageSize.getHeight(),margin=10;
        for(let index=0;index<explicitPages.length;index++){
          button.textContent=`PDF 만드는 중… ${index+1}/${explicitPages.length}`;
          const node=explicitPages[index],width=Math.ceil(Math.max(node.getBoundingClientRect().width,node.scrollWidth)),height=Math.ceil(Math.max(node.getBoundingClientRect().height,node.scrollHeight));
          const canvas=await renderer.toCanvas(node,{width,height,canvasWidth:width,canvasHeight:height,pixelRatio:Math.min(2,16000/width,16000/height,Math.sqrt(24000000/(width*height))),skipAutoScale:true,backgroundColor:node.classList.contains('br-page')?'#fff':'#f5f7fb',fontEmbedCSS:'',style:{margin:'0',transform:'none',width:`${width}px`,height:`${height}px`,maxWidth:'none',boxSizing:'border-box'}});
          if(!canvas.width||!canvas.height)throw new Error('보고서 페이지를 만들지 못했습니다. 다시 시도해 주세요.');
          if(index)pdf.addPage();
          const fittedWidth=Math.min(pageWidth-margin*2,(pageHeight-margin*2-6)*canvas.width/canvas.height);
          pdf.addImage(canvas.toDataURL('image/png'),'PNG',(pageWidth-fittedWidth)/2,margin,fittedWidth,canvas.height/canvas.width*fittedWidth,undefined,'FAST');
          pdf.setFontSize(9);pdf.setTextColor(100);pdf.text(`${index+1} / ${explicitPages.length}`,pageWidth-margin,pageHeight-6,{align:'right'});
          canvas.width=0;canvas.height=0;
        }
        download(pdf.output('blob'),filename+'.pdf');return;
      }
      const width=Math.ceil(Math.max(copy.getBoundingClientRect().width,copy.scrollWidth));
      const height=Math.ceil(Math.max(copy.getBoundingClientRect().height,copy.scrollHeight));
      const pixelRatio=Math.min(2,16000/width,16000/height,Math.sqrt(24000000/(width*height)));
      // Avoid an unreadably downscaled single image for long daily/weekly reports.
      if(shouldZipPng(width,height,explicitPages.length,format)){
        const entries=[];
        for(let index=0;index<explicitPages.length;index++){
          button.textContent=`PNG 페이지 만드는 중… ${index+1}/${explicitPages.length}`;
          const node=explicitPages[index],pageWidth=Math.ceil(Math.max(node.getBoundingClientRect().width,node.scrollWidth)),pageHeight=Math.ceil(Math.max(node.getBoundingClientRect().height,node.scrollHeight));
          const canvas=await renderer.toCanvas(node,{width:pageWidth,height:pageHeight,canvasWidth:pageWidth,canvasHeight:pageHeight,pixelRatio:Math.min(2,16000/pageWidth,16000/pageHeight,Math.sqrt(24000000/(pageWidth*pageHeight))),skipAutoScale:true,backgroundColor:node.classList.contains('br-page')?'#fff':'#f5f7fb',fontEmbedCSS:'',style:{margin:'0',transform:'none',width:`${pageWidth}px`,height:`${pageHeight}px`,maxWidth:'none',boxSizing:'border-box'}});
          try{
            if(!canvas.width||!canvas.height)throw new Error('PNG 페이지를 만들지 못했습니다. 다시 시도해 주세요.');
            const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
            if(!blob)throw new Error('PNG 페이지 파일을 만들지 못했습니다.');
            entries.push({name:pageFileName(index),data:new Uint8Array(await blob.arrayBuffer())});
          }finally{canvas.width=0;canvas.height=0;}
        }
        button.textContent='PNG 페이지 묶는 중…';
        download(packZip(entries),filename+'-pages.zip');return;
      }
      const origin=copy.getBoundingClientRect();
      const bounds=node=>{
        // SVG <title> and hidden nodes have a zero rect at the viewport origin;
        // they must not extend a later PDF page back to the start of the report.
        const boxes=[node,...node.querySelectorAll('*')].map(child=>child.getBoundingClientRect()).filter(box=>box.width||box.height);
        return {top:Math.min(...boxes.map(box=>box.top))-origin.top,bottom:Math.max(...boxes.map(box=>box.bottom))-origin.top};
      };
      // A long date chart may span pages: break between complete bar rows, never through a bar/date label.
      const pageCssHeight=184/277*width;
      const blocks=[...copy.querySelectorAll('.analysis-report-header,.analysis-kpis,.analysis-grid>.card,.comparison-condition-summary,.comparison-metrics,.comparison-note,.comparison-charts>.card')].flatMap(node=>{
        const box=bounds(node);
        return box.bottom-box.top>pageCssHeight&&node.querySelector('.vbars')
          ? [...node.querySelectorAll(':scope>header,.vbars>div')].map(bounds):[box];
      });
      const boundaries=[...new Set(blocks.map(block=>{
        const next=blocks.filter(other=>other.top>=block.bottom).map(other=>other.top);
        return Math.floor(block.bottom+(next.length?Math.min(...next)-block.bottom:0)/2);
      }))].filter(y=>!blocks.some(b=>b.top<y&&b.bottom>y)).sort((a,b)=>a-b);
      const reportPages=[...copy.querySelectorAll('[data-report-page]')].map(bounds);
      const canvas=await renderer.toCanvas(copy,{
        width,height,canvasWidth:width,canvasHeight:height,pixelRatio,skipAutoScale:true,
        backgroundColor:'#f5f7fb',fontEmbedCSS:'',
        style:{margin:'0',transform:'none',width:`${width}px`,height:`${height}px`,maxWidth:'none',boxSizing:'border-box'}
      });
      if(!canvas.width||!canvas.height)throw new Error('보고서 이미지를 만들지 못했습니다. 다시 시도해 주세요.');
      if(format==='png'){
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
        if(!blob)throw new Error('PNG 파일을 만들지 못했습니다.');
        download(blob,filename+'.png');
      }else{
        const pdf=new pdfLibrary.jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
        const pageWidth=pdf.internal.pageSize.getWidth(),pageHeight=pdf.internal.pageSize.getHeight();
        const margin=10,drawWidth=pageWidth-margin*2,drawHeight=pageHeight-margin*2-6;
        const scale=canvas.width/width;
        const ranges=reportPages.length?reportPages.map(p=>[Math.max(0,Math.floor(p.top*scale)-4),Math.min(canvas.height,Math.ceil(p.bottom*scale)+4)]):pageRanges(canvas.height,Math.floor(drawHeight/drawWidth*canvas.width),boundaries.map(y=>Math.round(y*scale)));
        ranges.forEach(([start,end],index)=>{
          if(index)pdf.addPage();
          const slice=document.createElement('canvas');slice.width=canvas.width;slice.height=end-start;
          slice.getContext('2d').drawImage(canvas,0,start,canvas.width,end-start,0,0,canvas.width,end-start);
          const fittedWidth=Math.min(drawWidth,drawHeight*slice.width/slice.height);
          pdf.addImage(slice.toDataURL('image/png'),'PNG',(pageWidth-fittedWidth)/2,margin,fittedWidth,slice.height/slice.width*fittedWidth,undefined,'FAST');
          pdf.setFontSize(9);pdf.setTextColor(100);pdf.text(`${index+1} / ${ranges.length}`,pageWidth-margin,pageHeight-6,{align:'right'});
          slice.width=0;slice.height=0;
        });
        download(pdf.output('blob'),filename+'.pdf');
      }
      canvas.width=0;canvas.height=0;
    }catch(error){alert(error?.message||'보고서를 저장하지 못했습니다. 다시 시도해 주세요.');}
    finally{host.remove();busy=false;button.disabled=false;button.textContent=label;}
  }
  window.JungcarReportExport={save,pageRanges,crc32,packZip,pageFileName,shouldZipPng};
})();
