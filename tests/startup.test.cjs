const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createStartup}=require('../desktop/startup.cjs');
const exe='C:\\Apps\\كانس\\Kanis.exe';
function fixture({exists=false,enabled=false,legacy=true,fail=false}={}){
  const calls=[];
  const app={getLoginItemSettings:()=>({openAtLogin:legacy,launchItems:legacy?[{name:'Kanis',scope:'user',enabled:true,path:exe,args:['--background']}]:[]}),setLoginItemSettings:o=>{calls.push(o);legacy=o.openAtLogin;}};
  const run=async(file,args,options)=>{
    assert.equal(options.windowsHide,true);
    const script=Buffer.from(args.at(-1),'base64').toString('utf16le');
    assert.ok(script.includes("$exe='"+exe+"'"));
    if(script.includes("$mode='enable'")){if(fail)throw Error('ACCESS_DENIED');exists=true;enabled=true;}
    if(script.includes("$mode='disable'")){exists=false;enabled=false;}
    return {stdout:JSON.stringify({exists,enabled})};
  };
  return {startup:createStartup(app,exe,{run}),calls};
}
test('startup migrates legacy registration, verifies the task, and removes both mechanisms when disabled',async()=>{
  const {startup,calls}=fixture();
  assert.equal(await startup.enabled(),true);
  assert.equal(await startup.set(true),true);
  assert.equal(calls[0].openAtLogin,false);
  assert.equal(await startup.enabled(),true);
  assert.equal(await startup.set(false),false);
  assert.equal(await startup.enabled(),false);
  await assert.rejects(startup.set('yes'),/INVALID_STARTUP_SETTING/);
});
test('disabled or invalid existing task does not get masked by legacy entry',async()=>{
  const {startup}=fixture({exists:true,enabled:false});
  assert.equal(await startup.enabled(),false);
});
test('failed task registration preserves the previous login entry',async()=>{
  const {startup,calls}=fixture({fail:true});
  await assert.rejects(startup.set(true),/ACCESS_DENIED/);
  assert.equal(calls.length,0);
});
