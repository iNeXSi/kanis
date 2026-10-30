const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createAutoMemory,COOLDOWN,INTERVAL}=require('../desktop/memory-auto.cjs');
const {createMemoryControl}=require('../desktop/memory.cjs');
const {normalizeSettings}=require('../desktop/preferences.cjs');
function fixture(options={}){
  let time=1_000_000,usage=90,calls=0,blocked=false,saved;
  const prefs={autoMemory:true,autoMemoryThreshold:85};
  const control={busy:false,autoTrim:async allowed=>{assert.ok(allowed());calls++;return {rows:[{status:'trimmed'},{status:'skipped'}],availableBefore:10,availableAfter:12};}};
  const manager=createAutoMemory({control,getSettings:()=>prefs,readMemory:()=>({total:100,used:usage}),canRun:()=>!blocked,save:async state=>{saved=structuredClone(state);},now:()=>time,...options});
  return {manager,prefs,control,get calls(){return calls;},get saved(){return saved;},advance:(ms=INTERVAL)=>{time+=ms;},usage:value=>{usage=value;},block:value=>{blocked=value;}};
}
test('automatic preferences default off and accept only valid percentages and booleans',()=>{
  assert.equal(normalizeSettings().autoMemory,false);
  for(const invalid of [0,59,96,'85',NaN,70.5])assert.equal(normalizeSettings({autoMemoryThreshold:invalid}).autoMemoryThreshold,85);
  assert.equal(normalizeSettings({autoMemory:'true'}).autoMemory,false);
  assert.equal(normalizeSettings({autoMemory:true,autoMemoryThreshold:82}).autoMemoryThreshold,82);
});
test('automatic trim requires consecutive high readings and respects persistent cooldown',async()=>{
  const f=fixture();await f.manager.tick();await f.manager.tick();assert.equal(f.calls,0);
  f.advance();await f.manager.tick();assert.equal(f.calls,1);assert.equal(f.saved.lastResult.trimmed,1);assert.equal(f.saved.lastResult.skipped,1);
  f.advance();await f.manager.tick();assert.equal(f.calls,1);
  f.advance(COOLDOWN);await f.manager.tick();assert.equal(f.calls,2);
  const restarted=fixture({initial:f.saved});await restarted.manager.tick();restarted.advance();await restarted.manager.tick();assert.equal(restarted.calls,0);
});
test('low, invalid, busy and disabled readings reset the sustained-high requirement',async()=>{
  const f=fixture();
  await f.manager.tick();f.advance();f.usage(84);await f.manager.tick();f.advance();f.usage(90);await f.manager.tick();assert.equal(f.calls,0);
  f.advance();f.block(true);await f.manager.tick();f.block(false);f.advance();await f.manager.tick();assert.equal(f.calls,0);
  f.advance();f.prefs.autoMemory=false;await f.manager.tick();assert.equal(f.manager.status().phase,'off');
  f.prefs.autoMemory=true;f.advance();f.usage(NaN);await f.manager.tick();assert.equal(f.calls,0);
});
test('failure to persist cooldown prevents execution',async()=>{
  const f=fixture({save:async()=>{throw Error('DISK_FULL');}});
  await f.manager.tick();f.advance();await f.manager.tick();
  assert.equal(f.calls,0);assert.equal(f.manager.status().lastResult.outcome,'failed');
});
test('turning off or changing threshold while reserving an attempt prevents trim',async()=>{
  for(const patch of [{autoMemory:false},{autoMemoryThreshold:95}]){
    let release;const f=fixture({save:()=>new Promise(resolve=>{release=resolve;})});
    await f.manager.tick();f.advance();const pending=f.manager.tick();
    Object.assign(f.prefs,patch);f.manager.cancel();release();
    // The cancelled result is saved in a second, independently awaited write.
    await new Promise(r=>setImmediate(r));release();await pending;assert.equal(f.calls,0);
  }
});
test('cancellation aborts an in-flight helper and records a cancelled result',async()=>{
  const f=fixture();let signal;
  f.control.autoTrim=(_,s)=>new Promise((resolve,reject)=>{signal=s;s.addEventListener('abort',()=>reject(Error('ABORTED')),{once:true});});
  await f.manager.tick();f.advance();const pending=f.manager.tick();await new Promise(r=>setImmediate(r));
  assert.equal(f.manager.status().running,true);f.prefs.autoMemory=false;f.manager.cancel();await pending;
  assert.equal(signal.aborted,true);assert.equal(f.manager.status().lastResult.outcome,'cancelled');
});
test('automatic selection is bounded, omits visible/unknown processes, and preserves manual IDs',async()=>{
  const candidates=Array.from({length:15},(_,i)=>({pid:i+1,created:String(i+100),name:'fixture.exe',before:(i+1)*1024**2,hasVisibleWindow:i===0?null:i===1?true:false}));
  let selected,mode;
  const control=createMemoryControl({run:async(m,rows)=>{if(m==='list')return candidates;mode=m;selected=rows;return rows.map(r=>({...r,status:'trimmed'}));}});
  const manual=await control.list();
  const result=await control.autoTrim(()=>true);
  assert.equal(mode,'trim-background');assert.equal(selected.length,10);assert.equal(selected[0].pid,15);assert.ok(selected.every(r=>r.pid>2));assert.equal(result.rows.length,10);
  await assert.rejects(control.trim([manual.processes[0].id]),/MEMORY_COOLDOWN/);
});
test('disabling during background enumeration prevents any trim command',async()=>{
  let allowed=true,release,calls=0;
  const control=createMemoryControl({run:async mode=>{calls++;assert.equal(mode,'list');return new Promise(resolve=>{release=resolve;});}});
  const pending=control.autoTrim(()=>allowed);allowed=false;release([{pid:1,created:'1',before:1e8,hasVisibleWindow:false}]);
  assert.equal((await pending).cancelled,true);assert.equal(calls,1);assert.equal(control.busy,false);
});
test('helper availability failure is exposed and the activation probe cannot trim',async()=>{
  let denied=true;
  const control=createMemoryControl({run:async mode=>{assert.equal(mode,'list');if(denied)throw Error('MEMORY_HELPER_UNAVAILABLE');return [];}});
  await assert.rejects(control.checkAvailable(),/MEMORY_HELPER_UNAVAILABLE/);
  assert.equal(control.unavailable,true);assert.equal(control.busy,false);
  denied=false;await control.checkAvailable();assert.equal(control.unavailable,false);
});
