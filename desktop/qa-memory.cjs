const fs=require('node:fs/promises');
const path=require('node:path');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function capture(win,root){
  await fs.mkdir(root,{recursive:true});
  const evaluate=script=>win.webContents.executeJavaScript(script);
  const click=label=>evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}||b.getAttribute('aria-label')===${JSON.stringify(label)});if(!b)throw Error('Missing QA button: '+${JSON.stringify(label)});b.click();})()`);
  const checks={};
  await pause(1500);await click('الذاكرة');
  for(let i=0;i<110;i++){await pause(500);if(await evaluate(`!!document.querySelector('.memory-process-list')`))break;}
  checks.actualProcessList=await evaluate(`!!document.querySelector('.memory-process')`);
  checks.noneSelected=await evaluate(`document.querySelectorAll('.memory-process input:checked').length===0`);
  checks.trimDisabledWithoutSelection=await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('تقليل رام المحدد')).disabled`);
  if(!checks.actualProcessList){await fs.writeFile(path.join(root,'list-failure.json'),JSON.stringify({text:await evaluate('document.body.innerText'),bridge:await evaluate(`window.kanis.memoryProcesses().then(r=>({count:r.processes.length}),e=>({error:e.message}))`)},null,2));throw Error('PROCESS_LIST_FAILED');}
  await evaluate(`document.querySelector('.memory-process input').click()`);
  await click('تقليل رام المحدد');
  checks.reviewDialog=await evaluate(`!!document.querySelector('dialog[open]')&&document.querySelector('dialog').innerText.includes('PID')`);
  await click('إلغاء');
  checks.cancelLeavesSelection=await evaluate(`!document.querySelector('dialog')&&document.querySelectorAll('.memory-process input:checked').length===1`);
  checks.quickActionAboveFold=await evaluate(`(()=>{const b=document.querySelector('.memory-quick button'),r=b.getBoundingClientRect();return !b.disabled&&r.top>=0&&r.bottom<innerHeight;})()`);
  await click('تقليل رام الخلفية');
  checks.backgroundReview=await evaluate(`!!document.querySelector('dialog[open]')&&document.querySelectorAll('dialog li').length>0&&document.querySelectorAll('dialog li').length<=10`);
  checks.onlyBackgroundSelected=await evaluate(`[...document.querySelectorAll('.memory-process input:checked')].every(input=>input.closest('label').innerText.includes('بلا نافذة ظاهرة'))`);
  await click('إلغاء');
  await click('كل العمليات');
  checks.filterResetsSelection=await evaluate(`document.querySelectorAll('.memory-process input:checked').length===0`);
  await evaluate(`document.querySelector('.memory-auto input[role="switch"]').click()`);
  await pause(500);
  checks.autoEnabled=await evaluate(`window.kanis.settings().then(s=>s.autoMemory===true)`);
  await evaluate(`(()=>{const s=document.querySelector('.memory-auto select');s.value='90';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await pause(500);
  checks.autoThresholdSaved=await evaluate(`window.kanis.settings().then(s=>s.autoMemoryThreshold===90)`);
  checks.autoNeverRunsInQA=await evaluate(`window.kanis.system().then(s=>s.memoryAuto.lastAttempt===0&&!s.memoryAuto.running)`);
  await evaluate(`document.querySelector('.memory-auto input[role="switch"]').click()`);
  await pause(500);
  checks.autoDisabled=await evaluate(`window.kanis.settings().then(s=>s.autoMemory===false)`);
  checks.qaTrimBlocked=await evaluate(`window.kanis.trimMemory([]).then(()=>false,e=>e.message.includes('QA_READ_ONLY'))`);
  await evaluate(`window.kanis.saveSettings({memoryRefreshSeconds:30})`);win.webContents.send('navigate','memory');
  await evaluate(`window.dispatchEvent(new Event('focus'))`);await pause(500);
  checks.intervalSaved=await evaluate(`document.querySelector('.memory-preferences select').value==='30'`);
  checks.noOverflow=await evaluate(`document.documentElement.scrollWidth<=innerWidth`);
  await fs.writeFile(path.join(root,'memory.png'),(await win.webContents.capturePage()).toPNG());
  await click('تبديل المظهر');win.setSize(780,850);await pause(1000);
  checks.darkNoOverflow=await evaluate(`document.documentElement.dataset.theme==='dark'&&document.documentElement.scrollWidth<=innerWidth`);
  await fs.writeFile(path.join(root,'memory-dark-narrow.png'),(await win.webContents.capturePage()).toPNG());
  await fs.writeFile(path.join(root,'memory-check.json'),JSON.stringify(checks,null,2));
  if(Object.values(checks).some(x=>x!==true))throw Error('MEMORY_UI_QA_FAILED');
}
module.exports={capture};
