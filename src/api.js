const GB=1024**3, MB=1024**2;
export const preview=!window.kanis;
let preferences={autoMemory:false,autoMemoryThreshold:85,memoryRefreshSeconds:15,startWithWindows:false,lang:'ar',theme:'light',dhikr:false,sound:false,lowDisk:true,exclusions:[],homeDhikrAuto:true,homeDhikrSeconds:30,diskReports:true,reportMinutes:180,lowDiskGB:15};
const demoCategories=[
  {id:'temp',ar:'الملفات المؤقتة',en:'Temporary files',desc:'ملفات لم تتغير منذ 24 ساعة',icon:'files',safe:true,bytes:1.24*GB},
  {id:'crash',ar:'تقارير الأعطال',en:'Crash reports',desc:'تقارير قديمة لتشخيص الأعطال',icon:'report',safe:true,bytes:86*MB},
  {id:'chrome',ar:'كاش Google Chrome',en:'Google Chrome cache',desc:'الكاش فقط، دون كلمات المرور أو السجل',icon:'globe',blocked:true,bytes:678*MB},
  {id:'edge',ar:'كاش Microsoft Edge',en:'Microsoft Edge cache',desc:'أغلق المتصفح قبل تنظيفه',icon:'globe',bytes:320*MB},
  {id:'npm',ar:'كاش npm',en:'npm cache',desc:'قد يلزم تنزيل الحزم مجددًا',icon:'code',bytes:2.15*GB},
  {id:'shader',ar:'كاش الرسوميات',en:'Graphics cache',desc:'سيعيد ويندوز إنشاءه عند الحاجة',icon:'chip',bytes:160*MB}
].map(c=>({...c,errors:[],roots:['C:\\Preview\\'+c.id],files:Array.from({length:4},(_,i)=>({id:c.id+i,path:`C:\\Preview\\${c.id}\\sample-${i+1}.cache`,name:`sample-${i+1}.cache`,size:Math.round(c.bytes/4)}))}));
const demo={
  rammapStatus:async()=>({installed:false}),rammapInstall:async()=>{throw Error('PREVIEW_ONLY');},rammapDownload:async()=>{throw Error('PREVIEW_ONLY');},rammapTrim:async()=>{throw Error('PREVIEW_ONLY');},
  memoryProcesses:async()=>{throw Error('PREVIEW_ONLY');},trimMemory:async()=>{throw Error('PREVIEW_ONLY');},
  system:async()=>({disk:{total:512*GB,free:186.4*GB,used:325.6*GB,drive:'C:\\'},disks:[{total:512*GB,free:186.4*GB,used:325.6*GB,drive:'C:\\',ready:true,type:'Fixed',label:'Windows'},{total:1000*GB,free:612*GB,used:388*GB,drive:'D:\\',ready:true,type:'Fixed',label:'Data'}],memory:{total:16*GB,used:7.2*GB,free:8.8*GB},host:'KANIS-PREVIEW',platform:'Windows',cpus:8}),
  settings:async()=>preferences,saveSettings:async patch=>(preferences={...preferences,...patch}),
  scan:async()=>({id:'preview',createdAt:Date.now(),categories:demoCategories}),
  cancel:async()=>{},clean:async()=>{throw new Error('PREVIEW_ONLY');},
  history:async()=>[],large:async()=>({root:'C:\\Preview',files:[{id:'large1',name:'project-archive.zip',path:'C:\\Preview\\project-archive.zip',size:1.8*GB},{id:'large2',name:'recording.mp4',path:'C:\\Preview\\recording.mp4',size:840*MB}],errors:[],partial:false}),
  reveal:async()=>{throw new Error('PREVIEW_ONLY');},addExclusion:async()=>{throw new Error('PREVIEW_ONLY');},removeExclusion:async()=>preferences,
  setStartup:async()=>{throw new Error('PREVIEW_ONLY');},onNavigate:()=>()=>{},adminScan:async()=>{throw new Error('PREVIEW_ONLY');},systemTool:async()=>{throw new Error('PREVIEW_ONLY');},testNotification:async()=>{throw new Error('PREVIEW_ONLY');},diskMap:async()=>({root:'C:\\Preview',count:210,bytes:48*GB,groups:[{id:'Apps',name:'Apps',bytes:25*GB,count:100},{id:'Users',name:'Users',bytes:15*GB,count:90},{id:'Data',name:'Data',bytes:8*GB,count:20}],types:[{id:'.zip',name:'.zip',bytes:30*GB,count:20},{id:'.mp4',name:'.mp4',bytes:18*GB,count:190}],largest:[],partial:false,errors:[]}),
  onProgress:()=>()=>{},minimize:async()=>{},close:async()=>{},quit:async()=>{}
};
export const api=window.kanis||demo;
