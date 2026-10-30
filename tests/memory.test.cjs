const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createMemoryControl}=require('../desktop/memory.cjs');
const {normalizeSettings}=require('../desktop/preferences.cjs');
const rows=[{pid:123,created:'134000000000000000',name:'example.exe',before:1024**3}];
test('unknown window visibility is never treated as a background process',async()=>{
  const control=createMemoryControl({run:async()=>[...rows,{...rows[0],pid:124,hasVisibleWindow:false},{...rows[0],pid:125,hasVisibleWindow:true}]});
  const {processes}=await control.list();
  assert.deepEqual(processes.map(p=>p.hasVisibleWindow),[null,false,true]);
});
test('memory settings migrate and reject unsupported polling intervals',()=>{
  assert.equal(normalizeSettings().memoryRefreshSeconds,15);
  assert.equal(normalizeSettings({memoryRefreshSeconds:0}).memoryRefreshSeconds,15);
  assert.equal(normalizeSettings({memoryRefreshSeconds:60}).memoryRefreshSeconds,60);
});
test('trim accepts only fresh issued selections and binds PID to creation time',async()=>{
  let time=1,calls=0;
  const control=createMemoryControl({now:()=>time,free:()=>100,run:async(mode,targets)=>{
    if(mode==='list')return rows;
    calls++;assert.deepEqual(targets,[{pid:123,created:rows[0].created}]);
    return [{...rows[0],status:'trimmed',after:2048}];
  }});
  await assert.rejects(control.trim(['123']),/INVALID_SELECTION/);
  const first=await control.list(),id=first.processes[0].id;
  await assert.rejects(control.trim([id,id]),/INVALID_SELECTION/);
  time=120002;await assert.rejects(control.trim([id]),/MEMORY_EXPIRED/);
  const fresh=await control.list(),result=await control.trim([fresh.processes[0].id]);
  assert.equal(result.rows[0].after,2048);assert.equal(calls,1);
  await assert.rejects(control.trim([fresh.processes[0].id]),/INVALID_SELECTION/);
  const next=await control.list();await assert.rejects(control.trim([next.processes[0].id]),/MEMORY_COOLDOWN/);
  time+=60000;await control.trim([next.processes[0].id]);assert.equal(calls,2);
});
test('failed helper releases busy state and does not report fabricated savings',async()=>{
  const control=createMemoryControl({run:async mode=>{if(mode==='list')return rows;throw Error('HELPER_FAILED');}});
  const list=await control.list();await assert.rejects(control.trim([list.processes[0].id]),/HELPER_FAILED/);
  assert.equal(control.busy,false);assert.equal((await control.list()).processes.length,1);
});
test('process identity mismatch and missing measurements are reported as skipped or unavailable',async()=>{
  const control=createMemoryControl({run:async mode=>mode==='list'?rows:[{...rows[0],created:'999',status:'trimmed',after:0}]});
  const list=await control.list(),result=await control.trim([list.processes[0].id]);
  assert.deepEqual(result.rows,[{pid:123,status:'skipped',before:null,after:null}]);
});
test('concurrent list and trim cannot mutate selection while the helper is busy',async()=>{
  let release;
  const control=createMemoryControl({run:()=>new Promise(resolve=>{release=resolve;})});
  const work=control.list();await assert.rejects(control.list(),/BUSY/);await assert.rejects(control.trim([]),/BUSY/);
  release(rows);await work;assert.equal(control.busy,false);
});
