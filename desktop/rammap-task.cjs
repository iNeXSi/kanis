const path=require('node:path');
const fs=require('node:fs/promises');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {powershell}=require('./windows.cjs');
const {SHA256}=require('./rammap.cjs');
const execute=promisify(execFile);
const quote=value=>"'"+value.replace(/'/g,"''")+"'";
const args=source=>['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(source,'utf16le').toString('base64')];
const options={windowsHide:true,maxBuffer:131072,env:{...process.env,PSModulePath:path.join(path.dirname(powershell),'Modules')}};
function prefix(source){
  return `$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $expectedHash='${SHA256}';\n${source}`;
}
function elevation(source){
  const encoded=Buffer.from(source,'utf16le').toString('base64');
  return `$ErrorActionPreference='Stop';try{$p=Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList @('-NoProfile','-NonInteractive','-EncodedCommand','${encoded}') -Verb RunAs -WindowStyle Hidden -PassThru;$p.WaitForExit();exit $p.ExitCode}catch{if($_.Exception.NativeErrorCode -eq 1223 -or $_.Exception.InnerException.NativeErrorCode -eq 1223){exit 1223};exit 1}`;
}
function createRammapTask({sourceFile,run=execute}){
  let ready=false,pending=false;
  async function script(name){return fs.readFile(path.join(__dirname,name),'utf8');}
  async function inspect(){
    try{
      const {stdout}=await run(powershell,args(prefix(await script('rammap-task-check.ps1'))),{...options,timeout:30000});
      const data=JSON.parse(stdout.replace(/^\uFEFF/,''));
      ready=data.ready===true;return data;
    }catch(error){ready=false;return {ready:false,diagnostic:error.stderr||error.message};}
  }
  return {
    get ready(){return ready;},
    inspect,
    async prepare(){
      if(pending)throw Error('BUSY');
      pending=true;
      try{
        if((await inspect()).ready)return true;
        const identity=await run(powershell,args('[Security.Principal.WindowsIdentity]::GetCurrent().User.Value'),{...options,timeout:15000});
        const sid=identity.stdout.trim();
        if(!/^S-\d(-\d+)+$/.test(sid))throw Error('RAMMAP_SETUP_FAILED');
        const source=prefix(`$expectedSid='${sid}';$sourceFile=${quote(sourceFile)};\n${await script('rammap-task-setup.ps1')}`);
        try{await run(powershell,args(elevation(source)),{...options,timeout:180000});}
        catch(e){throw Error(e.code===1223?'RAMMAP_CANCELLED':'RAMMAP_SETUP_FAILED',{cause:e});}
        if(!(await inspect()).ready)throw Error('RAMMAP_SETUP_FAILED');
        return true;
      }finally{pending=false;}
    },
    async run(allowed){
      if(!(await inspect()).ready)throw Error('RAMMAP_TASK_UNAVAILABLE');
      if(!allowed())return {cancelled:true};
      // Revalidate in the same host that calls Run. The task accepts no input arguments.
      const source=prefix((await script('rammap-task-check.ps1')).replace('Write-Output ($result | ConvertTo-Json -Compress)','')+'\n'+await script('rammap-task-run.ps1'));
      if(!allowed())return {cancelled:true};
      try{
        const {stdout}=await run(powershell,args(source),{...options,timeout:150000});
        const result=JSON.parse(stdout.replace(/^\uFEFF/,''));
        if(result.completed!==true)throw Error('RAMMAP_TASK_FAILED');
        return {completed:true};
      }catch(e){ready=false;throw Error(e.killed?'RAMMAP_TIMEOUT':'RAMMAP_TASK_FAILED');}
    }
  };
}
module.exports={createRammapTask,elevation};
