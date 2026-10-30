const GB=1024**3;
const validDrives=system=>(system.disks||[system.disk]).filter(d=>d&&d.ready!==false&&Number.isFinite(d.free)&&d.total>0);
function report(system,settings,low=false){
  const en=settings.lang==='en',disks=validDrives(system).sort((a,b)=>a.free-b.free);
  const relevant=low?disks.filter(d=>d.free<settings.lowDiskGB*GB):disks;
  const space=relevant.slice(0,3).map(d=>`${d.drive.replace(/\\/g,'')} ${(d.free/GB).toFixed(1)} GB`).join(' · ');
  const ram=system.memory?.total>0?Math.round(system.memory.used/system.memory.total*100):null;
  const advice=low?(en?'Review large files or open Windows Storage.':'راجع الملفات الكبيرة أو افتح تخزين ويندوز.'):(ram>=85?(en?'Memory is busy; review apps in Task Manager.':'الرام مرتفع؛ راجع التطبيقات في مدير المهام.'):(en?'Open Kanis for your drives and cleanup suggestions.':'افتح كانس لمراجعة الأقراص واقتراحات التنظيف.'));
  return {title:low?(en?'A drive is running low':'مساحة أحد الأقراص منخفضة'):(en?'Your periodic space report':'تقرير المساحة الدوري'),body:`${space}${en?' free':' متاحة'}${ram==null?'':` · RAM ${ram}%`}. ${advice}`,page:'overview'};
}
function planReport(system,settings,state={},now=Date.now()){
  if(state.retryAt>now)return null;
  const low=validDrives(system).filter(d=>d.free<settings.lowDiskGB*GB);
  const dueLow=low.filter(d=>!state.lowAt?.[d.drive]||now-state.lowAt[d.drive]>=6*3600000);
  if(settings.lowDisk&&dueLow.length)return {...report(system,settings,true),state:{...state,lastReport:now,lowAt:{...state.lowAt,...Object.fromEntries(low.map(d=>[d.drive,now]))},retryAt:0}};
  if(settings.diskReports&&validDrives(system).length&&(!state.lastReport||now-state.lastReport>=settings.reportMinutes*60000))return {...report(system,settings),state:{...state,lastReport:now,retryAt:0}};
  return null;
}
module.exports={planReport,report,validDrives};
