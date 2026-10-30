const fs=require('node:fs/promises'),path=require('node:path');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function capture(win,root){
  await fs.mkdir(root,{recursive:true});
  const evaluate=s=>win.webContents.executeJavaScript(s);
  const click=label=>evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}||b.getAttribute('aria-label')===${JSON.stringify(label)});if(!b)throw Error('Missing button');b.click();})()`);
  await pause(2000);
  await evaluate(`Promise.all([400,500,700].map(w=>document.fonts.load(w+' 16px "thmanyah serif display"','كانس الذاكرة')).concat(document.fonts.load('900 32px "thmanyah sans"','كانس'))).then(()=>document.fonts.ready).then(()=>true)`);
  const checks=[];
  const shot=async name=>{
    await pause(700);
    await evaluate(`Promise.all([400,500,700].map(w=>document.fonts.load(w+' 16px "thmanyah serif display"','كانس الذاكرة')).concat(document.fonts.load('900 32px "thmanyah sans"','كانس'))).then(()=>document.fonts.ready).then(()=>true)`);
    const check=await evaluate(`({
      family:getComputedStyle(document.body).fontFamily,
      loaded:[...document.fonts].filter(f=>f.family.includes('thmanyah')).map(f=>({family:f.family,weight:f.weight,status:f.status})),
      noOverflow:document.documentElement.scrollWidth<=innerWidth,
      theme:document.documentElement.dataset.theme
    })`);
    checks.push({name,...check});
    await fs.writeFile(path.join(root,name+'.png'),(await win.webContents.capturePage()).toPNG());
  };
  await shot('overview-light');
  await click('الذاكرة');await shot('memory-light');
  await click('تبديل المظهر');await shot('memory-dark');
  await click('الرئيسية');win.setSize(780,850);await shot('overview-narrow-dark');
  await fs.writeFile(path.join(root,'fonts-check.json'),JSON.stringify(checks,null,2));
  if(checks.some(c=>!c.noOverflow||!c.family.includes('thmanyah')||c.loaded.length!==4||c.loaded.some(f=>f.status!=='loaded')))throw Error('FONT_QA_FAILED');
}
module.exports={capture};
