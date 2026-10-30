const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createMemoryMonitor}=require('../desktop/memory-monitor.cjs');
test('automatic monitoring recovers after a transient task-discovery failure without provisioning',async()=>{
 let inspections=0,ticks=0;const task={ready:false,async inspect(){this.ready=++inspections===2;}};
 const tick=createMemoryMonitor({getSettings:()=>({autoMemory:true}),task,controller:{async tick(){if(task.ready)ticks++;}}});
 await tick();assert.equal(ticks,0);await tick();assert.equal(ticks,1);await tick();assert.equal(inspections,2);assert.equal(ticks,2);
});
test('disabled monitoring never inspects or runs a task',async()=>{
 const tick=createMemoryMonitor({getSettings:()=>({autoMemory:false}),task:{inspect(){assert.fail();}},controller:{tick(){assert.fail();}}});await tick();
});
test('disabling during discovery prevents execution and overlapping polls are ignored',async()=>{
 let resolve,enabled=true,calls=0;
 const tick=createMemoryMonitor({getSettings:()=>({autoMemory:enabled}),task:{ready:false,inspect(){calls++;return new Promise(r=>{resolve=r;});}},controller:{tick(){assert.fail();}}});
 const first=tick();await tick();assert.equal(calls,1);enabled=false;resolve();await first;
});
