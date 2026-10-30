const path=require('node:path');
const os=require('node:os');
const {randomUUID}=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const execute=promisify(execFile);
async function runHelper(mode,rows,exe,options={}){
  const args=[mode,exe];
  if(mode==='trim'||mode==='trim-background')args.push(Buffer.from(JSON.stringify(rows)).toString('base64'));
  let stdout;
  try{({stdout}=await execute(path.join(__dirname,'memory-helper.exe'),args,{windowsHide:true,timeout:45000,maxBuffer:1024*1024,signal:options.signal}));}
  catch(error){if(['UNKNOWN','EACCES','EPERM','ENOENT'].includes(error.code))throw Error('MEMORY_HELPER_UNAVAILABLE',{cause:error});throw error;}
  const data=JSON.parse(stdout.replace(/^\uFEFF/,''));
  if(!Array.isArray(data))throw Error('MEMORY_UNAVAILABLE');
  return data;
}
function createMemoryControl({exe=process.execPath,run=runHelper,now=Date.now,free=os.freemem}={}){
  let issued=new Map(),listedAt=0,busy=false,lastTrim=null,unavailable=false;
  async function invoke(...args){try{const result=await run(...args);unavailable=false;return result;}catch(error){if(error.message==='MEMORY_HELPER_UNAVAILABLE')unavailable=true;throw error;}}
  return {
    get busy(){return busy;},
    get unavailable(){return unavailable;},
    async checkAvailable(){if(busy)throw Error('BUSY');busy=true;try{await invoke('list',[],exe);return true;}finally{busy=false;}},
    async autoTrim(allowed,signal){
      if(busy)throw Error('BUSY');
      if(lastTrim!==null&&now()-lastTrim<60000)return {cancelled:true,rows:[]};
      busy=true;
      try{
        const rows=await invoke('list',[],exe,{signal});
        if(!allowed())return {cancelled:true,rows:[]};
        const targets=rows.filter(r=>r.hasVisibleWindow===false&&Number.isSafeInteger(r.pid)&&r.pid>0&&/^\d{1,20}$/.test(r.created)&&Number.isFinite(r.before)&&r.before>=1024*1024).sort((a,b)=>b.before-a.before).slice(0,10).map(r=>({pid:r.pid,created:r.created}));
        if(!targets.length)return {rows:[]};
        const availableBefore=free();lastTrim=now();
        const results=await invoke('trim-background',targets,exe,{signal});
        return {availableBefore,availableAfter:free(),rows:targets.map(target=>{
          const row=results.find(r=>r.pid===target.pid&&r.created===target.created);
          return {pid:target.pid,status:row?.status==='trimmed'?'trimmed':'skipped'};
        })};
      }finally{busy=false;}
    },
    async list(){
      if(busy)throw Error('BUSY');busy=true;
      try{
        const rows=await invoke('list',[],exe);
        issued=new Map();listedAt=now();
        const processes=rows.filter(r=>Number.isSafeInteger(r.pid)&&r.pid>0&&/^\d{1,20}$/.test(r.created)&&typeof r.name==='string'&&Number.isFinite(r.before)&&r.before>=0).slice(0,40).map(r=>{
          const id=randomUUID();issued.set(id,{pid:r.pid,created:r.created});
          return {id,pid:r.pid,name:r.name.slice(0,260),bytes:r.before,hasVisibleWindow:typeof r.hasVisibleWindow==='boolean'?r.hasVisibleWindow:null};
        });
        return {processes,at:listedAt};
      }finally{busy=false;}
    },
    async trim(ids){
      if(busy)throw Error('BUSY');
      if(!Array.isArray(ids)||!ids.length||ids.length>10||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!issued.has(id)))throw Error('INVALID_SELECTION');
      if(now()-listedAt>120000)throw Error('MEMORY_EXPIRED');
      if(lastTrim!==null&&now()-lastTrim<60000)throw Error('MEMORY_COOLDOWN');
      const targets=ids.map(id=>issued.get(id));issued.clear();busy=true;lastTrim=now();
      const availableBefore=free();
      try {
        const rows=await invoke('trim',targets,exe);
        return {at:now(),availableBefore,availableAfter:free(),rows:targets.map(target=>{
          const row=rows.find(r=>r.pid===target.pid&&r.created===target.created);
          return {pid:target.pid,status:row?.status==='trimmed'?'trimmed':'skipped',before:Number.isFinite(row?.before)?row.before:null,after:Number.isFinite(row?.after)?row.after:null};
        })};
      }finally{busy=false;}
    }
  };
}
module.exports={createMemoryControl,runHelper};
