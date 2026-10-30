import React,{useState} from 'react';
import {SlidersHorizontal} from 'lucide-react';
export function AutoMemory({prefs,save,status,t,refresh}){
  const [saving,setSaving]=useState(false);
  async function change(patch){setSaving(true);try{await save(patch);await refresh();}finally{setSaving(false);}}
  const enabled=!!prefs.autoMemory,last=status?.lastResult;
  const unavailable=enabled&&status?.taskReady===false;
  const phase=unavailable?'unavailable':!enabled?'off':status?.phase||'watching';
  const phases={
    off:t('متوقف','Off'),
    unavailable:t('يلزم تجهيز تشغيل RAMMap التلقائي','RAMMap automatic execution needs setup'),
    watching:t('يراقب استخدام الرام','Watching RAM use'),
    confirming:t('يتأكد من استمرار الارتفاع','Confirming sustained high usage'),
    cooldown:t('ينتظر انتهاء الفاصل بين المحاولات','Waiting for the attempt interval'),
    running:t('جارٍ تقليل الرام باستخدام Microsoft…','Trimming RAM with Microsoft RAMMap…')
  };
  const outcome=last?({
    completed:last.scope==='all-working-sets'?t('اكتمل أمر RAMMap للبرامج المفتوحة والخلفية.','RAMMap completed for open and background apps.'):t(`عولجت ${last.trimmed||0} عمليات؛ تم تخطي ${last.skipped||0}.`,`Processed ${last.trimmed||0}; skipped ${last.skipped||0}.`),
    'no-targets':t('لا توجد عمليات خلفية متاحة للتقليل.','No eligible background processes.'),
    cancelled:t('أُلغيت المحاولة أو لم تعد شروطها متحققة.','Cancelled or conditions no longer met.'),
    interrupted:t('انقطع التطبيق قبل اكتمال تسجيل النتيجة.','The app stopped before recording the result.'),
    failed:t('تعذّرت المحاولة؛ ستُراجع الشروط بعد انتهاء الفاصل.','Attempt failed; conditions will be checked after the interval.')
  }[last.outcome]||t('النتيجة غير متاحة.','Result unavailable.')):null;
  return <section className="panel memory-auto">
    <div className="panel-title"><SlidersHorizontal size={20}/><h2>{t('التقليل التلقائي عند ارتفاع الرام','Automatic trim when RAM is high')}</h2><span className={`status-chip ${enabled&&!unavailable?'green':''}`}>{unavailable?t('يحتاج تجهيزًا','Setup needed'):enabled?t('مفعّل','On'):t('متوقف','Off')}</span></div>
    {unavailable&&<p className="notice warning" role="alert">{t('تعذّر الوصول إلى المهمة الموثوقة؛ لن تُنفذ محاولات تلقائية حتى إعادة التجهيز.','The trusted task is unavailable; automatic attempts are paused until setup is repaired.')} <button disabled={saving} onClick={()=>change({autoMemory:true})}>{t('إعادة التجهيز','Repair setup')}</button></p>}
    <label className="setting-row"><span><strong>{t('تشغيل تقليل الرام تلقائيًا','Automatically reduce RAM')}</strong><small>{t('عبر RAMMap من Microsoft، ويعمل أثناء بقاء كانس في شريط النظام.','Uses Microsoft RAMMap, including while Kanis stays in the system tray.')}</small></span><input className="switch" type="checkbox" role="switch" checked={enabled} disabled={saving} onChange={e=>change({autoMemory:e.target.checked})}/></label>
    <label className="setting-row"><span><strong>{t('عندما يصل استخدام الرام إلى','When RAM usage reaches')}</strong><small>{t('اختر الحد المناسب لجهازك، بين 60% و95%.','Choose a threshold between 60% and 95%.')}</small></span><select aria-label={t('نسبة تشغيل التقليل التلقائي','Automatic trim threshold')} value={prefs.autoMemoryThreshold||85} disabled={saving} onChange={e=>change({autoMemoryThreshold:Number(e.target.value)})}>{Array.from({length:36},(_,i)=>i+60).map(n=><option key={n} value={n}>{n}%</option>)}</select></label>
    <p className="subtle">{t('فحص كل دقيقة، وتنفيذ بعد قراءتين متتاليتين عند الحد أو أعلى، بفاصل 10 دقائق على الأقل. يشمل البرامج المفتوحة والخلفية دون إغلاقها؛ قد تعود الذاكرة ويحدث بطء مؤقت. الإيقاف يمنع المحاولات التالية، ولا يتراجع عن أمر بدأ بالفعل.','Checks every minute; runs after two readings at or above the threshold, at least 10 minutes apart. Includes open and background apps without closing them; memory may return and apps may briefly slow down. Turning this off prevents future attempts but cannot undo a command already started.')}</p>
    {!status?.taskReady&&<p className="subtle">{t('أول تفعيل يحتاج موافقة مسؤول واحدة لتجهيز مهمة Windows محددة لملف Microsoft. لا يغيّر حماية ويندوز.','First activation needs one administrator approval to prepare a Windows task restricted to the Microsoft executable. Windows protection stays unchanged.')}</p>}
    <div className="memory-auto-status" role="status"><strong>{phases[phase]}</strong>{enabled&&phase==='cooldown'&&status?.nextEligibleAt>0&&<small>{t('أقرب محاولة ممكنة','Next possible attempt')} · {new Date(status.nextEligibleAt).toLocaleTimeString(prefs.lang==='en'?'en-GB':'ar-SA',{hour:'2-digit',minute:'2-digit'})}</small>}{last&&<p>{t('آخر محاولة','Last attempt')} · {new Date(last.at).toLocaleString(prefs.lang==='en'?'en-GB':'ar-SA',{dateStyle:'short',timeStyle:'short',calendar:'gregory'})}<br/>{outcome}</p>}</div>
  </section>;
}
