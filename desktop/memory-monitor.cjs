// Retry read-only task discovery after transient login/service failures.
function createMemoryMonitor({getSettings,task,controller,stopping=()=>false}){
  let pending=false;
  return async function tick(){
    if(pending||stopping()||!getSettings().autoMemory)return;
    pending=true;
    try{
      if(!task.ready)await task.inspect();
      if(!stopping()&&getSettings().autoMemory)await controller.tick();
    }finally{pending=false;}
  };
}
module.exports={createMemoryMonitor};
