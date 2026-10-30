const INTERVAL=60000,COOLDOWN=10*60000;
function percent(memory){
  if(!memory||!Number.isFinite(memory.total)||memory.total<=0||!Number.isFinite(memory.used)||memory.used<0||memory.used>memory.total)return null;
  return memory.used/memory.total*100;
}
function createAutoMemory({control,getSettings,readMemory,canRun,save,initial={},now=Date.now}){
  let state={lastAttempt:Number.isFinite(initial?.lastAttempt)&&initial.lastAttempt>0?Math.min(initial.lastAttempt,now()):0,lastResult:initial?.lastResult&&typeof initial.lastResult==='object'?initial.lastResult:null};
  let high=0,lastSample=null,running=false,abort=null;
  function cancel(){high=0;lastSample=null;abort?.abort();}
  function status(){
    const prefs=getSettings(),nextEligibleAt=state.lastAttempt?state.lastAttempt+COOLDOWN:0;
    return {...state,running,nextEligibleAt,phase:!prefs.autoMemory?'off':running?'running':nextEligibleAt>now()?'cooldown':high>0?'confirming':'watching'};
  }
  async function tick(){
    if(running)return;
    const prefs=getSettings(),threshold=prefs.autoMemoryThreshold;
    if(!prefs.autoMemory){high=0;return;}
    if(lastSample!==null&&now()-lastSample<INTERVAL)return;
    lastSample=now();
    const usage=percent(readMemory());
    if(usage===null||usage<threshold||!canRun()||control.busy){high=0;return;}
    high=Math.min(2,high+1);
    if(high<2||(state.lastAttempt&&now()-state.lastAttempt<COOLDOWN))return;
    running=true;abort=new AbortController();
    const signal=abort.signal;
    const allowed=()=>{const current=getSettings();const currentUsage=percent(readMemory());return !signal.aborted&&current.autoMemory&&current.autoMemoryThreshold===threshold&&canRun()&&currentUsage!==null&&currentUsage>=threshold;};
    try {
      // Reserve the cooldown on disk before touching another process.
      state={lastAttempt:now(),lastResult:{outcome:'interrupted',at:now(),threshold,usage}};
      await save(state);
      if(!allowed()){state.lastResult={...state.lastResult,outcome:'cancelled'};await save(state);return;}
      const result=await control.autoTrim(allowed,signal);
      state.lastResult={at:now(),threshold,usage,scope:result.scope,outcome:result.cancelled?'cancelled':result.completed||result.rows.length?'completed':'no-targets',trimmed:result.rows.filter(r=>r.status==='trimmed').length,skipped:result.rows.filter(r=>r.status!=='trimmed').length,availableBefore:result.availableBefore,availableAfter:result.availableAfter};
      await save(state);
    }catch{
      state.lastResult={at:now(),threshold,usage,outcome:signal.aborted?'cancelled':'failed'};
      try{await save(state);}catch{/* A failed journal never permits an unrecorded automatic attempt. */}
    }finally{running=false;abort=null;high=0;}
  }
  return {tick,cancel,status};
}
module.exports={createAutoMemory,percent,INTERVAL,COOLDOWN};
