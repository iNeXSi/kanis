const net=require('node:net');
const {randomBytes}=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {powershell}=require('./windows.cjs');
function commandFor(source,name){
  if(!/^kanis-[a-f0-9]{32}$/.test(name))throw new Error('INVALID_PIPE');
  const script=`$pipeName='${name}'\n${source}`;
  const encoded=Buffer.from(script,'utf16le').toString('base64');
  const launch=`$ErrorActionPreference='Stop'; try { $p=Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList @('-NoProfile','-NonInteractive','-EncodedCommand','${encoded}') -Verb RunAs -WindowStyle Hidden -PassThru; $p.WaitForExit(); exit $p.ExitCode } catch { exit 1223 }`;
  return ['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(launch,'utf16le').toString('base64')];
}
function validateResult(value){
  if(value?.error)throw new Error('ADMIN_SCAN_FAILED');
  const ids=['windows-temp','error-archive','error-queue'];
  if(value?.readOnly!==true||!Array.isArray(value.categories)||value.categories.length!==3)throw new Error('ADMIN_INVALID_RESULT');
  for(const [i,c] of value.categories.entries())if(c.id!==ids[i]||typeof c.root!=='string'||!Number.isFinite(c.bytes)||c.bytes<0||!Number.isInteger(c.count)||c.count<0||!Array.isArray(c.samples)||c.samples.length>12)throw new Error('ADMIN_INVALID_RESULT');
  return {...value,at:Date.now()};
}
async function runAdminScan({launch,timeoutMs=180000}={}){
  const source=await fs.readFile(path.join(__dirname,'admin-scan.ps1'),'utf8');
  const name='kanis-'+randomBytes(16).toString('hex');
  const address=process.platform==='win32'?'\\\\.\\pipe\\'+name:path.join(require('node:os').tmpdir(),name+'.sock');
  const args=commandFor(source,name);
  return new Promise((resolve,reject)=>{
    let done=false,socket;const server=net.createServer();
    const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);socket?.destroy();server.close();error?reject(error):resolve(result);};
    const timer=setTimeout(()=>finish(new Error('ADMIN_TIMEOUT')),timeoutMs);
    server.on('error',()=>finish(new Error('ADMIN_PIPE_FAILED')));
    server.on('connection',client=>{if(socket){client.destroy();return;}socket=client;const chunks=[];let bytes=0;
      client.on('data',chunk=>{bytes+=chunk.length;if(bytes>256*1024){finish(new Error('ADMIN_INVALID_RESULT'));return;}chunks.push(chunk);});
      client.on('error',()=>finish(new Error('ADMIN_PIPE_FAILED')));
      client.on('end',()=>{try{finish(null,validateResult(JSON.parse(Buffer.concat(chunks).toString('utf8'))));}catch(e){finish(e);}});
    });
    server.listen(address,()=>{
      if(launch){Promise.resolve().then(()=>launch({address,args})).catch(e=>finish(e));return;}
      execFile(powershell,args,{windowsHide:true,timeout:180000},error=>{if(error)finish(new Error(error.code===1223?'ADMIN_CANCELLED':'ADMIN_SCAN_FAILED'));});
    });
  });
}
module.exports={runAdminScan,commandFor,validateResult};
