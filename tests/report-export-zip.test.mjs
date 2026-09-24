import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../report-export.js',import.meta.url),'utf8');
const context={window:{},Blob};vm.runInNewContext(source,context);
const report=context.window.JungcarReportExport;
const bytes=text=>new TextEncoder().encode(text);
test('CRC32 matches the published ZIP checksum test vector',()=>{
  assert.equal(report.crc32(bytes('123456789')),0xcbf43926);assert.equal(report.crc32(new Uint8Array()),0);
});
test('ZIP store headers, CRC, sizes, central directory and entry bytes are valid',async()=>{
  const entries=[{name:'page-001.png',data:bytes('first PNG bytes')},{name:'page-002.png',data:new Uint8Array([0,137,80,78,71,255])}];
  const blob=report.packZip(entries),data=new Uint8Array(await blob.arrayBuffer()),view=new DataView(data.buffer),decode=(start,length)=>new TextDecoder().decode(data.slice(start,start+length));
  assert.equal(blob.type,'application/zip');
  let offset=0;const localOffsets=[];
  for(const entry of entries){
    localOffsets.push(offset);assert.equal(view.getUint32(offset,true),0x04034b50);assert.equal(view.getUint16(offset+4,true),20);assert.equal(view.getUint16(offset+6,true),0x0800);assert.equal(view.getUint16(offset+8,true),0);
    assert.equal(view.getUint32(offset+14,true),report.crc32(entry.data));assert.equal(view.getUint32(offset+18,true),entry.data.length);assert.equal(view.getUint32(offset+22,true),entry.data.length);
    const nameLength=view.getUint16(offset+26,true);assert.equal(decode(offset+30,nameLength),entry.name);assert.equal(view.getUint16(offset+28,true),0);
    assert.deepEqual(data.slice(offset+30+nameLength,offset+30+nameLength+entry.data.length),entry.data);offset+=30+nameLength+entry.data.length;
  }
  const directoryOffset=offset;
  for(const [index,entry] of entries.entries()){
    assert.equal(view.getUint32(offset,true),0x02014b50);assert.equal(view.getUint16(offset+8,true),0x0800);assert.equal(view.getUint16(offset+10,true),0);
    assert.equal(view.getUint32(offset+16,true),report.crc32(entry.data));assert.equal(view.getUint32(offset+20,true),entry.data.length);assert.equal(view.getUint32(offset+42,true),localOffsets[index]);
    const nameLength=view.getUint16(offset+28,true);assert.equal(decode(offset+46,nameLength),entry.name);offset+=46+nameLength;
  }
  const directorySize=offset-directoryOffset;assert.equal(view.getUint32(offset,true),0x06054b50);assert.equal(view.getUint16(offset+8,true),2);assert.equal(view.getUint16(offset+10,true),2);
  assert.equal(view.getUint32(offset+12,true),directorySize);assert.equal(view.getUint32(offset+16,true),directoryOffset);assert.equal(data.length,offset+22);
});
test('ZIP filenames are flat, ASCII, bounded and unique',()=>{
  assert.equal(report.pageFileName(0),'page-001.png');assert.equal(report.pageFileName(999),'page-1000.png');
  for(const index of [-1,1.5,65535])assert.throws(()=>report.pageFileName(index));
  for(const name of ['../page.png','/page.png','한글.png','a'.repeat(100)+'.png'])assert.throws(()=>report.packZip([{name,data:bytes('x')}]));
  assert.throws(()=>report.packZip([{name:'page-001.png',data:bytes('a')},{name:'page-001.png',data:bytes('b')}]));
  assert.throws(()=>report.packZip([{name:'page-001.png',data:new Uint16Array([1])}]));
});
test('only long explicit PNG reports switch to ZIP at less than 1.5x resolution',()=>{
  assert.equal(report.shouldZipPng(1420,4000,4),false);
  assert.equal(report.shouldZipPng(1420,9000,9),true); // 24 MP limit
  assert.equal(report.shouldZipPng(800,11000,11),true); // 16,000 px side limit
  assert.equal(report.shouldZipPng(1420,25000,0),false);assert.equal(report.shouldZipPng(1420,25000,25,'pdf'),false);
  assert.equal(report.shouldZipPng(0,25000,25),false);
});
function mockExport(failBlob=false){
  const downloads=[],canvases=[],alerts=[],renders=[];let hostRemoved=0;
  const pages=Array.from({length:3},()=>({getBoundingClientRect:()=>({width:1420,height:820}),scrollWidth:1420,scrollHeight:820,classList:{contains:()=>true}}));
  const copy={removeAttribute(){},querySelectorAll:selector=>selector==='[data-report-page]'?pages:[],classList:{add(){}},getBoundingClientRect:()=>({width:1420,height:18000}),scrollWidth:1420,scrollHeight:18000};
  const renderer={async toCanvas(node,options){renders.push({node,options});const canvas={width:options.width*options.pixelRatio,height:options.height*options.pixelRatio,toBlob(callback){callback(failBlob?null:new Blob([bytes('mock PNG')],{type:'image/png'}));}};canvases.push(canvas);return canvas;}};
  const document={fonts:{ready:Promise.resolve()},body:{appendChild(){}},createElement(tag){return tag==='a'?{click(){downloads.push({name:this.download,blob:blobs.get(this.href)});},remove(){}}:{setAttribute(){},appendChild(){},remove(){hostRemoved++;}};}};
  const blobs=new Map();let nextUrl=0;
  const ctx={window:{htmlToImage:renderer},document,Blob,URL:{createObjectURL(blob){const url='blob:'+nextUrl++;blobs.set(url,blob);return url;},revokeObjectURL(){}},requestAnimationFrame(callback){callback();},setTimeout(){return 0;},clearTimeout(){},alert(message){alerts.push(message);}};
  vm.runInNewContext(source,ctx);const button={textContent:'PNG 저장',disabled:false};
  return {save:()=>ctx.window.JungcarReportExport.save({report:{cloneNode:()=>copy},button,format:'png',filename:'jungcar-day-report'}),downloads,canvases,alerts,renders,button,removed:()=>hostRemoved};
}
test('long-report PNG export renders separate 2x pages and downloads one ZIP',async()=>{
  const mock=mockExport();await mock.save();
  assert.equal(mock.renders.length,3);assert.ok(mock.renders.every(r=>r.options.pixelRatio===2));assert.equal(mock.downloads.length,1);assert.equal(mock.downloads[0].name,'jungcar-day-report-pages.zip');assert.equal(mock.downloads[0].blob.type,'application/zip');
  assert.ok(mock.canvases.every(canvas=>canvas.width===0&&canvas.height===0));assert.equal(mock.removed(),1);assert.equal(mock.button.disabled,false);assert.equal(mock.button.textContent,'PNG 저장');assert.equal(mock.alerts.length,0);
});
test('PNG page failure downloads nothing, releases canvas and restores button/host',async()=>{
  const mock=mockExport(true);await mock.save();
  assert.equal(mock.downloads.length,0);assert.equal(mock.alerts.length,1);assert.equal(mock.canvases[0].width,0);assert.equal(mock.removed(),1);assert.equal(mock.button.disabled,false);assert.equal(mock.button.textContent,'PNG 저장');
  await mock.save();assert.equal(mock.alerts.length,2); // busy flag must not remain stuck after failure.
});
