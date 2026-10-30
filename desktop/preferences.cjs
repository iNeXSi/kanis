const defaults={lang:'ar',theme:'light',dhikr:false,sound:false,lowDisk:true,exclusions:[],homeDhikrAuto:true,homeDhikrSeconds:30,diskReports:true,reportMinutes:180,lowDiskGB:15,memoryRefreshSeconds:15,autoMemory:false,autoMemoryThreshold:85};
function normalizeSettings(value={}){
  if(!value||typeof value!=='object'||Array.isArray(value))value={};
  const next={...defaults,exclusions:[]};
  if(['ar','en'].includes(value.lang))next.lang=value.lang;
  if(['light','dark'].includes(value.theme))next.theme=value.theme;
  for(const key of ['dhikr','sound','lowDisk','homeDhikrAuto','diskReports','autoMemory'])if(typeof value[key]==='boolean')next[key]=value[key];
  if(Number.isInteger(value.autoMemoryThreshold)&&value.autoMemoryThreshold>=60&&value.autoMemoryThreshold<=95)next.autoMemoryThreshold=value.autoMemoryThreshold;
  for(const [key,values] of Object.entries({memoryRefreshSeconds:[5,15,30,60],homeDhikrSeconds:[15,30,60,120],reportMinutes:[60,180,360,720,1440],lowDiskGB:[10,15,25,50]}))if(values.includes(value[key]))next[key]=value[key];
  if(Array.isArray(value.exclusions))next.exclusions=[...new Set(value.exclusions.filter(x=>typeof x==='string'&&x.length<32768))].slice(0,200);
  return next;
}
module.exports={defaults,normalizeSettings};
