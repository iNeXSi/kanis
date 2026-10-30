import React,{useEffect,useState} from 'react';
import {MemoryStick,ShieldCheck} from 'lucide-react';
import {api,preview} from './api';

const mb=n=>`${Math.round(n/1024**2).toLocaleString('en-US')} MB`;
export function RammapPanel({t,busy,setBusy,Button,Modal,refresh}){
  const [status,setStatus]=useState(null),[error,setError]=useState(''),[confirm,setConfirm]=useState(false),[result,setResult]=useState(null);
  useEffect(()=>{let active=true;if(!preview)api.rammapStatus().then(s=>{if(active)setStatus(s);}).catch(()=>{if(active)setStatus({installed:false});});return()=>{active=false;};},[]);
  const explain=e=>({
    RAMMAP_MISSING:t('اختر ملف RAMMap64.exe من التنزيل الرسمي لإكمال التجهيز.','Choose RAMMap64.exe from the official download to finish setup.'),
    RAMMAP_UNTRUSTED:t('لم يجتز الملف التحقق. يُقبل RAMMap 1.63 الأصلي بتوقيع Microsoft الصالح فقط.','Verification failed. Only the original Microsoft-signed RAMMap 1.63 is accepted.'),
    RAMMAP_CANCELLED:t('أُلغيت موافقة المسؤول؛ لم يبدأ التقليل.','Administrator approval was cancelled; trimming did not start.'),
    RAMMAP_TIMEOUT:t('لم يصل تأكيد الانتهاء. تحقق من نافذة RAMMap أو طلب ويندوز قبل إعادة المحاولة.','Completion was not confirmed. Check RAMMap or the Windows prompt before retrying.'),
    MEMORY_COOLDOWN:t('انتظر دقيقة بين المحاولات.','Wait one minute between attempts.'),
    BUSY:t('انتظر انتهاء العملية الحالية.','Wait for the current operation.')
  }[e.message?.split(': ').pop()]||t('تعذّر تشغيل RAMMap. قد تكون موافقة المسؤول أو شروط الأداة لم تكتمل، أو منع ويندوز التشغيل.','RAMMap could not run. Administrator consent or its license prompt may be pending, or Windows may have blocked it.'));
  async function install(){
    setBusy('rammap');setError('');
    try{const s=await api.rammapInstall();if(!s.cancelled)setStatus(s);}catch(e){setError(explain(e));}finally{setBusy('');}
  }
  async function trim(){
    setConfirm(false);setBusy('rammap');setError('');setResult(null);
    try{setResult(await api.rammapTrim(true));await refresh();}catch(e){setError(explain(e));}finally{setBusy('');}
  }
  return <section className="panel rammap-panel">
    <div className="panel-title"><MemoryStick size={22}/><h2>{t('تقليل الرام يدويًا','Manually reduce RAM')}</h2><span className="status-chip">{t('يدوي فقط','Manual only')}</span></div>
    <p>{t('باستخدام RAMMap من Microsoft. يشمل البرامج المفتوحة والخلفية؛ لا يختار برامج بعينها ولا يغلقها. قد تعود الذاكرة مع الاستخدام ويحدث بطء مؤقت.','Uses Microsoft RAMMap. Includes open and background apps, without selecting or closing individual apps. Memory may return with use and apps may briefly slow down.')}</p>
    <div className="memory-scope"><ShieldCheck size={17}/><span>{t('التحقق من الملف قبل كل تشغيل · موافقة مسؤول من ويندوز · دون تغيير الحماية','File checked before every run · Windows administrator approval · Protection stays unchanged')}</span></div>
    {preview&&<p className="notice">{t('التجربة الفعلية متاحة في نسخة كانس لويندوز.','Available in the Kanis Windows app.')}</p>}
    {!preview&&status&&!status.installed&&<div className="notice warning"><p>{t('يلزم تجهيز نسخة Microsoft الأصلية مرة واحدة. نزّل RAMMap، فك ضغطه، ثم اختر RAMMap64.exe.','One-time setup: download Microsoft RAMMap, extract it, then choose RAMMap64.exe.')}</p><Button disabled={!!busy} onClick={()=>api.rammapDownload().catch(e=>setError(explain(e)))}>{t('صفحة Microsoft الرسمية','Official Microsoft page')}</Button> <Button disabled={!!busy} onClick={install}>{t('اختيار ملف RAMMap','Choose RAMMap file')}</Button></div>}
    {error&&<p className="notice warning" role="alert">{error}</p>}
    <div className="memory-actions"><Button variant="primary" icon={MemoryStick} disabled={preview||!!busy||!status?.installed} onClick={()=>setConfirm(true)}>{busy==='rammap'?t('بانتظار ويندوز أو اكتمال التقليل…','Waiting for Windows or completion…'):t('تقليل الرام الآن','Reduce RAM now')}</Button><span className="subtle">{t('تستطيع تنفيذ محاولة يدوية أيضًا.','You can also run a manual attempt.')}</span></div>
    {result&&<div className="memory-result" role="status"><h3>{t('اكتمل أمر RAMMap','RAMMap command completed')}</h3><div className="memory-before-after"><span>{t('المتاحة قبل','Available before')} <b dir="ltr">{mb(result.availableBefore)}</b></span><span>{t('المتاحة بعد','Available after')} <b dir="ltr">{mb(result.availableAfter)}</b></span></div><p>{t('هذه قراءة للجهاز كله، وتتأثر بنشاط البرامج. ليست ضمانًا لتوفير دائم أو لتسريع الجهاز.','These whole-device readings also reflect other app activity, not guaranteed lasting savings or improved speed.')}</p></div>}
    {confirm&&<Modal title={t('تقليل رام البرامج المفتوحة والخلفية','Trim open and background apps')} onClose={()=>setConfirm(false)}><div className="modal-content"><p>{t('سيطلب RAMMap تقليل الذاكرة المقيمة للبرامج. قد تتباطأ عند العودة إليها. هذا الإجراء لا يغلق البرامج ولا يحذف ملفاتها.','RAMMap will request trimming apps’ resident memory. Returning to them may be slower. This does not close apps or delete their files.')}</p><p>{t('سيظهر طلب صلاحية مسؤول من ويندوز باسم RAMMap وناشر Microsoft. في أول تشغيل قد تظهر شروط استخدام Microsoft؛ راجعها في نافذة الأداة.','Windows will request administrator approval for Microsoft RAMMap. On first use, review Microsoft’s license terms in the tool window if shown.')}</p></div><div className="modal-footer"><Button onClick={()=>setConfirm(false)}>{t('إلغاء','Cancel')}</Button><Button variant="primary" disabled={!!busy} onClick={trim}>{t('متابعة وطلب صلاحية المسؤول','Continue to administrator approval')}</Button></div></Modal>}
  </section>;
}
