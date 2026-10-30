const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createRammapTask}=require('../desktop/rammap-task.cjs');
const {createRammap}=require('../desktop/rammap.cjs');
const {createAutoMemory}=require('../desktop/memory-auto.cjs');
const decode=args=>Buffer.from(args.at(-1),'base64').toString('utf16le');
test('prepared task skips administrator setup; query cannot run the task',async()=>{
  let calls=0;const task=createRammapTask({sourceFile:'C:\\source.exe',run:async(_,args)=>{calls++;assert.doesNotMatch(decode(args),/\$task\.Run\(/);return {stdout:'{"ready":true}'};}});
  await task.prepare();assert.equal(calls,1);assert.equal(task.ready,true);
});
test('setup cancellation remains unavailable and does not activate execution',async()=>{
  let calls=0;
  const task=createRammapTask({sourceFile:'C:\\source.exe',run:async()=>{calls++;if(calls===1)throw Error('missing');if(calls===2)return {stdout:'S-1-5-21-1-2-3-1001'};throw Object.assign(Error('cancel'),{code:1223});}});
  await assert.rejects(task.prepare(),/RAMMAP_CANCELLED/);assert.equal(task.ready,false);
});
test('setup exit success still requires a fresh verification',async()=>{
  let calls=0;
  const task=createRammapTask({sourceFile:'C:\\source.exe',run:async()=>{calls++;if(calls===1||calls===4)throw Error('not installed');if(calls===2)return {stdout:'S-1-5-21-1-2-3-1001'};return {stdout:''};}});
  await assert.rejects(task.prepare(),/RAMMAP_SETUP_FAILED/);assert.equal(task.ready,false);assert.equal(calls,4);
});
test('disabled or changed settings after task inspection prevent dispatch',async()=>{
  let calls=0;
  const task=createRammapTask({sourceFile:'C:\\source.exe',run:async()=>{calls++;return {stdout:'{"ready":true}'};}});
  assert.deepEqual(await task.run(()=>false),{cancelled:true});assert.equal(calls,1);
});
test('scheduled dispatch rejects failed completion and clears readiness',async()=>{
  let calls=0;
  const task=createRammapTask({sourceFile:'C:\\source.exe',run:async(_,args)=>{calls++;if(calls===1)return {stdout:'{"ready":true}'};assert.match(decode(args),/\$task\.Run\(\$null\)/);return {stdout:'{"completed":false}'};}});
  await assert.rejects(task.run(()=>true),/RAMMAP_TASK_FAILED/);assert.equal(task.ready,false);
});
test('manual and automatic RAMMap operations share the same busy guard and cooldown',async()=>{
  let done,time=100000;
  const manager=createRammap({file:'unused',validate:async()=>{},run:async()=>{},now:()=>time,automatic:{run:async allowed=>{assert.equal(allowed(),true);return new Promise(r=>{done=r;});}}});
  const automatic=manager.autoTrim(()=>true);await new Promise(setImmediate);
  await assert.rejects(manager.trim(true),/BUSY/);done({completed:true});
  const result=await automatic;assert.equal(result.scope,'all-working-sets');assert.equal(result.completed,true);
  await assert.rejects(manager.trim(true),/MEMORY_COOLDOWN/);
  time+=60001;await manager.trim(true);
});
test('scheduler records whole-device completion without invented process counts',async()=>{
  let time=100000,saved;
  const scheduler=createAutoMemory({now:()=>time,control:{autoTrim:async()=>({scope:'all-working-sets',completed:true,rows:[],availableBefore:100,availableAfter:120})},getSettings:()=>({autoMemory:true,autoMemoryThreshold:85}),readMemory:()=>({total:100,used:85}),canRun:()=>true,save:async s=>{saved=structuredClone(s);}});
  await scheduler.tick();assert.equal(saved,undefined);time+=60000;await scheduler.tick();
  assert.equal(saved.lastResult.outcome,'completed');assert.equal(saved.lastResult.scope,'all-working-sets');assert.equal(saved.lastResult.trimmed,0);
});
