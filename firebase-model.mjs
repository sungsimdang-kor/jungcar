export function canonical(value){
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
export function planSave(current,payload,expected,deleted){
  if(current && current.version===expected+1 && current.deleted===deleted && canonical(current.payload)===canonical(payload))return {alreadySaved:true,version:current.version};
  if((current?.version??0)!==expected || (current?.deleted&&!deleted)){
    throw Object.assign(new Error('다른 창에서 변경된 상담입니다. 입력 내용은 보관됩니다. 최신 기록을 확인한 뒤 수정해 주세요.'),{retryable:false});
  }
  if(deleted&&!current)throw Object.assign(new Error('삭제할 상담을 찾을 수 없습니다.'),{retryable:false});
  return {alreadySaved:false,version:expected+1};
}
