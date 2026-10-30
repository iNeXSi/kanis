const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createHash}=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {powershell}=require('./windows.cjs');
const execute=promisify(execFile);
// Windows PowerShell must use its own signed OS modules, not inherited PowerShell 7 modules.
const shellOptions={windowsHide:true,maxBuffer:65536,env:{...process.env,PSModulePath:path.join(path.dirname(powershell),'Modules')}};
// Exact Microsoft download reviewed for this integration. Never run arbitrary executables.
const SHA256='E970913798481432CD590991577089E68510B861DC669DCAB24FEB06AAE0DF52';
const quote=value=>"'"+value.replace(/'/g,"''")+"'";
const argsFor=script=>['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')];
function signatureScript(file){
  return `$ErrorActionPreference='Stop'; $s=Get-AuthenticodeSignature -LiteralPath ${quote(file)}; if($s.Status -ne 'Valid' -or $s.SignerCertificate.Subject -notmatch '^CN=Microsoft Corporation,'){exit 10}`;
}
function launchScript(file){
  // Only the signed Microsoft executable is elevated, never this PowerShell host.
  return `${signatureScript(file)}; if((Get-FileHash -LiteralPath ${quote(file)} -Algorithm SHA256).Hash -ne '${SHA256}'){exit 10}; try{$p=Start-Process -FilePath ${quote(file)} -ArgumentList '-Ew' -Verb RunAs -WindowStyle Normal -PassThru; $p.WaitForExit(); exit $p.ExitCode}catch{if($_.Exception.NativeErrorCode -eq 1223 -or $_.Exception.InnerException.NativeErrorCode -eq 1223){exit 1223};exit 11}`;
}
function createRammap({file,run=execute,now=Date.now,free=os.freemem,validate,automatic}){
  let busy=false,lastAttempt=null,uncertain=false;
  async function verifiedBytes(source){
    const stat=await fs.lstat(source).catch(()=>{throw Error('RAMMAP_MISSING');});
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>5*1024*1024)throw Error('RAMMAP_UNTRUSTED');
    const bytes=await fs.readFile(source);
    if(createHash('sha256').update(bytes).digest('hex').toUpperCase()!==SHA256)throw Error('RAMMAP_UNTRUSTED');
    return bytes;
  }
  async function verify(source=file){
    await verifiedBytes(source);
    try{await run(powershell,argsFor(signatureScript(source)),{...shellOptions,timeout:30000});}
    catch{throw Error('RAMMAP_UNTRUSTED');}
  }
  const check=validate||verify;
  return {
    get busy(){return busy;},
    async status(){try{await verifiedBytes(file);return {installed:true,version:'1.63'};}catch(error){return {installed:false,error:error.message};}},
    verify,
    async autoTrim(allowed){
      if(busy)throw Error('BUSY');
      if(uncertain)throw Error('RAMMAP_TIMEOUT');
      if(!automatic)throw Error('RAMMAP_TASK_UNAVAILABLE');
      if(lastAttempt!==null&&now()-lastAttempt<60000)return {cancelled:true,rows:[]};
      busy=true;
      try{
        const before=free();
        const result=await automatic.run(()=>!uncertain&&allowed());
        if(result.cancelled)return {cancelled:true,rows:[]};
        lastAttempt=now();
        return {scope:'all-working-sets',completed:true,rows:[],availableBefore:before,availableAfter:free()};
      }catch(e){lastAttempt=now();if(e.message==='RAMMAP_TIMEOUT')uncertain=true;throw e;}
      finally{busy=false;}
    },
    async install(source){
      if(busy)throw Error('BUSY');busy=true;
      try{
        await verify(source);
        const bytes=await verifiedBytes(source);
        await fs.mkdir(path.dirname(file),{recursive:true});
        await fs.writeFile(file+'.tmp',bytes,{flag:'w'});
        await fs.rename(file+'.tmp',file);
        await verify();
        return {installed:true,version:'1.63'};
      }finally{busy=false;}
    },
    async trim(ack){
      if(ack!==true)throw Error('RAMMAP_CONFIRM_REQUIRED');
      if(busy)throw Error('BUSY');
      if(uncertain)throw Error('RAMMAP_TIMEOUT');
      if(lastAttempt!==null&&now()-lastAttempt<60000)throw Error('MEMORY_COOLDOWN');
      busy=true;
      try{
        await check(file);
        lastAttempt=now();
        const availableBefore=free();
        try{await run(powershell,argsFor(launchScript(file)),{...shellOptions,timeout:180000});}
        catch(error){
          if(error.code===1223)throw Error('RAMMAP_CANCELLED');
          if(error.killed||error.signal){uncertain=true;throw Error('RAMMAP_TIMEOUT');}
          if(error.code===10)throw Error('RAMMAP_UNTRUSTED');
          throw Error('RAMMAP_FAILED');
        }
        return {at:now(),availableBefore,availableAfter:free(),scope:'all-working-sets',status:'command-completed'};
      }finally{busy=false;}
    }
  };
}
module.exports={createRammap,signatureScript,launchScript,SHA256};
