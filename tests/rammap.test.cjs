const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createRammap,launchScript}=require('../desktop/rammap.cjs');
function fixture(overrides={}){
  let calls=0,time=100000;
  const manager=createRammap({file:"C:\\Users\\O'Brien\\RAMMap64.exe",validate:async()=>{},run:async()=>{calls++;},free:()=>1234,now:()=>time,...overrides});
  return {manager,get calls(){return calls;},advance:()=>{time+=60001;}};
}
test('RAMMap requires explicit confirmation and blocks overlapping runs',async()=>{
  let release;const f=fixture({run:()=>new Promise(r=>{release=r;})});
  await assert.rejects(f.manager.trim(false),/RAMMAP_CONFIRM_REQUIRED/);
  const pending=f.manager.trim(true);await new Promise(setImmediate);
  assert.equal(f.manager.busy,true);await assert.rejects(f.manager.trim(true),/BUSY/);
  release();await pending;assert.equal(f.manager.busy,false);
});
test('RAMMap verification failure never launches the tool',async()=>{
  const f=fixture({validate:async()=>{throw Error('RAMMAP_UNTRUSTED');}});
  await assert.rejects(f.manager.trim(true),/RAMMAP_UNTRUSTED/);assert.equal(f.calls,0);assert.equal(f.manager.busy,false);
});
test('RAMMap reports observations and enforces a minute between attempts',async()=>{
  const f=fixture();const result=await f.manager.trim(true);
  assert.equal(result.scope,'all-working-sets');assert.equal(result.status,'command-completed');
  assert.equal(result.availableAfter,1234);
  await assert.rejects(f.manager.trim(true),/MEMORY_COOLDOWN/);
  f.advance();await f.manager.trim(true);assert.equal(f.calls,2);
});
test('RAMMap distinguishes cancelled elevation from failure and never reports success',async()=>{
  for(const [code,message] of [[1223,'RAMMAP_CANCELLED'],[10,'RAMMAP_UNTRUSTED'],[11,'RAMMAP_FAILED']]){
    const f=fixture({run:async()=>{throw Object.assign(Error('exit'),{code});}});
    await assert.rejects(f.manager.trim(true),new RegExp(message));assert.equal(f.manager.busy,false);
  }
});
test('uncertain completion blocks another attempt even after cooldown',async()=>{
  const f=fixture({run:async()=>{throw Object.assign(Error('timeout'),{killed:true});}});
  await assert.rejects(f.manager.trim(true),/RAMMAP_TIMEOUT/);f.advance();
  await assert.rejects(f.manager.trim(true),/RAMMAP_TIMEOUT/);
});
test('RAMMap rejects modified files before any signature command or launch',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'kanis-rammap-test-')),file=path.join(dir,'RAMMap64.exe');
  try{
    await fs.writeFile(file,'untrusted fixture');let called=false;
    const manager=createRammap({file,run:async()=>{called=true;}});
    assert.deepEqual(await manager.status(),{installed:false,error:'RAMMAP_UNTRUSTED'});
    await assert.rejects(manager.trim(true),/RAMMAP_UNTRUSTED/);assert.equal(called,false);
  }finally{await fs.unlink(file);await fs.rmdir(dir);}
});
test('elevation targets the verified Microsoft binary with the one intended operation',()=>{
  const script=launchScript("C:\\O'Brien\\RAMMap64.exe");
  assert.match(script,/'C:\\O''Brien\\RAMMap64.exe'/);
  assert.match(script,/-ArgumentList '-Ew' -Verb RunAs/);
  assert.match(script,/Get-AuthenticodeSignature/);assert.match(script,/Get-FileHash/);
  assert.doesNotMatch(script,/ExecutionPolicy|accepteula|memory-helper|-Es'|-Et'/i);
});
