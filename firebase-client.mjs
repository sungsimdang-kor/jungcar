import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import {getFirestore, collection, doc, getDocFromServer, onSnapshot, runTransaction, serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import {canonical, planSave} from './firebase-model.mjs';

export function connect(config, handlers) {
  const app=initializeApp(config), auth=getAuth(app), db=getFirestore(app);
  let unsubscribe=null, rows=[], initialized=false, serverConfirmed=false, writes=0, lastConfirmed=0;
  const unconfirmed=new Set();
  let readyResolve, readyReject;
  let ready=Promise.resolve([]);
  const state=(status,message='')=>handlers.status({status,message,at:lastConfirmed});
  const showState=()=>state(!auth.currentUser?'login':!navigator.onLine?'offline':writes?'saving':unconfirmed.size?'pending':serverConfirmed?'connected':'connecting');
  function stop(){unsubscribe?.();unsubscribe=null;initialized=false;serverConfirmed=false;rows=[];}
  function watch(){
    stop(); ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
    // A single listener is shared by the whole page; no repeated full-list polling.
    unsubscribe=onSnapshot(collection(db,'consultations'),{includeMetadataChanges:true},snapshot=>{
      serverConfirmed=!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites;
      if(serverConfirmed){
        lastConfirmed=Date.now();
        rows=snapshot.docs.filter(d=>!d.data().deleted).map(d=>({...d.data().payload,id:d.id,_version:d.data().version}));
        initialized=true;readyResolve(rows);handlers.rows(rows);
      }
      showState();
    },error=>{serverConfirmed=false;readyReject(error);state('error','Firebase 접근 권한 또는 연결을 확인하세요.');handlers.error(error);});
    ready.catch(()=>{});showState();return timed(ready);
  }
  const authReady=new Promise(resolve=>{
    let first=true;
    onAuthStateChanged(auth,user=>{
      if(!user){stop();handlers.signedOut();showState();}
      if(first){first=false;resolve(user);}
    });
  });
  async function timed(promise){
    let timer;
    try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('서버 저장 확인이 지연되고 있습니다. 입력 내용은 보관되며 재시도합니다.')),15000);})]);}
    finally{clearTimeout(timer);}
  }
  async function mutate(row,deleted=false){
    await authReady;
    if(!auth.currentUser) throw Object.assign(new Error('다시 로그인해 주세요.'),{retryable:false});
    const id=String(row.id), expected=row._version??0;
    const payload=JSON.parse(JSON.stringify(row));delete payload._version;
    if(!/^[A-Za-z0-9_-]{1,180}$/.test(id)) throw new Error('상담 저장번호를 확인하세요.');
    const uid=auth.currentUser.uid, ref=doc(db,'consultations',id);
    writes++;showState();
    try{
      const work=runTransaction(db,async tx=>{
        const snap=await tx.get(ref), current=snap.exists()?snap.data():null;
        const decision=planSave(current,payload,expected,deleted);
        if(decision.alreadySaved) return decision.version;
        const next={payload,version:decision.version,deleted,updatedAt:serverTimestamp(),updatedBy:uid};
        const history=doc(db,'consultations',id,'history',String(decision.version));
        tx.set(ref,next);
        tx.set(history,{before:current?.payload??null,after:payload,version:decision.version,deleted,at:serverTimestamp(),actor:uid});
        return decision.version;
      });
      // Keep the operation alive after a UI timeout. A retry with the same id/version is idempotent.
      work.catch(()=>{});
      const version=await timed(work);row._version=version;lastConfirmed=Date.now();unconfirmed.delete(id);
      return {ok:true,siteId:id,saved:[{siteId:id,version}]};
    }catch(error){
      unconfirmed.add(id);
      if(['permission-denied','unauthenticated','invalid-argument'].includes(error.code)) error.retryable=false;
      throw error;
    }finally{writes--;showState();}
  }
  const online=()=>{serverConfirmed=false;showState();};
  window.addEventListener('offline',online);window.addEventListener('online',online);
  // Lightweight server confirmation, not a full customer query.
  setInterval(async()=>{
    if(!auth.currentUser||document.hidden||!navigator.onLine)return;
    try{await timed(getDocFromServer(doc(db,'system','migration')));lastConfirmed=Date.now();showState();}
    catch{serverConfirmed=false;showState();}
  },60000);
  return {
    async restore(){const user=await authReady;if(!user)return false;await watch();return true;},
    async login(password){await authReady;await signInWithEmailAndPassword(auth,'admin@jungcar.invalid',password);await watch();return {ok:true,sessionToken:'firebase-auth'};},
    async logout(){stop();await signOut(auth);},
    async list(){if(!unsubscribe)await watch();return initialized?rows:timed(ready);},
    save:row=>mutate(row), remove:row=>mutate(row,true),
    export:()=>({exportedAt:new Date().toISOString(),source:'firebase',rows}),
    canonical
  };
}
