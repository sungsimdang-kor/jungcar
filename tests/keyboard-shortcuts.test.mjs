import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const start=source.indexOf('document.addEventListener("keydown", event => {');
const end=source.indexOf('\n$$("[data-tab]")',start);
assert.ok(start>=0&&end>start);
function press(overrides={},options={}){
 let handler,saves=0,prevented=0,closed=0,opened=0;
 const button={disabled:!!options.disabled,click:()=>saves++};
 const dialog={querySelector:()=>button,close:()=>closed++};
 const context={document:{addEventListener:(_,fn)=>{handler=fn;},querySelector:()=>options.noDialog?null:dialog},isTextEntryTarget:t=>!!t?.editable,loginInProgress:false,dataLoading:false,isLoggedIn:()=>true,openLeadForm:()=>opened++};
 vm.runInNewContext(source.slice(start,end),context);
 handler({code:'KeyS',key:'s',ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,isComposing:false,repeat:false,target:{},preventDefault:()=>prevented++,...overrides});
 return {saves,prevented,closed,opened};
}
test('S alone no longer saves',()=>assert.equal(press().saves,0));
test('Control+S saves once and prevents browser Save Page',()=>assert.deepEqual(press({ctrlKey:true}),{saves:1,prevented:1,closed:0,opened:0}));
test('Control+S works while typing in a field',()=>assert.equal(press({ctrlKey:true,target:{editable:true}}).saves,1));
test('disabled save prevents duplicate submission',()=>assert.deepEqual(press({ctrlKey:true},{disabled:true}),{saves:0,prevented:1,closed:0,opened:0}));
test('holding Control+S does not repeat or open browser Save Page',()=>assert.deepEqual(press({ctrlKey:true,repeat:true}),{saves:0,prevented:1,closed:0,opened:0}));
test('Control+S does not save during IME composition',()=>assert.equal(press({ctrlKey:true,isComposing:true}).saves,0));
test('outside the form browser shortcut is untouched',()=>assert.deepEqual(press({ctrlKey:true},{noDialog:true}),{saves:0,prevented:0,closed:0,opened:0}));
test('other modifier combinations do not save',()=>{for(const extra of [{metaKey:true},{altKey:true},{shiftKey:true}])assert.equal(press({ctrlKey:true,...extra}).saves,0);});
test('Escape still closes the form',()=>assert.equal(press({key:'Escape',code:'Escape'}).closed,1));
test('N still opens a new consultation',()=>assert.equal(press({key:'n',code:'KeyN'},{noDialog:true}).opened,1));
