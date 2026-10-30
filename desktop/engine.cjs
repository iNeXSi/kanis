const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);
const DAY = 86400000;

function within(root, file) {
  const rel = path.relative(path.resolve(root), path.resolve(file));
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
}
function same(a,b) { return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase(); }
function excluded(file, exclusions) { return exclusions.some(x => same(x,file) || within(x,file)); }
// Walk every ancestor: junctions/reparse-point symlinks must never become cleanup roots.
async function noLinks(file) {
  let current = path.resolve(file);
  for (;;) {
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink()) throw new Error('Linked paths are protected');
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
function categories(home = os.homedir(), local = process.env.LOCALAPPDATA || path.join(home,'AppData','Local')) {
  return [
    {id:'temp', ar:'الملفات المؤقتة', en:'Temporary files', desc:'ملفات لم تتغير منذ 24 ساعة', icon:'files', safe:true, roots:[path.join(local,'Temp')]},
    {id:'crash', ar:'تقارير الأعطال', en:'Crash reports', desc:'تقارير قديمة لتشخيص الأعطال', icon:'report', safe:true, roots:[path.join(local,'CrashDumps')]},
    {id:'chrome', ar:'كاش Google Chrome', en:'Google Chrome cache', desc:'الكاش فقط، دون كلمات المرور أو السجل', icon:'globe', process:'chrome.exe', roots:[path.join(local,'Google','Chrome','User Data','Default','Cache'),path.join(local,'Google','Chrome','User Data','Default','Code Cache')]},
    {id:'edge', ar:'كاش Microsoft Edge', en:'Microsoft Edge cache', desc:'أغلق المتصفح قبل تنظيفه', icon:'globe', process:'msedge.exe', roots:[path.join(local,'Microsoft','Edge','User Data','Default','Cache'),path.join(local,'Microsoft','Edge','User Data','Default','Code Cache')]},
    {id:'brave', ar:'كاش Brave', en:'Brave cache', desc:'ملفات المتصفح القابلة لإعادة الإنشاء', icon:'globe', process:'brave.exe', roots:[path.join(local,'BraveSoftware','Brave-Browser','User Data','Default','Cache')]},
    {id:'npm', ar:'كاش npm', en:'npm cache', desc:'قد يلزم تنزيل الحزم مجددًا', icon:'code', process:'node.exe', roots:[path.join(local,'npm-cache','_cacache')]},
    {id:'pip', ar:'كاش Python', en:'Python cache', desc:'حزم التثبيت المخزنة مؤقتًا', icon:'code', process:'python.exe', roots:[path.join(local,'pip','Cache')]},
    {id:'shader', ar:'كاش الرسوميات', en:'Graphics cache', desc:'سيعيد ويندوز إنشاءه عند الحاجة', icon:'chip', roots:[path.join(local,'D3DSCache')]}
  ];
}
async function processes() {
  if(process.platform !== 'win32') return new Set();
  const {stdout} = await execFileAsync('tasklist.exe',['/FO','CSV','/NH'],{windowsHide:true,timeout:15000,maxBuffer:8*1024*1024});
  return new Set(stdout.split(/\r?\n/).map(line => line.match(/^"([^"]+)"/)?.[1]?.toLowerCase()).filter(Boolean));
}
async function diskInfo(root = os.homedir()) {
  const s = await fs.statfs(root);
  return { total:s.blocks*s.bsize, free:s.bavail*s.bsize, used:(s.blocks-s.bfree)*s.bsize, drive:path.parse(root).root };
}
async function systemInfo() {
  const [primary,volumes]=await Promise.all([diskInfo(),require('./windows.cjs').allDrives()]);
  const total=os.totalmem(),free=os.freemem();
  return {disk:primary,disks:volumes.disks.length?volumes.disks:[{...primary,ready:true,type:'Fixed',label:''}],disksError:volumes.error,disksCheckedAt:volumes.at,memory:{total,free,used:total-free},host:os.hostname(),platform:'Windows',cpus:os.cpus().length};
}
async function walk(root, {signal, exclusions=[], minAge=0, minSize=0, limit=20000, onProgress=()=>{}} = {}) {
  const files=[], errors=[];
  let visited=0, partial=false;
  try { await noLinks(root); } catch(e) { if(e.code !== 'ENOENT') errors.push({path:root,code:e.code || 'PROTECTED'}); return {files,errors,partial,visited}; }
  if(excluded(root,exclusions)) return {files,errors,partial,visited};
  const queue=[root];
  while(queue.length && !signal?.aborted) {
    const dir=queue.pop();
    let entries;
    try { await noLinks(dir); entries=await fs.readdir(dir,{withFileTypes:true}); }
    catch(e) {errors.push({path:dir,code:e.code || 'PROTECTED'});continue;}
    for(const entry of entries) {
      if(signal?.aborted) break;
      if(++visited>limit) {partial=true;break;}
      const target=path.join(dir,entry.name);
      if(entry.isSymbolicLink() || excluded(target,exclusions)) continue;
      try {
        const stat=await fs.lstat(target);
        if(stat.isSymbolicLink()) continue;
        if(stat.isDirectory()) {queue.push(target);continue;}
        if(!stat.isFile() || stat.nlink>1 || stat.size<minSize || Date.now()-stat.mtimeMs<minAge) continue;
        files.push({id:randomUUID(),path:target,name:entry.name,size:stat.size,mtime:stat.mtimeMs,ino:stat.ino,root});
      } catch(e) {errors.push({path:target,code:e.code || 'UNREADABLE'});}
      if(visited%100===0) {onProgress({visited});await new Promise(r=>setImmediate(r));}
    }
    if(partial) break;
  }
  return {files,errors,partial:partial || !!signal?.aborted,visited};
}
class Cleaner {
  constructor({catalog=categories(),getProcesses=processes,trash,readDisk=diskInfo}={}) {
    this.catalog=catalog;this.getProcesses=getProcesses;this.trash=trash;this.readDisk=readDisk;this.snapshot=null;this.busy=false;this.controller=null;
  }
  cancel(){this.controller?.abort();}
  async scan(exclusions=[], onProgress=()=>{}) {
    if(this.busy) throw new Error('BUSY');
    this.busy=true;this.controller=new AbortController();this.snapshot=null;
    try {
      let running,processCheckFailed=false;
      try{running=await this.getProcesses();}catch{running=new Set();processCheckFailed=true;}
      const results=[];
      for(let i=0;i<this.catalog.length;i+=3) {
        const batch=await Promise.all(this.catalog.slice(i,i+3).map(async c=>{
          const item={...c,files:[],errors:[],bytes:0,partial:false,blocked:!!c.process&&(processCheckFailed||running.has(c.process)),processCheckFailed};
          for(const root of c.roots) {
            const result=await walk(root,{exclusions,minAge:DAY,signal:this.controller.signal,onProgress:p=>onProgress({...p,category:c.id,completed:results.length,total:this.catalog.length})});
            item.files.push(...result.files);item.errors.push(...result.errors);item.partial ||= result.partial;
          }
          item.bytes=item.files.reduce((n,f)=>n+f.size,0);
          return item;
        }));
        results.push(...batch);onProgress({completed:results.length,total:this.catalog.length});
        if(this.controller.signal.aborted) break;
      }
      const snapshot={id:randomUUID(),createdAt:Date.now(),categories:results,cancelled:this.controller.signal.aborted};
      this.snapshot=snapshot;return snapshot;
    } finally {this.busy=false;this.controller=null;}
  }
  async clean({scanId,ids,mode='trash',exclusions=[]},onProgress=()=>{}) {
    if(this.busy) throw new Error('BUSY');
    if(!this.snapshot || this.snapshot.id!==scanId || Date.now()-this.snapshot.createdAt>15*60000) throw new Error('SCAN_EXPIRED');
    if(!Array.isArray(ids)||!ids.length||ids.length>100000||!['trash','permanent'].includes(mode)) throw new Error('INVALID_SELECTION');
    const selected=new Set(ids), catalog=this.snapshot.categories;
    const known=new Set(catalog.flatMap(c=>c.files.map(f=>f.id)));
    if(ids.some(id=>!known.has(id))) throw new Error('INVALID_SELECTION');
    this.busy=true;
    const snapshot=this.snapshot;this.snapshot=null;
    try {
      const before=await this.readDisk();
      const result={id:randomUUID(),at:Date.now(),mode,processedBytes:0,processed:0,skipped:0,failures:[],beforeFree:before.free};
      for(const category of catalog) {
        const targets=category.files.filter(f=>selected.has(f.id));
        if(!targets.length) continue;
        let protectedApp=false;
        if(category.process) {try{protectedApp=(await this.getProcesses()).has(category.process);}catch{protectedApp=true;}}
        for(const file of targets) {
          try {
            if(protectedApp) throw new Error('APP_RUNNING');
            if(!category.roots.some(root=>same(root,file.root)&&within(root,file.path)) || excluded(file.path,exclusions)) throw new Error('PROTECTED');
            await noLinks(file.path);
            const stat=await fs.lstat(file.path);
            if(!stat.isFile()||stat.nlink>1||stat.size!==file.size||stat.mtimeMs!==file.mtime||stat.ino!==file.ino||Date.now()-stat.mtimeMs<DAY) throw new Error('FILE_CHANGED');
            if(mode==='trash') {if(!this.trash) throw new Error('TRASH_UNAVAILABLE');await this.trash(file.path);}
            else await fs.unlink(file.path);
            result.processed++;result.processedBytes+=file.size;
          } catch(e) {result.skipped++;result.failures.push({path:file.path,code:e.code||e.message});}
          onProgress({completed:result.processed+result.skipped,total:selected.size});
        }
      }
      let after;
      try{after=await this.readDisk();}catch{result.measurementWarning=true;}
      result.afterFree=after?.free??null;result.freeSpaceDelta=after?after.free-before.free:null;
      // Other programs can change free space during cleanup. This is a measured delta, not attribution.
      result.savedBytes=mode==='trash'?0:after?Math.max(0,Math.min(result.processedBytes,result.freeSpaceDelta)):null;
      result.scanId=snapshot.id;
      return result;
    } finally {this.busy=false;}
  }
}
module.exports={Cleaner,categories,walk,within,excluded,noLinks,processes,diskInfo,systemInfo,DAY};
