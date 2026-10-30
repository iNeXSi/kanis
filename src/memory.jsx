import React,{useState,useEffect} from 'react';
import {MemoryStick,RefreshCw,SlidersHorizontal,ShieldCheck,LoaderCircle} from 'lucide-react';
import {api,preview} from './api';
import './memory.css';
import {AutoMemory} from './memory-auto';
import {RammapPanel} from './rammap';

const bytes=value=>value==null?'—':`${(value/1024**2).toLocaleString('en-US',{maximumFractionDigits:0})} MB`;
export function MemoryPanel({system,points,prefs,save,t,refresh,busy,setBusy,Button,Modal}){
  const [list,setList]=useState(null),[selected,setSelected]=useState(new Set()),[loading,setLoading]=useState(false);
  const [error,setError]=useState(''),[confirm,setConfirm]=useState(false),[result,setResult]=useState(null);
  const [filter,setFilter]=useState('all');
  const percent=system?Math.round(system.memory.used/system.memory.total*100):0;
  const seconds=prefs.memoryRefreshSeconds||15;
  const message=e=>({
    MEMORY_HELPER_UNAVAILABLE:t('تعذّر تشغيل مساعد الرام. قد تمنعه حماية التطبيقات في ويندوز؛ يلزم إصدار معتمد للعمل تحت هذه السياسة.','The memory helper could not start. Windows application control may block it; an approved build is needed under that policy.'),
    MEMORY_EXPIRED:t('القراءة أقدم من دقيقتين. حدّث القائمة ثم اختر البرامج مجددًا.','This reading is over two minutes old. Refresh and select apps again.'),
    MEMORY_COOLDOWN:t('انتظر دقيقة بين كل محاولة وأخرى.','Wait one minute between attempts.'),
    BUSY:t('انتظر انتهاء العملية الحالية.','Wait for the current operation.'),
    PREVIEW_ONLY:t('قائمة البرامج والتحكم بالرام متاحان في نسخة ويندوز.','Process controls are available in the Windows app.')
  }[e.message?.split(': ').pop()]||t('تعذّرت العملية. حدّث القائمة وأعد المحاولة؛ قد يكون البرنامج مغلقًا أو محميًا.','Could not complete the action. Refresh and retry; the process may be closed or protected.'));
  async function load(){
    setLoading(true);setError('');setSelected(new Set());
    try{setList(await api.memoryProcesses());}catch(e){setError(message(e));}finally{setLoading(false);}
  }
  useEffect(()=>{if(!preview)load();},[]);
  const chosen=list?.processes.filter(p=>selected.has(p.id))||[];
  const background=(list?.processes||[]).filter(p=>p.hasVisibleWindow===false).sort((a,b)=>b.bytes-a.bytes);
  const displayed=filter==='background'?background:(list?.processes||[]);
  function reviewBackground(){
    setError('');setFilter('background');
    setSelected(new Set(background.slice(0,10).map(p=>p.id)));
    setConfirm(true);
  }
  async function trim(){
    setConfirm(false);setBusy('memory');setError('');setResult(null);
    const names=new Map(chosen.map(p=>[p.pid,p.name]));
    try{
      const response=await api.trimMemory([...selected]);
      setResult({...response,rows:response.rows.map(r=>({...r,name:names.get(r.pid)}))});
      setSelected(new Set());setList(null);await refresh();
    }catch(e){setError(message(e));}finally{setBusy('');}
  }
  return <div className="memory-workspace">
    <AutoMemory prefs={prefs} save={save} status={system?.memoryAuto} t={t} refresh={refresh}/>
    <RammapPanel t={t} busy={busy} setBusy={setBusy} Button={Button} Modal={Modal} refresh={refresh}/>
    <section className="panel memory-quick"><div><h2>{t('تقليل رام الخلفية','Reduce background RAM')}</h2><p>{t('راجع أكبر 10 عمليات بلا نافذة ظاهرة، ثم نفّذ التقليل بضغطة.','Review up to 10 largest processes without a visible window, then trim them.')}</p></div><Button variant="primary" icon={MemoryStick} disabled={loading||!!busy||preview||!background.length} onClick={reviewBackground}>{loading?t('جارٍ قراءة البرامج…','Reading processes…'):t('تقليل رام الخلفية','Reduce background RAM')}</Button></section>
    <div className="memory-cards">
      <section className="panel memory-metric"><span className="section-icon"><MemoryStick size={22}/></span><h2>{t('رام الجهاز المستخدمة','Device RAM in use')}</h2><strong className="large-number numeric">{percent}<small>%</small></strong><div className="mini-track"><span style={{width:percent+'%'}}/></div><p className="numeric">{bytes(system?.memory.used)} / {bytes(system?.memory.total)}</p><span className="subtle">{t('المتاحة الآن','Available now')} · <b dir="ltr">{bytes(system?.memory.free)}</b></span></section>
      <section className="panel memory-chart"><div className="panel-title"><h2>{t('آخر القراءات','Recent readings')}</h2><span className="status-chip green">{t('مباشر','Live')}</span></div><div className="chart" role="img" aria-label={t(`استخدام الرام؛ آخر قراءة ${percent} بالمئة`,`RAM usage; latest reading ${percent} percent`)}><span className="chart-label">100%</span><div className="chart-bars">{points.map((p,i)=><div key={i} style={{height:p+'%'}} title={`${p}%`}/>)}</div><span className="chart-label bottom">0%</span></div><div className="chart-caption"><span>{t('أقدم قراءة','Oldest reading')}</span><span>{t(`تحديث كل ${seconds} ثانية`,`Updates every ${seconds}s`)}</span></div></section>
    </div>
    <section className="panel memory-controls">
      <div className="memory-section-heading"><div><span className="eyebrow">{t('أنت تتحكم','YOU’RE IN CONTROL')}</span><h2>{t('تقليل الرام للبرامج المختارة','Reduce RAM for selected processes')}</h2></div><Button icon={RefreshCw} disabled={loading||!!busy||preview} onClick={load}>{loading?t('جارٍ القراءة…','Reading…'):t('تحديث قائمة البرامج','Refresh process list')}</Button></div>
      <p>{t('اختر حتى 10 عمليات من برامجك. يطلب كانس من ويندوز إخراج بعض صفحاتها من الرام مؤقتًا، دون إغلاقها. قد يتباطأ البرنامج للحظة وتعود الذاكرة مع الاستخدام؛ هذا لا يضع حدًا ثابتًا للاستهلاك.','Select up to 10 processes. Kanis asks Windows to temporarily trim their resident memory without closing them. Apps may briefly slow down and memory can return with use; this does not set a memory limit.')}</p>
      <div className="memory-scope"><ShieldCheck size={16}/><span>{t('برامج المستخدم الحالي فقط · عمليات النظام والمحميّة خارج النطاق · تنفيذ يدوي','Current-user processes only · System and protected processes excluded · Manual action')}</span></div>
      <div className="filter-tabs memory-filters" aria-label={t('عرض العمليات','Process view')}>{[['all','كل العمليات','All processes'],['background','بلا نافذة ظاهرة','No visible window']].map(([id,ar,en])=><button key={id} className={filter===id?'active':''} aria-pressed={filter===id} disabled={!!busy||loading} onClick={()=>{setFilter(id);setSelected(new Set());}}>{t(ar,en)}{id==='background'&&` (${background.length})`}</button>)}</div>
      <p className="subtle">{t('عدم وجود نافذة لا يعني أن العملية غير ضرورية؛ قد تكون جزءًا من متصفح أو لعبة مفتوحة. التصنيف حسب نوافذ سطح المكتب وقت القراءة، ويُظهر النوافذ المصغّرة ضمن العمليات ذات النافذة.','No visible window does not mean unnecessary: a process may belong to an open browser or game. Classification uses desktop windows at read time; minimized windows count as having a window.')}</p>
      {error&&<div className="notice warning" role="alert">{error}</div>}
      {preview&&<p className="empty-inline">{t('افتح نسخة ويندوز لعرض البرامج الفعلية والتحكم بها.','Open the Windows app to view and manage real processes.')}</p>}
      {loading&&<div className="memory-loading" role="status"><LoaderCircle className="spin" size={20}/>{t('قراءة البرامج المتاحة…','Reading eligible processes…')}</div>}
      {!loading&&list&&<><div className="memory-process-list" role="group" aria-label={t('اختر العمليات','Select processes')}>
        <div className="memory-list-label"><span>{t('البرنامج / رقم العملية','Process / ID')}</span><span>{t('الذاكرة المقيمة','Resident memory')}</span></div>
        {displayed.map(p=><label className={`memory-process ${selected.has(p.id)?'is-selected':''}`} key={p.id}><input type="checkbox" disabled={!!busy||(!selected.has(p.id)&&selected.size>=10)} checked={selected.has(p.id)} onChange={()=>setSelected(previous=>{const next=new Set(previous);next.has(p.id)?next.delete(p.id):next.add(p.id);return next;})}/><span className="memory-process-name"><strong dir="auto">{p.name}</strong><small><span dir="ltr">PID {p.pid}</span> · {p.hasVisibleWindow===false?t('بلا نافذة ظاهرة','No visible window'):p.hasVisibleWindow===true?t('لها نافذة','Has a window'):t('حالة النافذة غير متاحة','Window state unavailable')}</small></span><b className="numeric">{bytes(p.bytes)}</b></label>)}
        {!displayed.length&&<p className="empty-inline">{t('لا توجد عمليات مطابقة في القراءة الحالية. جرّب تحديث القائمة أو عرض كل العمليات.','No matching processes in this reading. Refresh or show all processes.')}</p>}
      </div><p className="subtle">{t('أكبر 40 عملية متاحة وقت القراءة. قد يظهر البرنامج أكثر من مرة، والأرقام تشمل ذاكرة مشتركة بين العمليات؛ لا تجمعها كإجمالي رام الجهاز.','Up to 40 largest eligible processes at read time. One app may have several processes. Values include shared pages and should not be added as total device RAM.')}</p></>}
      <div className="memory-actions"><span>{selected.size} / 10 {t('محددة','selected')}</span><Button variant="primary" icon={MemoryStick} disabled={!selected.size||!!busy||loading||preview} onClick={()=>setConfirm(true)}>{busy==='memory'?t('جارٍ التقليل…','Trimming…'):t('تقليل رام المحدد','Trim selected memory')}</Button><Button onClick={()=>api.systemTool('task-manager').catch(e=>setError(message(e)))}>{t('فتح مدير المهام','Open Task Manager')}</Button></div>
      {result&&<div className="memory-result" role="status"><h3>{t('نتيجة المحاولة','Attempt results')}</h3><p>{t('تغيّر الذاكرة المتاحة للجهاز أثناء العملية؛ نشاط البرامج الأخرى يؤثر في هذه القراءة.','Device available memory during the operation; other apps also affect this reading.')}</p><div className="memory-before-after"><span>{t('قبل','Before')} <b dir="ltr">{bytes(result.availableBefore)}</b></span><span>{t('بعد','After')} <b dir="ltr">{bytes(result.availableAfter)}</b></span></div>{result.rows.map(r=><div className="memory-result-row" key={r.pid}><span dir="auto">{r.name} <small>({r.pid})</small></span><span>{r.status==='trimmed'?t('تم الطلب','Trim requested'):t('تم التخطي؛ مغلق أو غير متاح','Skipped; closed or unavailable')}</span>{r.status==='trimmed'&&<b dir="ltr">{bytes(r.before)} → {bytes(r.after)}</b>}</div>)}<p className="subtle">{t('الأرقام لكل عملية هي ذاكرة مقيمة قبل الطلب وبعده مباشرة، وليست توفيرًا دائمًا. انتظر دقيقة قبل تكرار المحاولة.','Per-process values are resident memory immediately before and after the request, not lasting savings. Wait a minute before trying again.')}</p></div>}
    </section>
    <section className="panel memory-preferences"><div className="panel-title"><SlidersHorizontal size={20}/><h2>{t('خفّف نشاط كانس','Reduce Kanis activity')}</h2></div><label className="setting-row"><span><strong>{t('فاصل تحديث القراءات','Reading interval')}</strong><small>{t('الفاصل الأطول يقلل مرات القراءة وتحديث الواجهة.','A longer interval reduces reading and rendering frequency.')}</small></span><select value={seconds} onChange={e=>save({memoryRefreshSeconds:Number(e.target.value)})}>{[5,15,30,60].map(s=><option key={s} value={s}>{t(`كل ${s} ثانية`,`Every ${s}s`)}</option>)}</select></label><p>{t('تتوقف قراءات الواجهة عند إخفائها. عند التشغيل مع ويندوز، لا تُحمّل الواجهة حتى تفتح كانس، وتظل تنبيهات المساحة تعمل في الخلفية.','Interface readings pause while hidden. At Windows sign-in, the interface loads only when you open Kanis; storage notifications continue in the background.')}</p><Button icon={RefreshCw} onClick={refresh}>{t('تحديث قراءة الجهاز الآن','Refresh device reading')}</Button></section>
    {confirm&&<Modal title={t('تقليل مؤقت للرام','Temporarily trim RAM')} onClose={()=>setConfirm(false)}><div className="modal-content"><p>{t('قد يتباطأ البرنامج عند العودة إليه، وتزيد عمليات القراءة من القرص. لن يُغلق كانس البرامج أو يحذف ملفاتها.','Returning to an app may be slower and increase disk reads. Kanis will not close the selected processes or delete their files.')}</p><ul>{chosen.map(p=><li key={p.id}><span dir="auto">{p.name}</span> <span dir="ltr">· PID {p.pid}</span></li>)}</ul></div><div className="modal-footer"><Button onClick={()=>setConfirm(false)}>{t('إلغاء','Cancel')}</Button><Button variant="primary" disabled={!!busy} onClick={trim}>{t('تنفيذ للمحدد فقط','Trim selected only')}</Button></div></Modal>}
  </div>;
}
