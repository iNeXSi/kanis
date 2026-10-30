const fs=require('node:fs/promises'),path=require('node:path');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function capture(win,root,{cleaner,dialog}){
 await fs.mkdir(root,{recursive:true});const fixture=path.join(root,'fixtures');await fs.mkdir(fixture,{recursive:true});
 const old=path.join(fixture,'old.cache');await fs.writeFile(old,'test-only-cache');await fs.utimes(old,new Date(Date.now()-172800000),new Date(Date.now()-172800000));
 await fs.writeFile(path.join(fixture,'fresh.cache'),'protected');const big=await fs.open(path.join(fixture,'large-test.bin'),'w');await big.truncate(101*1024*1024);await big.close();
 cleaner.catalog=[{id:'temp',ar:'ملفات اختبار',en:'Test files',safe:true,roots:[fixture],icon:'files'}];
 const originalDialog=dialog.showOpenDialog;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[fixture]});
 const evaluate=s=>win.webContents.executeJavaScript(s),checks={};
 const click=label=>evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}||b.getAttribute('aria-label')===${JSON.stringify(label)});if(!b)throw Error('Missing button: '+${JSON.stringify(label)});b.click();})()`);
 const until=async s=>{for(let i=0;i<60;i++){if(await evaluate(s))return;await pause(300);}throw Error('UI timeout: '+s);};
 const shot=async name=>{await pause(400);await fs.writeFile(path.join(root,name+'.png'),(await win.webContents.capturePage()).toPNG());};
 try{
  await until(`!!document.querySelector('.action-tile.teal')`);
  checks.freshSettings=await evaluate(`window.kanis.settings().then(s=>s.autoMemory===false&&s.autoMemoryThreshold===85&&s.exclusions.length===0)`);
  checks.freshRammap=await evaluate(`window.kanis.rammapStatus().then(s=>s.installed===false)`);
  checks.realMetrics=await evaluate(`window.kanis.system().then(s=>s.memory.total>0&&s.disks.some(d=>d.ready))`);
  await shot('overview');await evaluate(`document.querySelector('.action-tile.teal').click()`);await until(`!!document.querySelector('.categories')`);
  checks.scanRendered=await evaluate(`document.body.innerText.includes('ملفات اختبار')`);
  checks.freshFilesProtected=cleaner.snapshot.categories[0].files.length===1;
  checks.qaCannotClean=await evaluate(`window.kanis.clean({}).then(()=>false,e=>e.message.includes('QA_READ_ONLY'))`);await shot('clean');
  checks.realMap=await evaluate(`window.kanis.diskMap().then(s=>s.count===3&&s.bytes>100*1024*1024)`);
  checks.realLargeFiles=await evaluate(`window.kanis.large().then(s=>s.files.length===1&&s.files[0].name==='large-test.bin')`);
  await click('الذاكرة');await until(`!!document.querySelector('.memory-auto')`);await pause(700);
  checks.installGuidance=await evaluate(`document.body.innerText.includes('اختيار ملف RAMMap')`);
  checks.manualDisabledUntilSetup=await evaluate(`[...document.querySelectorAll('.rammap-panel button')].some(b=>b.textContent.trim()==='تقليل الرام الآن'&&b.disabled)`);
  checks.qaCannotTrim=await evaluate(`window.kanis.rammapTrim(true).then(()=>false,e=>e.message.includes('QA_READ_ONLY'))`);
  await shot('memory');await click('الإعدادات');
  await evaluate(`(()=>{const s=document.querySelector('select[aria-label="Language / اللغة"]');s.value='en';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await until(`document.documentElement.dir==='ltr'&&document.body.innerText.includes('Windows edition 0.6.1')`);
  checks.englishAndVersion=true;await click('Overview');await shot('english');await click('Toggle theme');await until(`document.documentElement.dataset.theme==='dark'`);
  win.setSize(780,850);await pause(700);checks.narrowNoOverflow=await evaluate(`document.documentElement.scrollWidth<=innerWidth`);await shot('dark-narrow');
 }finally{dialog.showOpenDialog=originalDialog;await fs.writeFile(path.join(root,'release-check.json'),JSON.stringify(checks,null,2));}
 if(Object.values(checks).some(v=>v!==true)||Object.keys(checks).length!==13)throw Error('RELEASE_QA_FAILED');
}
module.exports={capture};
