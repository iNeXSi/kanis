const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const run=promisify(execFile);
const powershell=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
const driveScript=`[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); $rows=@(foreach($d in [System.IO.DriveInfo]::GetDrives()){try{if($d.IsReady){[pscustomobject]@{drive=$d.Name;label=$d.VolumeLabel;type=$d.DriveType.ToString();format=$d.DriveFormat;total=$d.TotalSize;free=$d.AvailableFreeSpace;used=($d.TotalSize-$d.TotalFreeSpace);ready=$true}}else{[pscustomobject]@{drive=$d.Name;type=$d.DriveType.ToString();ready=$false}}}catch{[pscustomobject]@{drive=$d.Name;ready=$false}}}); ConvertTo-Json -InputObject $rows -Compress`;
function parseDrives(text){
  const rows=JSON.parse(text.replace(/^\uFEFF/,''));
  return (Array.isArray(rows)?rows:[rows]).filter(d=>d&&/^[A-Z]:\\$/i.test(d.drive)).map(d=>{
    const ready=d.ready===true&&Number.isFinite(d.total)&&d.total>0&&Number.isFinite(d.free)&&d.free>=0&&d.free<=d.total;
    return {drive:d.drive.toUpperCase(),label:typeof d.label==='string'?d.label.slice(0,100):'',type:d.type||'Unknown',format:d.format||'',ready,total:ready?d.total:null,free:ready?d.free:null,used:ready?d.total-d.free:null};
  }).sort((a,b)=>a.drive.localeCompare(b.drive));
}
let cache=null,pending=null;
async function allDrives(){
  if(cache&&Date.now()-cache.at<30000)return cache;
  if(pending)return pending;
  pending=(async()=>{try{const {stdout}=await run(powershell,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(driveScript,'utf16le').toString('base64')],{windowsHide:true,timeout:15000,maxBuffer:1024*1024});cache={disks:parseDrives(stdout),at:Date.now(),error:false};}catch{cache={disks:cache?.disks||[],at:Date.now(),error:true};}return cache;})();
  try{return await pending;}finally{pending=null;}
}
function openTaskManager(){return new Promise((resolve,reject)=>{const child=execFile(path.join(process.env.SystemRoot||'C:\\Windows','System32','Taskmgr.exe'),[],{windowsHide:false},()=>{});child.once('spawn',()=>resolve(true));child.once('error',reject);});}
module.exports={allDrives,parseDrives,powershell,openTaskManager};
