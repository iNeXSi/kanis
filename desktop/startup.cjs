const path=require('node:path');
const fs=require('node:fs/promises');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {powershell}=require('./windows.cjs');
const name='Kanis',args=['--background'];
function createStartup(app,exe,{run=promisify(execFile)}={}){
  const options={path:exe,args};
  async function task(mode){
    const script=await fs.readFile(path.join(__dirname,'startup-task.ps1'),'utf8');
    const quote=value=>"'"+value.replace(/'/g,"''")+"'";
    const source=`$ErrorActionPreference='Stop';[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);$mode=${quote(mode)};$exe=${quote(exe)};\n${script}`;
    const {stdout}=await run(powershell,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(source,'utf16le').toString('base64')],{windowsHide:true,timeout:20000,maxBuffer:131072,env:{...process.env,PSModulePath:path.join(path.dirname(powershell),'Modules')}});
    return JSON.parse(stdout.replace(/^\uFEFF/,''));
  }
  function legacyEnabled(){
    const state=app.getLoginItemSettings(options);
    return state.openAtLogin===true&&state.launchItems?.some(item=>item.name===name&&item.scope==='user'&&item.enabled===true&&item.path.toLowerCase()===exe.toLowerCase()&&item.args.length===1&&item.args[0]===args[0])===true;
  }
  async function enabled(){const state=await task('inspect');return state.exists?state.enabled===true:legacyEnabled();}
  async function set(value){
    if(typeof value!=='boolean')throw Error('INVALID_STARTUP_SETTING');
    const state=await task(value?'enable':'disable');
    if(value&&state.enabled!==true)throw Error('STARTUP_FAILED');
    app.setLoginItemSettings({...options,name,openAtLogin:false,enabled:false});
    if(await enabled()!==value)throw Error('STARTUP_FAILED');
    return value;
  }
  return {enabled,set};
}
module.exports={createStartup};
