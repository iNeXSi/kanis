const {contextBridge,ipcRenderer}=require('electron');
const call=(channel)=>(...args)=>ipcRenderer.invoke(channel,...args);
contextBridge.exposeInMainWorld('kanis',{
  system:call('system'),scan:call('scan'),cancel:call('cancel'),clean:call('clean'),
  memoryProcesses:call('memory-processes'),trimMemory:call('trim-memory'),
  rammapStatus:call('rammap-status'),rammapInstall:call('rammap-install'),rammapDownload:call('rammap-download'),rammapTrim:call('rammap-trim'),
  diskMap:call('disk-map'),adminScan:call('admin-scan'),systemTool:call('system-tool'),testNotification:call('test-notification'),
  onNavigate:callback=>{const handler=(_,data)=>callback(data);ipcRenderer.on('navigate',handler);ipcRenderer.invoke('navigation-ready').catch(()=>{});return()=>ipcRenderer.removeListener('navigate',handler);},
  large:call('large'),reveal:call('reveal'),history:call('history'),settings:call('settings'),
  saveSettings:call('save-settings'),addExclusion:call('add-exclusion'),removeExclusion:call('remove-exclusion'),
  setStartup:call('set-startup'),
  minimize:call('minimize'),close:call('close'),quit:call('quit'),
  onProgress:callback=>{const handler=(_,data)=>callback(data);ipcRenderer.on('progress',handler);return()=>ipcRenderer.removeListener('progress',handler);}
});
