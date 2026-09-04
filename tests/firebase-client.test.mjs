import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {canonical,planSave} from '../firebase-model.mjs';
const source=fs.readFileSync(new URL('../firebase-client.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export function connect','function connect');
function harness(){
 const states=[],received=[],events={},stored=new Map(),auth={currentUser:{uid:'staff-test'}},logins=[];
 let listener,resolveTransaction,waitWrite=false;
 const snapshot=(cache=false,pending=false)=>({metadata:{fromCache:cache,hasPendingWrites:pending},docs:[...stored].filter(([id])=>!id.includes('/')).map(([id,value])=>({id,data:()=>value}))});
 const context={console,Date,Promise,JSON,Error,Map,canonical,planSave,navigator:{onLine:true},setTimeout,clearTimeout,setInterval:()=>0,
  window:{addEventListener:(name,fn)=>{events[name]=fn;}},initializeApp:()=>({}),getAuth:()=>auth,getFirestore:()=>({}),collection:()=>({}),
  doc:(_, ...parts)=>parts[0]==='consultations'?parts.slice(1).join('/'):parts.join('/'),serverTimestamp:()=>123,
  onAuthStateChanged:(_,cb)=>queueMicrotask(()=>cb(auth.currentUser)),signOut:async()=>{auth.currentUser=null;},signInWithEmailAndPassword:async(_,email,password)=>{logins.push({email,password});},
  getDocFromServer:async()=>({}),onSnapshot:(_,options,cb)=>{listener=cb;queueMicrotask(()=>cb(snapshot()));return()=>{listener=null;};},
  runTransaction:async(_,fn)=>{if(waitWrite)await new Promise(r=>{resolveTransaction=r;});return fn({get:async ref=>({exists:()=>stored.has(ref),data:()=>stored.get(ref)}),set:(ref,value)=>stored.set(ref,value)});}
 };
 vm.runInNewContext(source+'\nthis.connect=connect;',context);
 const api=context.connect({}, {status:s=>states.push(s.status),rows:r=>received.push(r),error:()=>{},signedOut:()=>{}});
 return {api,states,received,events,stored,context,logins,emit:(cache,pending)=>listener(snapshot(cache,pending)),block:()=>{waitWrite=true;},release:()=>resolveTransaction()};
}
test('password-only login maps to the fixed admin identity',async()=>{
 const h=harness();await h.api.login('test-only-password');
 assert.equal(h.logins[0].email,'admin@jungcar.invalid');assert.equal(h.logins[0].password,'test-only-password');
});
test('realtime data comes only from server-confirmed snapshot',async()=>{
 const h=harness();await h.api.restore();const initial=h.received.length;
 h.stored.set('one',{payload:{id:'one'},version:1,deleted:false});h.emit(true,false);
 assert.equal(h.received.length,initial);assert.equal(h.states.at(-1),'connecting');
 h.emit(false,true);assert.equal(h.received.length,initial);
 h.emit(false,false);assert.equal(h.received.at(-1)[0].id,'one');assert.equal(h.states.at(-1),'connected');
});
test('offline immediately changes banner',async()=>{const h=harness();await h.api.restore();h.context.navigator.onLine=false;h.events.offline();assert.equal(h.states.at(-1),'offline');});
test('saving stays pending until server transaction resolves',async()=>{
 const h=harness();await h.api.restore();h.block();let done=false;const row={id:'new'};
 const pending=h.api.save(row).then(()=>{done=true;});await new Promise(r=>setTimeout(r,0));
 assert.equal(done,false);assert.equal(h.states.at(-1),'saving');h.release();await pending;assert.equal(row._version,1);
});
test('retry creates one record and one history entry',async()=>{
 const h=harness();await h.api.restore();await h.api.save({id:'same'});await h.api.save({id:'same'});
 assert.equal(h.stored.size,2);assert.equal(h.stored.get('same').version,1);
});
test('deletion remains stored as tombstone and is removed from visible rows',async()=>{
 const h=harness();await h.api.restore();const r={id:'one'};await h.api.save(r);await h.api.remove(r);h.emit(false,false);
 assert.equal(h.stored.get('one').deleted,true);assert.equal(h.received.at(-1).length,0);
});
