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
  window.JungcarReportExport={save,pageRanges};
})();
