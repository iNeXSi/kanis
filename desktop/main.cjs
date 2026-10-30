const {app,BrowserWindow,ipcMain,dialog,shell,Tray,Menu,nativeImage,globalShortcut,Notification}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {Cleaner,walk,systemInfo,within}=require('./engine.cjs');
const {normalizeSettings}=require('./preferences.cjs');
const {planReport,report}=require('./health.cjs');
const {summarize}=require('./disk-map.cjs');
const {runAdminScan}=require('./admin.cjs');
const {openTaskManager}=require('./windows.cjs');
const {createStartup}=require('./startup.cjs');
const {createMemoryControl}=require('./memory.cjs');
const {createAutoMemory}=require('./memory-auto.cjs');
const {createMemoryMonitor}=require('./memory-monitor.cjs');
const {createRammap}=require('./rammap.cjs');
const {createRammapTask}=require('./rammap-task.cjs');
const memoryControl=createMemoryControl();
let autoMemory;
const readMemory=()=>{const total=os.totalmem(),free=os.freemem();return {total,free,used:total-free};};
const isQA=process.argv.includes('--qa');
const backgroundLaunch=process.argv.includes('--background');
const startup=createStartup(app,process.execPath);
const qaRoot=process.env.KANIS_QA_DIR || path.join(__dirname,'..','qa');
if(isQA) app.setPath('userData',path.join(qaRoot,'userData'));
app.setName('Kanis');app.setAppUserModelId('com.kanis.desktop');
const rammapFile=path.join(app.getPath('userData'),'tools','RAMMap64.exe');
const rammapTask=createRammapTask({sourceFile:rammapFile});
const rammap=createRammap({file:rammapFile,automatic:rammapTask});
const toastCLSID='76c38268-82ed-45f1-83a4-2a8879c692bf';
if(!isQA&&app.setToastActivatorCLSID)app.setToastActivatorCLSID(toastCLSID);
let win,tray,quitting=false,largeController,cleanPrompt=false,navigationReady=false,pendingPage=process.argv.includes('--memory')?'memory':null;
let settings=normalizeSettings();
async function viewSettings(){try{return {...settings,startWithWindows:isQA?false:await startup.enabled(),startupError:false};}catch{return {...settings,startWithWindows:false,startupError:true};}}
let records=[],revealed=new Set(),lastDhikr=0,healthState={},heartbeatBusy=false,adminBusy=false;
const notices=new Set();
const cleaner=new Cleaner({trash:file=>shell.trashItem(file)});
const dataPath=name=>path.join(app.getPath('userData'),name+'.json');
const effectiveExclusions=()=>[...settings.exclusions,app.getAppPath(),app.getPath('userData'),path.dirname(app.getPath('exe'))];
let writes=Promise.resolve();
function persist(name,data){const serialized=JSON.stringify(data,null,2);const job=writes.then(async()=>{await fs.mkdir(app.getPath('userData'),{recursive:true});const file=dataPath(name),temp=file+'.tmp';await fs.writeFile(temp,serialized,'utf8');await fs.rename(temp,file);});writes=job.catch(()=>{});return job;}
async function read(name,fallback){try{return JSON.parse(await fs.readFile(dataPath(name),'utf8'));}catch{return fallback;}}
const progress=data=>{if(win&&!win.isDestroyed())win.webContents.send('progress',data);};
function show(page){if(typeof page==='string')pendingPage=page;if(!win||win.isDestroyed())createWindow();win.show();win.restore();win.focus();if(navigationReady&&pendingPage){win.webContents.send('navigate',pendingPage);pendingPage=null;}}
function sendNotice(data){return new Promise(resolve=>{
  if(isQA||!Notification.isSupported())return resolve(false);
  const notice=new Notification({title:data.title,body:data.body,silent:!settings.sound});notices.add(notice);
  let finished=false;const finish=ok=>{if(finished)return;finished=true;clearTimeout(timer);resolve(ok);};
  const timer=setTimeout(()=>{notices.delete(notice);finish(false);},8000);
  notice.once('show',()=>finish(true));notice.once('failed',()=>{notices.delete(notice);finish(false);});notice.once('close',()=>notices.delete(notice));
  notice.on('click',()=>show(data.page||'overview'));
  try{notice.show();}catch{notices.delete(notice);finish(false);}
});}
async function testSpaceNotice(){
  const data=report(await systemInfo(),settings);
  data.title=settings.lang==='en'?'Test space report · Kanis':'تنبيه مساحة تجريبي · كانس';
  const windowHidden=!win||win.isDestroyed()||!win.isVisible(),trayActive=!!tray&&!tray.isDestroyed();
  const delivered=await sendNotice(data);
  await persist('notification-test',{at:new Date().toISOString(),delivered,windowHidden,trayActive,title:data.title,body:data.body});
  if(!delivered)throw Error('NOTIFICATION_FAILED');
  return true;
}
function createWindow(){
  navigationReady=false;
  win=new BrowserWindow({width:1220,height:850,minWidth:780,minHeight:620,show:false,frame:false,backgroundColor:'#f5f7fa',title:'كانس',icon:path.join(__dirname,'../assets/icon.png'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),backgroundThrottling:!isQA,offscreen:isQA,contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,devTools:!app.isPackaged}});
  win.loadFile(path.join(__dirname,'../dist/index.html'));
  win.once('ready-to-show',()=>{if(!isQA&&!backgroundLaunch)win.show();});
  win.on('close',event=>{if(!quitting){event.preventDefault();win.hide();}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',event=>event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_,__,callback)=>callback(false));
  win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(_,callback)=>callback({cancel:true}));
}
function handle(name,fn){ipcMain.handle(name,async(event,...args)=>{
  const trusted=pathToFileURL(path.join(__dirname,'../dist/index.html')).href;
  if(event.sender!==win?.webContents||event.senderFrame!==win.webContents.mainFrame||event.senderFrame.url.split('?')[0]!==trusted)throw new Error('UNTRUSTED_SENDER');
  return fn(...args);
});}
function setupHandlers(){
  handle('navigation-ready',()=>{navigationReady=true;if(pendingPage){win.webContents.send('navigate',pendingPage);pendingPage=null;}return true;});
  handle('system',async()=>({...await systemInfo(),memoryAuto:{...autoMemory?.status(),taskReady:rammapTask.ready,provider:'rammap'}}));
  handle('memory-processes',()=>memoryControl.list());
  handle('rammap-status',()=>rammap.status());
  handle('rammap-download',async()=>{if(isQA)throw Error('QA_READ_ONLY');await shell.openExternal('https://learn.microsoft.com/en-us/sysinternals/downloads/rammap');return true;});
  handle('rammap-install',async()=>{
    if(isQA)throw Error('QA_READ_ONLY');
    if(cleaner.busy||largeController||cleanPrompt||adminBusy||memoryControl.busy||rammap.busy)throw Error('BUSY');
    adminBusy=true;
    try{
      const choice=await dialog.showOpenDialog(win,{title:settings.lang==='en'?'Choose Microsoft RAMMap64.exe':'اختر RAMMap64.exe الأصلي من Microsoft',properties:['openFile'],filters:[{name:'RAMMap64',extensions:['exe']}]});
      if(choice.canceled)return {cancelled:true};
      return await rammap.install(choice.filePaths[0]);
    }finally{adminBusy=false;}
  });
  handle('rammap-trim',async ack=>{
    if(isQA)throw Error('QA_READ_ONLY');
    if(cleaner.busy||largeController||cleanPrompt||adminBusy||memoryControl.busy||rammap.busy)throw Error('BUSY');
    adminBusy=true;
    try{return await rammap.trim(ack);}finally{adminBusy=false;}
  });
  handle('trim-memory',async ids=>{if(isQA)throw Error('QA_READ_ONLY');if(cleaner.busy||largeController||cleanPrompt||adminBusy||memoryControl.busy||rammap.busy)throw Error('BUSY');return memoryControl.trim(ids);});
  handle('disk-map',async drive=>{
    if(cleaner.busy||largeController||cleanPrompt||adminBusy||memoryControl.busy||rammap.busy)throw new Error('BUSY');
    let defaultPath=app.getPath('home');
    if(drive){const info=await systemInfo();if(!info.disks.some(d=>d.ready&&d.drive===drive))throw new Error('INVALID_DRIVE');defaultPath=drive;}
    const choice=await dialog.showOpenDialog(win,{title:settings.lang==='en'?'Choose drive or folder to map':'اختر القرص أو المجلد لرسم خريطته',defaultPath,properties:['openDirectory']});
    if(choice.canceled)return {cancelled:true};
    const root=choice.filePaths[0];largeController=new AbortController();
    try{const result=await walk(root,{limit:100000,exclusions:effectiveExclusions(),signal:largeController.signal,onProgress:p=>progress({kind:'map',...p})});result.files.forEach(f=>revealed.add(f.path));const summary=summarize(root,result.files);return {...summary,root,partial:result.partial,errors:result.errors,at:Date.now()};}finally{largeController=null;}
  });
  handle('admin-scan',async()=>{if(isQA)throw new Error('QA_READ_ONLY');if(adminBusy||cleaner.busy||largeController||cleanPrompt||memoryControl.busy||rammap.busy)throw new Error('BUSY');adminBusy=true;try{return await runAdminScan();}finally{adminBusy=false;}});
  handle('system-tool',async name=>{if(isQA)throw new Error('QA_READ_ONLY');if(name==='storage'){await shell.openExternal('ms-settings:storagesense');return true;}if(name==='task-manager'){await openTaskManager();return true;}throw new Error('INVALID_TOOL');});
  handle('test-notification',testSpaceNotice);
  handle('scan',async()=>{if(cleanPrompt||largeController||adminBusy||memoryControl.busy||rammap.busy)throw new Error('BUSY');const result=await cleaner.scan(effectiveExclusions(),p=>progress({kind:'scan',...p}));revealed=new Set(result.categories.flatMap(c=>c.files.map(f=>f.path)));return result;});
  handle('cancel',()=>{cleaner.cancel();largeController?.abort();});
  handle('clean',async request=>{
    if(isQA)throw new Error('QA_READ_ONLY');
    if(cleanPrompt||cleaner.busy||largeController||adminBusy||memoryControl.busy||rammap.busy)throw new Error('BUSY');
    if(!request||!['trash','permanent'].includes(request.mode)||!Array.isArray(request.ids)||!request.ids.length)throw new Error('INVALID_SELECTION');
    const snapshot=cleaner.snapshot;
    if(!snapshot||snapshot.id!==request.scanId)throw new Error('SCAN_EXPIRED');
    const files=snapshot.categories.flatMap(c=>c.files).filter(f=>request.ids.includes(f.id));
    if(files.length!==new Set(request.ids).size)throw new Error('INVALID_SELECTION');
    const permanent=request.mode==='permanent',en=settings.lang==='en';
    cleanPrompt=true;
    try{
      const answer=await dialog.showMessageBox(win,{type:'warning',title:en?'Confirm cleanup':'تأكيد التنظيف',message:permanent?(en?'Permanently delete the selected files?':'حذف الملفات المحددة نهائيًا؟'):(en?'Move selected files to Recycle Bin?':'نقل الملفات المحددة إلى سلة المحذوفات؟'),detail:(en?`${files.length} files. `:`${files.length} ملف. `)+(permanent?(en?'This action cannot be undone.':'لا يمكن التراجع عن الحذف النهائي.'):(en?'You can restore them from Recycle Bin. Moving files does not free disk space.':'يمكنك استعادتها من السلة. النقل إلى السلة لا يحرر مساحة القرص.')),buttons:en?['Cancel',permanent?'Delete permanently':'Move to Recycle Bin']:['إلغاء',permanent?'حذف نهائي':'نقل إلى السلة'],defaultId:0,cancelId:0,noLink:true});
      if(answer.response!==1)return {cancelled:true};
      const result=await cleaner.clean({...request,exclusions:effectiveExclusions()},p=>progress({kind:'clean',...p}));
      records.unshift(result);records=records.slice(0,100);
      try{await persist('history',records);}catch{result.historyWarning=true;}
      return result;
    }finally{cleanPrompt=false;}
  });
  handle('large',async()=>{
    if(cleaner.busy||largeController||cleanPrompt||adminBusy||memoryControl.busy||rammap.busy)throw new Error('BUSY');
    const choice=await dialog.showOpenDialog(win,{title:settings.lang==='en'?'Choose a folder to inspect':'اختر مجلدًا لفحص الملفات الكبيرة',properties:['openDirectory'],defaultPath:app.getPath('downloads')});
    if(choice.canceled)return {cancelled:true};
    const root=choice.filePaths[0];largeController=new AbortController();
    try{const result=await walk(root,{minSize:100*1024*1024,limit:100000,exclusions:settings.exclusions,signal:largeController.signal,onProgress:p=>progress({kind:'large',...p})});result.files.sort((a,b)=>b.size-a.size);result.files.forEach(f=>revealed.add(f.path));return {...result,root};}finally{largeController=null;}
  });
  handle('reveal',async file=>{if(typeof file!=='string'||!revealed.has(file))throw new Error('INVALID_FILE');await fs.lstat(file);shell.showItemInFolder(file);return true;});
  handle('history',()=>records);
  handle('settings',viewSettings);
  handle('set-startup',async enabled=>{if(isQA)throw Error('QA_READ_ONLY');await startup.set(enabled);return viewSettings();});
  handle('save-settings',async value=>{
    const next=normalizeSettings({...settings,...value,exclusions:settings.exclusions});
    if(next.autoMemory&&(!settings.autoMemory||!rammapTask.ready)&&!isQA){
      if(adminBusy||rammap.busy||memoryControl.busy||cleaner.busy||largeController||cleanPrompt)throw Error('BUSY');
      adminBusy=true;try{await rammapTask.prepare();}finally{adminBusy=false;}
    }
    const previous=settings;await persist('settings',next);settings=next;
    if(previous.autoMemory!==next.autoMemory||previous.autoMemoryThreshold!==next.autoMemoryThreshold)autoMemory?.cancel();
    return viewSettings();
  });
  handle('add-exclusion',async()=>{
    if(cleaner.busy||cleanPrompt)throw new Error('BUSY');
    const choice=await dialog.showOpenDialog(win,{properties:['openDirectory'],title:settings.lang==='en'?'Protect a folder':'إضافة مجلد إلى الاستثناءات'});
    if(!choice.canceled&&!settings.exclusions.includes(choice.filePaths[0])){const next={...settings,exclusions:[...settings.exclusions,choice.filePaths[0]]};await persist('settings',next);settings=next;}
    return viewSettings();
  });
  handle('remove-exclusion',async target=>{if(cleaner.busy||cleanPrompt)throw new Error('BUSY');const next={...settings,exclusions:settings.exclusions.filter(x=>x!==target)};await persist('settings',next);settings=next;return viewSettings();});
  handle('minimize',()=>win.minimize());handle('close',()=>win.close());handle('quit',()=>{if(cleaner.busy||cleanPrompt||adminBusy||largeController||memoryControl.busy||rammap.busy)throw new Error('BUSY');quitting=true;app.quit();});
}
async function heartbeat(){
  if(isQA||heartbeatBusy)return;heartbeatBusy=true;
  try{
    const system=await systemInfo();const free=(system.disk.free/1024**3).toFixed(1);
    tray?.setToolTip(`كانس · ${free} GB ${settings.lang==='en'?'free':'متاحة'}`);
    const planned=planReport(system,settings,healthState);
    if(planned){const delivered=await sendNotice(planned);healthState=delivered?planned.state:{...healthState,retryAt:Date.now()+3600000};await persist('health-state',healthState);}
    if(settings.dhikr&&Date.now()-lastDhikr>=3600000){lastDhikr=Date.now();const hour=new Date().getHours();const phrase=hour<12?'سبحان الله وبحمده':hour<20?'لا حول ولا قوة إلا بالله':'باسمك اللهم أموت وأحيا';await sendNotice({title:settings.lang==='en'?'A quiet moment · Kanis':'لحظة ذكر · كانس',body:phrase,page:'dhikr'});}
  }catch{/* A failed metric must not interrupt the tray app. */}finally{heartbeatBusy=false;}
}
if(!app.requestSingleInstanceLock()){app.quit();}else{
app.on('second-instance',(_,argv)=>{if(argv.includes('--test-notification')){testSpaceNotice().catch(()=>{});return;}if(!argv.includes('--background'))show(argv.includes('--memory')?'memory':undefined);});
app.whenReady().then(async()=>{
  settings=normalizeSettings(await read('settings',{}));
  await rammapTask.inspect();
  if(!isQA&&process.argv.includes('--enable-memory-auto')){try{await rammapTask.prepare();settings={...settings,autoMemory:true,autoMemoryThreshold:85};await persist('settings',settings);}catch{dialog.showErrorBox('كانس','تعذّر تجهيز التقليل التلقائي. أعد التفعيل من صفحة الذاكرة وأكمل موافقة المسؤول.');}}
  autoMemory=createAutoMemory({control:rammap,getSettings:()=>settings,readMemory,canRun:()=>!isQA&&!quitting&&rammapTask.ready&&!memoryControl.busy&&!cleaner.busy&&!largeController&&!cleanPrompt&&!adminBusy,save:state=>persist('memory-auto-rammap',state),initial:await read('memory-auto-rammap',{})});
  if(!isQA&&process.argv.includes('--enable-startup')){try{await startup.set(true);}catch{dialog.showErrorBox('كانس','تعذّر تفعيل التشغيل مع ويندوز. أعد المحاولة من تبويب التنبيهات والوصول.');}}
  healthState=await read('health-state',{});if(!healthState||typeof healthState!=='object')healthState={};
  if(!isQA){try{const shortcut=path.join(app.getPath('appData'),'Microsoft','Windows','Start Menu','Programs','Kanis.lnk');shell.writeShortcutLink(shortcut,'create',{target:process.execPath,cwd:path.dirname(process.execPath),description:'كانس — مراقبة المساحة والعناية بالجهاز',appUserModelId:'com.kanis.desktop',toastActivatorClsid:toastCLSID,icon:process.execPath,iconIndex:0});}catch{/* Windows may block shortcut registration. The test notification reports delivery failure. */}}
  records=await read('history',[]);if(!Array.isArray(records))records=[];
  setupHandlers();if(!backgroundLaunch)createWindow();
  tray=new Tray(nativeImage.createFromPath(path.join(__dirname,'../assets/icon.png')).resize({width:32,height:32}));
  tray.setContextMenu(Menu.buildFromTemplate([{label:'فتح كانس / Open Kanis',click:show},{type:'separator'},{label:'إنهاء / Quit',click:()=>{if(!cleaner.busy&&!cleanPrompt&&!adminBusy&&!largeController&&!memoryControl.busy&&!rammap.busy){quitting=true;app.quit();}}}]));tray.on('double-click',show);
  if(!isQA)await persist('startup-state',{at:new Date().toISOString(),version:app.getVersion(),processId:process.pid,backgroundLaunch,trayActive:!tray.isDestroyed()});
  if(!isQA)globalShortcut.register('Control+Shift+N',show);
  if(!isQA){const tick=createMemoryMonitor({getSettings:()=>settings,task:rammapTask,controller:autoMemory,stopping:()=>quitting});void tick().catch(()=>{});setInterval(()=>void tick().catch(()=>{}),60000).unref();}
  if(!isQA&&process.argv.includes('--test-notification'))await testSpaceNotice().catch(()=>{});else await heartbeat();
  setInterval(heartbeat,60000).unref();
  if(isQA){const runQA=async()=>{try{
    if(process.argv.includes('--qa-startup')){
      await new Promise(r=>setTimeout(r,1500));await fs.mkdir(qaRoot,{recursive:true});
      const hiddenAtLaunch=!win;const trayReady=!!tray&&!tray.isDestroyed();
      app.emit('second-instance',{},[process.execPath,'--background']);const hiddenAfterDuplicate=!win;
      app.emit('second-instance',{},[process.execPath]);const opensManually=win.isVisible();
      win.close();const closeReturnsToTray=!win.isVisible()&&!win.isDestroyed();
      const checks={backgroundLaunch,hiddenAtLaunch,trayReady,hiddenAfterDuplicate,opensManually,closeReturnsToTray};
      await fs.writeFile(path.join(qaRoot,'startup-check.json'),JSON.stringify(checks,null,2));
      if(Object.values(checks).some(value=>value!==true))throw Error('STARTUP_QA_FAILED');
    }else if(process.argv.includes('--qa-release'))await require('./qa-release.cjs').capture(win,qaRoot,{cleaner,dialog});
    else if(process.argv.includes('--qa-rammap'))await require('./qa-rammap.cjs').capture(win,qaRoot);
    else if(process.argv.includes('--qa-auto-memory'))await require('./qa-auto-memory.cjs').capture(win,qaRoot);

    else if(process.argv.includes('--qa-memory'))await require('./qa-memory.cjs').capture(win,qaRoot);
    else await require('./qa.cjs').capture(win,qaRoot);
  }catch(e){await fs.mkdir(qaRoot,{recursive:true});await fs.writeFile(path.join(qaRoot,'error.txt'),String(e));}finally{quitting=true;app.quit();}};if(win?.webContents.isLoading())win.webContents.once('did-finish-load',runQA);else await runQA();}
});
app.on('window-all-closed',()=>{});
app.on('before-quit',()=>{quitting=true;autoMemory?.cancel();cleaner.cancel();largeController?.abort();});
app.on('will-quit',()=>globalShortcut.unregisterAll());
}
