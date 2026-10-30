const fs=require('node:fs/promises');
const path=require('node:path');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function capture(win,root){
  const evaluate=script=>win.webContents.executeJavaScript(script);
  const click=label=>evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}||b.getAttribute('aria-label')===${JSON.stringify(label)});if(!b)throw Error('Missing QA button');b.click();})()`);
  const checks=[];
  const shot=async name=>{await pause(1200);await fs.writeFile(path.join(root,name+'.png'),(await win.webContents.capturePage()).toPNG());checks.push({name,...await evaluate(`({theme:document.documentElement.dataset.theme,canvas:getComputedStyle(document.documentElement).getPropertyValue('--canvas'),text:document.body.innerText,overflow:document.documentElement.scrollWidth>innerWidth,bridge:!!window.kanis,buttons:document.querySelectorAll('button').length})`)});};
  await fs.mkdir(root,{recursive:true});
  await win.webContents.insertCSS('* { animation:none!important;transition:none!important; }');
  await evaluate('window.kanis.system()');await pause(1300);
  await shot('desktop');
  await click('التنبيهات والوصول');await shot('automation');
  await click('خريطة القرص');await shot('map-empty');
  await click('الذاكرة');await shot('memory');
  await click('الرئيسية');await evaluate(`document.querySelector('.action-tile.teal').click()`);
  for(let i=0;i<180;i++){await pause(500);if(await evaluate(`!!document.querySelector('.categories')`))break;}
  if(!await evaluate(`!!document.querySelector('.categories')`)){await evaluate('window.kanis.cancel()');for(let i=0;i<30;i++){await pause(500);if(await evaluate(`!!document.querySelector('.categories')`))break;}}
  if(!await evaluate(`!!document.querySelector('.categories')`))throw Error('QA_SCAN_DID_NOT_FINISH');
  await shot('cleanup');
  await click('الرئيسية');await click('تبديل المظهر');await shot('dark');
  await click('تنظيف');await shot('cleanup-reviewed');await click('الرئيسية');
  await click('تبديل المظهر');win.setSize(780,850);await shot('narrow');
  await fs.writeFile(path.join(root,'desktop-check.json'),JSON.stringify(checks,null,2));
}
module.exports={capture};
