const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const net=require('node:net');
const {planReport,report}=require('../desktop/health.cjs');
const {normalizeSettings}=require('../desktop/preferences.cjs');
const {parseDrives}=require('../desktop/windows.cjs');
const {summarize}=require('../desktop/disk-map.cjs');
const {runAdminScan,validateResult,commandFor}=require('../desktop/admin.cjs');
const GB=1024**3,now=2000000000000;
const system={disks:[{drive:'C:\\',ready:true,total:200*GB,free:70*GB},{drive:'D:\\',ready:true,total:500*GB,free:5*GB}],memory:{total:16*GB,used:14*GB}};
test('secondary low drive triggers a useful report and per-drive cooldown survives reload',()=>{
  const prefs=normalizeSettings({diskReports:false});const first=planReport(system,prefs,{},now);
  assert.match(first.body,/D:/);assert.match(first.body,/RAM 88%/);assert.match(first.body,/تخزين ويندوز/);
  const persisted=JSON.parse(JSON.stringify(first.state));assert.equal(planReport(system,prefs,persisted,now+3600000),null);
  assert.ok(planReport(system,prefs,persisted,now+6*3600000));
  const newLow={...system,disks:[{...system.disks[0],free:2*GB},system.disks[1]]};assert.ok(planReport(newLow,prefs,persisted,now+60000));
});
test('periodic reports respect frequency, disable switches and delivery retry',()=>{
  const prefs=normalizeSettings({lowDisk:false,reportMinutes:180});const r=planReport(system,prefs,{},now);
  assert.ok(r);assert.equal(planReport(system,prefs,r.state,now+60*60000),null);
  assert.ok(planReport(system,prefs,r.state,now+180*60000));
  assert.equal(planReport(system,{...prefs,diskReports:false},{},now),null);
  assert.equal(planReport(system,prefs,{retryAt:now+3600000},now),null);
  assert.equal(planReport({disks:[]},prefs,{},now),null);
});
test('notification offers task manager for high RAM when disks are healthy',()=>{const r=report(system,normalizeSettings({lang:'en'}));assert.match(r.body,/Task Manager/);});
test('preferences migrate old versions and reject invalid intervals',()=>{
  const s=normalizeSettings({lang:'en',homeDhikrSeconds:0,reportMinutes:-1,lowDiskGB:999,exclusions:['C:\\safe','C:\\safe',123],diskReports:false});
  assert.equal(s.homeDhikrSeconds,30);assert.equal(s.reportMinutes,180);assert.equal(s.lowDiskGB,15);assert.equal(s.diskReports,false);assert.deepEqual(s.exclusions,['C:\\safe']);assert.equal(s.homeDhikrAuto,true);
});
test('drive parser supports a single drive, multiple drives and unavailable media',()=>{
  const one=parseDrives('\ufeff'+JSON.stringify({drive:'c:\\',ready:true,total:100,free:30}));assert.equal(one[0].used,70);assert.equal(one[0].drive,'C:\\');
  const many=parseDrives(JSON.stringify([{drive:'D:\\',ready:false},{drive:'C:\\',ready:true,total:10,free:11},{drive:'bad',ready:true,total:10,free:1}]));assert.equal(many.length,2);assert.equal(many[0].ready,false);assert.equal(many[1].total,null);
});
test('map folder totals and file types reconcile to readable file bytes',()=>{
  const root=path.resolve('sample-map'),files=[['Apps/a.zip',10],['Apps/Sub/b.zip',20],['Users/c.mp4',35],['direct.txt',5]].map(([rel,size],i)=>({id:String(i),path:path.join(root,...rel.split('/')),name:path.basename(rel),size}));
  const result=summarize(root,files);assert.equal(result.bytes,70);assert.equal(result.count,4);assert.equal(result.groups.reduce((n,g)=>n+g.bytes,0),70);assert.equal(result.types.reduce((n,g)=>n+g.bytes,0),70);assert.equal(result.groups.find(g=>g.id==='Apps').children[0].bytes,20);assert.equal(result.largest[0].size,35);
});
test('home rotation wraps and excludes the wrong time-of-day collection',async()=>{
  const {eligibleDhikr,nextDhikr}=await import('../src/rotation.mjs');const items=['general','morning','evening','sleep'].map(type=>({type,text:type}));
  assert.deepEqual(eligibleDhikr(items,4).map(x=>x.type),['general','morning']);assert.deepEqual(eligibleDhikr(items,12).map(x=>x.type),['general']);assert.deepEqual(eligibleDhikr(items,16).map(x=>x.type),['general','evening']);assert.deepEqual(eligibleDhikr(items,21).map(x=>x.type),['general','sleep']);assert.equal(nextDhikr(items,items[1],8).type,'general');assert.equal(nextDhikr(items,items[0],8).type,'morning');
});
const validAdmin={readOnly:true,minimumAgeDays:7,categories:['windows-temp','error-archive','error-queue'].map(id=>({id,root:'C:\\Windows\\Temp',bytes:12,count:1,samples:[]}))};
test('admin bridge validates the readonly response and never accepts arbitrary pipe instructions',()=>{assert.equal(validateResult(validAdmin).readOnly,true);assert.throws(()=>validateResult({...validAdmin,readOnly:false}),/ADMIN_INVALID_RESULT/);assert.throws(()=>commandFor('safe',"bad';command"),/INVALID_PIPE/);});
test('admin bridge receives a real named-pipe response without elevating or touching system files',async()=>{
  const result=await runAdminScan({timeoutMs:3000,launch:({address})=>new Promise((resolve,reject)=>{const c=net.connect(address,()=>{c.end(JSON.stringify(validAdmin));resolve();});c.on('error',reject);})});assert.equal(result.categories.length,3);assert.ok(result.at>0);
});
test('cancelled administrator launch and no-response timeout return recoverable errors',async()=>{
  await assert.rejects(()=>runAdminScan({launch:async()=>{throw new Error('ADMIN_CANCELLED');}}),/ADMIN_CANCELLED/);
  await assert.rejects(()=>runAdminScan({timeoutMs:30,launch:async()=>{}}),/ADMIN_TIMEOUT/);
});
