/* ═══════════════════════════════════
   NOS AI Assistant — app.js
   ═══════════════════════════════════ */

/* ── Constants ── */
const CATS=[
  {id:'policy',   ar:'سياسات',      col:'#1D4ED8', bg:'#EFF6FF'},
  {id:'form',     ar:'نماذج',        col:'#7C3AED', bg:'#F5F3FF'},
  {id:'procedure',ar:'إجراءات',     col:'#065F46', bg:'#ECFDF5'},
  {id:'legal',    ar:'قانوني',       col:'#B91C1C', bg:'#FEF2F2'},
  {id:'hr',       ar:'موارد بشرية', col:'#B45309', bg:'#FFFBEB'},
  {id:'general',  ar:'عام',          col:'#374151', bg:'#F9FAFB'},
];
const gc  = id => CATS.find(c=>c.id===id) || CATS[5];
const esc = s  => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/* ── Supabase ── */
const SUPA_URL = 'https://xzxdaupwwwdcwfnqweub.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6eGRhdXB3d3dkY3dmbnF3ZXViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMTM5NTAsImV4cCI6MjA5MDg4OTk1MH0.KjNZpFvLxh8XfDDoWdpVsIQZAh1PjzGXOrfDmApZ4K8';
const SUPA_H   = {'Content-Type':'application/json','apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY};
const SUPA_TB  = `${SUPA_URL}/rest/v1/nos_knowledge_base`;
const SUPA_LOG = `${SUPA_URL}/rest/v1/nos_ai_logs`;

async function sbLoad(){
  const r = await fetch(`${SUPA_TB}?select=*&order=created_at.asc`,{headers:SUPA_H});
  return r.ok ? r.json() : null;
}
async function sbUpsert(item){
  return fetch(SUPA_TB,{method:'POST',headers:{...SUPA_H,'Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(item)});
}
async function sbDelete(id){
  return fetch(`${SUPA_TB}?id=eq.${id}`,{method:'DELETE',headers:SUPA_H});
}
async function sbLog(question){
  try{
    await fetch(SUPA_LOG,{method:'POST',headers:{...SUPA_H,'Prefer':'return=minimal'},body:JSON.stringify({question})});
  }catch(e){}
}
async function sbLogs(){
  const r = await fetch(`${SUPA_LOG}?select=question,created_at&order=created_at.desc&limit=200`,{headers:SUPA_H});
  return r.ok ? r.json() : [];
}

/* ── State ── */
const DEFAULT_WORKER = 'https://helper.soloever2.workers.dev';
let KB=[], MSGS=[], VIEW='chat', EDIT=null, DELID=null, BUSY=false, WORKER_URL='', SEARCH='', SB_SEARCH='';
let FORM={title:'',category:'general',content:''};

/* ── Dark Mode ── */
function initDark(){
  if(localStorage.getItem('nos-dark')==='1') document.body.classList.add('dark');
}
function toggleDark(){
  document.body.classList.toggle('dark');
  localStorage.setItem('nos-dark', document.body.classList.contains('dark') ? '1' : '0');
  const btn = document.getElementById('dark-btn');
  if(btn) btn.textContent = document.body.classList.contains('dark') ? '☀️' : '🌙';
}

/* ── Markdown ── */
function md(text){
  let s = esc(text);
  s = s.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>');
  s = s.replace(/`(.*?)`/g,'<code>$1</code>');
  s = s.replace(/^### (.+)$/gm,'<span class="md-h" style="font-size:13px;">$1</span>');
  s = s.replace(/^## (.+)$/gm, '<span class="md-h" style="font-size:14px;">$1</span>');
  s = s.replace(/^- (.+)$/gm,  '<li>$1</li>');
  s = s.replace(/(<li>[\s\S]*?<\/li>(\n|$))+/g,'<ul>$&</ul>');
  s = s.replace(/\n/g,'<br>');
  return s;
}

/* ── Init ── */
function init(){
  initDark();
  WORKER_URL = localStorage.getItem('nos-worker-url') || DEFAULT_WORKER;
  KB   = JSON.parse(localStorage.getItem('nos-kb')   || '[]');
  MSGS = JSON.parse(localStorage.getItem('nos-chat') || '[]');
  re();
  loadRemoteKB();
}

async function loadRemoteKB(){
  try{
    const data = await sbLoad();
    if(!data||!data.length) return;
    KB = data;
    localStorage.setItem('nos-kb', JSON.stringify(KB));
    re();
  }catch(e){}
}

/* ── Persist ── */
function saveKb()  { localStorage.setItem('nos-kb',   JSON.stringify(KB)); }
function saveMsgs(){ localStorage.setItem('nos-chat', JSON.stringify(MSGS.slice(-40))); }
function resetSetup(){
  if(!confirm('إعادة إعداد رابط الـ Worker؟')) return;
  localStorage.removeItem('nos-worker-url'); location.reload();
}

/* ── Export / Import ── */
function exportKb(){
  const blob = new Blob([JSON.stringify(KB,null,2)],{type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download='nos-knowledge-base.json'; a.click();
}
async function importKb(inp){
  const file = inp.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try{
      const data = JSON.parse(e.target.result);
      if(!Array.isArray(data)) throw new Error('ملف غير صالح');
      const now = new Date().toISOString();
      const valid = data.filter(d=>d.title&&d.content).map(d=>({
        id:         d.id||('k'+Date.now()+Math.random().toString(36).slice(2)),
        title:      d.title,
        category:   d.category||'general',
        content:    d.content,
        created_at: d.createdAt||d.created_at||now,
        updated_at: d.updatedAt||d.updated_at||now
      }));
      if(!valid.length) throw new Error('لا يوجد مستندات صالحة');
      const res = await fetch(SUPA_TB,{method:'POST',headers:{...SUPA_H,'Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(valid)});
      if(!res.ok){ const err=await res.json().catch(()=>({})); throw new Error(`Supabase: ${err.message||res.status}`); }
      KB = [...KB.filter(k=>!valid.find(v=>v.id===k.id)), ...valid];
      localStorage.setItem('nos-kb', JSON.stringify(KB));
      re();
      alert(`✅ تم استيراد ${valid.length} مستند`);
    }catch(err){ alert('❌ خطأ: '+err.message); }
  };
  reader.readAsText(file);
  inp.value='';
}

/* ══ RENDER ══ */
function re(){
  const kc = document.getElementById('kb-count');
  if(kc) kc.textContent = KB.length;

  const isDark = document.body.classList.contains('dark');
  const btn = document.getElementById('dark-btn');
  if(btn) btn.textContent = isDark ? '☀️' : '🌙';

  ['chat','manage','analytics'].forEach(v=>{
    const b = document.getElementById('nav-'+v);
    if(b){ const on=VIEW===v||(VIEW==='add'&&v==='manage'); b.className='nb'+(on?' on':''); }
  });

  /* Sidebar list with search */
  const sl = document.getElementById('sb-list');
  if(sl){
    if(VIEW==='chat'){
      const filtered = SB_SEARCH
        ? KB.filter(k => (k.title+k.content).toLowerCase().includes(SB_SEARCH.toLowerCase()))
        : KB.slice(0,12);

      sl.innerHTML = `
        <div class="sb-search">
          <input type="text" placeholder="🔍 بحث في المستندات..."
            value="${esc(SB_SEARCH)}"
            oninput="SB_SEARCH=this.value;re()"
            onclick="event.stopPropagation()" />
        </div>` +
        (filtered.length
          ? filtered.map(k=>{
              const c=gc(k.category);
              return `<div class="sb-item" onclick="openEdit('${k.id}')">
                <div style="color:#B8C8D8;font-size:11px;font-weight:500;text-align:right;margin-bottom:2px;">${esc(k.title)}</div>
                <span style="font-size:9px;padding:1px 5px;border-radius:10px;background:${c.bg};color:${c.col};font-weight:700;">${c.ar}</span>
              </div>`;
            }).join('') +
            (!SB_SEARCH && KB.length>12 ? `<div style="color:#2A4060;font-size:9px;text-align:center;padding:4px 0;">+${KB.length-12} مزيد</div>` : '')
          : `<div style="text-align:center;padding:12px 8px;color:#3A5A7A;font-size:11px;">لا نتائج</div>`
        );
    } else {
      sl.innerHTML = '';
    }
  }

  const m = document.getElementById('main');
  if(!m) return;
  if(VIEW==='chat')      rChat(m);
  else if(VIEW==='manage')    rManage(m);
  else if(VIEW==='add')       rAdd(m);
  else if(VIEW==='analytics') rAnalytics(m);
}

/* ── Chat View ── */
function rChat(el){
  const rows = MSGS.map(m=>{
    const u = m.role==='user';
    return `<div class="msg-row" style="justify-content:${u?'flex-start':'flex-end'}">
      ${u?`<div class="avi-u">👤</div>`:''}
      <div class="${u?'bubble-u':'bubble-a'}">${u?esc(m.content):md(m.content)}</div>
      ${!u?`<div class="avi-a">🤖</div>`:''}
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="mh">
      <button class="menu-btn" onclick="toggleSidebar()">☰</button>
      <div>
        <div class="mh-title">المساعد الذكي</div>
        <div class="mh-sub">${KB.length?KB.length+' مستند محمّل':'لا توجد بيانات'}</div>
      </div>
      ${MSGS.length?`<button class="ibtn" onclick="clearChat()">مسح المحادثة</button>`:''}
    </div>
    <div id="cmsg">
      ${!MSGS.length?`
        <div style="flex:1;display:flex;align-items:center;justify-content:center;min-height:300px;">
          <div style="text-align:center;max-width:340px;direction:rtl;">
            <div style="font-size:44px;margin-bottom:12px;">🤖</div>
            <div style="font-weight:700;font-size:16px;margin-bottom:8px;">مرحباً! أنا مساعد NOS</div>
            <div style="font-size:13px;color:var(--sub-text);line-height:1.8;">
              ${KB.length?`لدي ${KB.length} مستند جاهز. اسألني!`:'ابدأ بإضافة محتوى من قاعدة المعرفة.'}
            </div>
            ${!KB.length?`<button class="pri-btn" onclick="gv('manage')" style="margin-top:14px;font-size:13px;">📚 فتح قاعدة المعرفة</button>`:''}
            ${KB.length?`
            <div style="margin-top:20px;">
              <div style="font-size:11px;color:var(--sub-text);margin-bottom:10px;">أسئلة شائعة 👇</div>
              <div style="display:flex;flex-direction:column;gap:8px;">
                ${[
                  'ما هي مستندات التنازل المطلوبة؟',
                  'ما هو الـ SLA لكل نوع طلب؟',
                  'ما هي إجراءات إلغاء العقد واسترداد المبالغ؟',
                  'ما هي رسوم إصدار عقد جديد؟',
                  'ما هي إجراءات تغيير الشيكات؟',
                  'كيف يطلب العميل زيارة الموقع؟'
                ].map(q=>`
                  <button onclick="sendQuick('${q}')" style="
                    background:var(--card-bg);border:1.5px solid var(--card-border);
                    border-radius:20px;padding:9px 16px;font-size:12.5px;color:var(--text);
                    font-family:'Tajawal',sans-serif;cursor:pointer;text-align:right;direction:rtl;line-height:1.4;
                    transition:border-color .15s,background .15s;
                  " onmouseover="this.style.borderColor='#C8A86B'"
                     onmouseout="this.style.borderColor=''">${q}</button>
                `).join('')}
              </div>
            </div>`:''}
          </div>
        </div>`:''
      }
      ${rows}
      ${BUSY?`
        <div class="msg-row" style="justify-content:flex-end">
          <div class="avi-a">🤖</div>
          <div class="bubble-a" style="padding:12px 16px;"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
        </div>`:''}
      <div id="cend"></div>
    </div>
    <div class="cinput-area">
      <div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:4px;">
        <textarea id="chat-inp" rows="2" placeholder="اكتب سؤالك... (Enter للإرسال، Shift+Enter لسطر جديد)" ${BUSY?'disabled':''}></textarea>
        <button class="send-btn" onclick="doSend()" ${BUSY?'disabled':''}>إرسال ↑</button>
      </div>
      <div style="font-size:10px;color:var(--sub-text);direction:rtl;">${KB.length} مستند • المحادثة محفوظة تلقائياً</div>
    </div>`;

  const inp = document.getElementById('chat-inp');
  if(inp) inp.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();doSend();}});
  setTimeout(()=>{const e=document.getElementById('cend');if(e)e.scrollIntoView();},40);
}

/* ── Manage View ── */
function rManage(el){
  const q = SEARCH.toLowerCase();
  const filtered = KB.filter(k=>k.title.toLowerCase().includes(q)||k.content.toLowerCase().includes(q));

  el.innerHTML = `
    <div class="mh">
      <button class="menu-btn" onclick="toggleSidebar()">☰</button>
      <div class="mh-title" style="direction:rtl;">📚 قاعدة المعرفة (${KB.length})</div>
      <input value="${esc(SEARCH)}" placeholder="🔍 بحث..."
        style="padding:6px 12px;border:1px solid var(--inp-border);border-radius:6px;font-size:13px;outline:none;direction:rtl;width:180px;background:var(--inp-bg);color:var(--text);"
        oninput="SEARCH=this.value;rManage(document.getElementById('main'))" />
    </div>
    <div style="flex:1;overflow-y:auto;padding:16px;">
      ${!filtered.length?`
        <div style="text-align:center;padding:50px;color:var(--sub-text);direction:rtl;">
          <div style="font-size:40px;margin-bottom:10px;">📭</div>
          <div style="font-size:14px;">${KB.length===0?'لا يوجد محتوى. أضف أول مستند!':'لا نتائج للبحث'}</div>
          ${KB.length===0?`<button class="pri-btn" onclick="gv('add',true)" style="margin-top:14px;">+ إضافة أول مستند</button>`:''}
        </div>`:`
        <div class="kb-grid">${filtered.map(item=>{
          const c=gc(item.category);
          const conf=DELID===item.id;
          return `<div class="kcard">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;">
              <span class="cbadge" style="background:${c.bg};color:${c.col};">${c.ar}</span>
              ${conf?`<div style="display:flex;gap:4px;align-items:center;">
                <span style="font-size:11px;color:#B91C1C;">تأكيد الحذف؟</span>
                <button onclick="doDelete('${item.id}')" style="padding:2px 7px;font-size:11px;background:#DC2626;border:none;border-radius:4px;color:#fff;font-weight:600;">نعم</button>
                <button onclick="DELID=null;re()" style="padding:2px 7px;font-size:11px;background:#F3F4F6;border:none;border-radius:4px;">لا</button>
              </div>`:`<div style="display:flex;gap:4px;">
                <button class="edit-btn" onclick="openEdit('${item.id}')">✏️ تعديل</button>
                <button class="del-btn" onclick="DELID='${item.id}';re()">🗑️</button>
              </div>`}
            </div>
            <div style="font-weight:600;font-size:13px;margin-bottom:5px;color:var(--text);">${esc(item.title)}</div>
            <div style="font-size:12px;color:var(--sub-text);line-height:1.6;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;">${esc(item.content).slice(0,200)}</div>
            <div style="font-size:10px;color:var(--sub-text);margin-top:8px;">${new Date(item.updated_at||item.updatedAt||item.created_at||item.createdAt).toLocaleDateString('ar-EG')} • ${item.content.length.toLocaleString()} حرف</div>
          </div>`;
        }).join('')}</div>`
      }
    </div>`;
}

/* ── Add / Edit View ── */
function rAdd(el){
  el.innerHTML = `
    <div class="mh">
      <button class="menu-btn" onclick="toggleSidebar()">☰</button>
      <div class="mh-title" style="direction:rtl;">${EDIT?'✏️ تعديل المستند':'➕ إضافة محتوى جديد'}</div>
      <button class="ibtn" onclick="gv('manage')">← رجوع</button>
    </div>
    <div style="flex:1;overflow-y:auto;padding:20px;">
      <div style="max-width:680px;margin:0 auto;direction:rtl;">
        <div class="hint-box" style="margin-bottom:16px;">
          💡 الصق نص السياسة أو الإجراء أو النموذج في خانة المحتوى. يمكنك نسخ النص من PDF أو Word أو أي مصدر.
        </div>
        <div style="margin-bottom:14px;">
          <label class="form-label">عنوان المستند *</label>
          <input class="form-inp" id="f-title" value="${esc(FORM.title)}" oninput="FORM.title=this.value" placeholder="مثال: إجراءات التنازل عن الوحدة" />
        </div>
        <div style="margin-bottom:14px;">
          <label class="form-label">التصنيف</label>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            ${CATS.map(c=>`
              <button onclick="FORM.category='${c.id}';rAdd(document.getElementById('main'))"
                style="padding:5px 12px;border-radius:20px;font-size:11.5px;font-weight:600;cursor:pointer;
                border:${FORM.category===c.id?`2px solid ${c.col}`:'2px solid #E5E7EB'};
                background:${FORM.category===c.id?c.bg:'transparent'};
                color:${FORM.category===c.id?c.col:'#9CA3AF'};">${c.ar}</button>`).join('')}
          </div>
        </div>
        <div style="margin-bottom:14px;">
          <label class="form-label">المحتوى * <span style="font-weight:400;color:var(--sub-text);">(الصق النص هنا)</span></label>
          <textarea id="f-content" rows="14"
            oninput="FORM.content=this.value;document.getElementById('cc').textContent=this.value.length.toLocaleString()+' حرف'"
            placeholder="الصق هنا نص السياسة أو الإجراء أو النموذج..."
            style="width:100%;padding:11px 13px;border:1px solid var(--inp-border);border-radius:7px;font-size:13px;resize:vertical;outline:none;line-height:1.75;direction:rtl;background:var(--inp-bg);color:var(--text);"
          >${esc(FORM.content)}</textarea>
          <div id="cc" style="font-size:10px;color:var(--sub-text);margin-top:3px;text-align:left;">${FORM.content.length.toLocaleString()} حرف</div>
        </div>
        <div id="ferr" style="display:none" class="err-box"></div>
        <div id="fok"  style="display:none" class="ok-box"></div>
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button class="pri-btn" onclick="saveItem()">${EDIT?'💾 حفظ التعديلات':'➕ إضافة إلى قاعدة المعرفة'}</button>
          <button class="sec-btn" onclick="gv('manage')">إلغاء</button>
        </div>
      </div>
    </div>`;
}

/* ── Analytics View ── */
async function rAnalytics(el){
  el.innerHTML = `
    <div class="mh">
      <button class="menu-btn" onclick="toggleSidebar()">☰</button>
      <div class="mh-title" style="direction:rtl;">📊 تحليلات الأسئلة</div>
    </div>
    <div style="flex:1;overflow-y:auto;padding:20px;direction:rtl;">
      <div style="max-width:680px;margin:0 auto;">
        <div style="text-align:center;padding:40px;color:var(--sub-text);">
          <div style="font-size:32px;margin-bottom:8px;">⏳</div>
          <div>جاري تحميل البيانات...</div>
        </div>
      </div>
    </div>`;

  try {
    const logs = await sbLogs();
    if(!logs.length){
      el.querySelector('div[style*="padding:40px"]').innerHTML = '<div style="font-size:32px;margin-bottom:8px;">📭</div><div>لا يوجد أسئلة مسجلة بعد</div>';
      return;
    }

    /* احسب الأسئلة الأكثر تكراراً */
    const counts = {};
    logs.forEach(l=>{ counts[l.question]=(counts[l.question]||0)+1; });
    const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,20);
    const max = sorted[0][1];

    const totalQ  = logs.length;
    const uniqueQ = Object.keys(counts).length;
    const today   = logs.filter(l=>new Date(l.created_at).toDateString()===new Date().toDateString()).length;

    el.innerHTML = `
      <div class="mh">
        <button class="menu-btn" onclick="toggleSidebar()">☰</button>
        <div class="mh-title" style="direction:rtl;">📊 تحليلات الأسئلة</div>
        <div style="font-size:11px;color:var(--sub-text);">آخر 200 سؤال</div>
      </div>
      <div style="flex:1;overflow-y:auto;padding:20px;direction:rtl;">
        <div style="max-width:680px;margin:0 auto;">

          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px;">
            ${[
              {label:'إجمالي الأسئلة', val:totalQ,  icon:'💬'},
              {label:'أسئلة اليوم',    val:today,   icon:'📅'},
              {label:'أسئلة مختلفة',  val:uniqueQ, icon:'🔤'},
            ].map(s=>`
              <div style="background:var(--card-bg);border:1px solid var(--card-border);border-radius:10px;padding:14px;text-align:center;">
                <div style="font-size:24px;">${s.icon}</div>
                <div style="font-size:22px;font-weight:700;color:#C8A86B;">${s.val}</div>
                <div style="font-size:11px;color:var(--sub-text);">${s.label}</div>
              </div>`).join('')}
          </div>

          <div style="font-weight:600;font-size:14px;margin-bottom:12px;">أكثر الأسئلة تكراراً</div>
          ${sorted.map(([q,c],i)=>`
            <div class="analytics-row">
              <div class="analytics-rank">${i+1}</div>
              <div style="flex:1;">
                <div style="font-size:13px;color:var(--text);margin-bottom:4px;">${esc(q)}</div>
                <div class="analytics-bar" style="width:${Math.round(c/max*100)}%"></div>
              </div>
              <div style="font-size:13px;font-weight:700;color:#C8A86B;min-width:30px;text-align:center;">${c}</div>
            </div>`).join('')}

        </div>
      </div>`;
  }catch(e){
    el.innerHTML += `<div style="color:var(--err-text);padding:20px;text-align:center;">❌ فشل تحميل البيانات</div>`;
  }
}

/* ══ ACTIONS ══ */
function gv(v, reset){
  VIEW=v; DELID=null;
  if(reset){ EDIT=null; FORM={title:'',category:'general',content:''}; }
  closeSidebar(); re();
}

function openEdit(id){
  const item=KB.find(k=>k.id===id); if(!item) return;
  EDIT=item; FORM={title:item.title, category:item.category, content:item.content};
  VIEW='add'; DELID=null; re();
}

async function doDelete(id){
  KB=KB.filter(k=>k.id!==id); DELID=null;
  localStorage.setItem('nos-kb', JSON.stringify(KB)); re();
  await sbDelete(id);
}

async function saveItem(){
  const ft=document.getElementById('f-title');
  const fc=document.getElementById('f-content');
  if(ft) FORM.title=ft.value;
  if(fc) FORM.content=fc.value;
  const fe=document.getElementById('ferr');
  const fo=document.getElementById('fok');
  if(!FORM.title.trim()){ if(fe){fe.style.display='block';fe.textContent='⚠️ العنوان مطلوب';} return; }
  if(!FORM.content.trim()){ if(fe){fe.style.display='block';fe.textContent='⚠️ المحتوى مطلوب';} return; }
  if(fe) fe.style.display='none';
  const now=new Date().toISOString();
  const item=EDIT?{...EDIT,...FORM,updated_at:now}:{id:'k'+Date.now(),...FORM,created_at:now,updated_at:now};
  KB=EDIT?KB.map(k=>k.id===item.id?item:k):[...KB,item];
  EDIT=null; localStorage.setItem('nos-kb',JSON.stringify(KB));
  if(fo){fo.style.display='block';fo.textContent='⏳ جاري الحفظ...';}
  try{ await sbUpsert(item); if(fo) fo.textContent='✅ تم الحفظ!'; }
  catch(e){ if(fo) fo.textContent='⚠️ تم الحفظ محلياً فقط'; }
  setTimeout(()=>{VIEW='manage';re();},900);
}

function clean(text){ return text.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim(); }

function relevantDocs(q, limit=3){
  if(!KB.length) return [];
  const words=q.toLowerCase().split(/[\s،,؟?]+/).filter(w=>w.length>1);
  const scored=KB.map(k=>{
    const text=(k.title+' '+clean(k.content)).toLowerCase();
    const score=words.reduce((s,w)=>s+(text.includes(w)?1:0),0);
    return {k,score};
  });
  scored.sort((a,b)=>b.score-a.score);
  const top=scored.slice(0,limit).map(x=>x.k);
  return top.length&&scored[0].score>0?top:KB.slice(0,2);
}

function trimDoc(text,max=600){ const t=clean(text); return t.length>max?t.slice(0,max)+'…':t; }

async function doSend(){
  const inp = document.getElementById('chat-inp');
  const txt = inp ? inp.value.trim() : '';
  if(!txt || BUSY) return;

  MSGS.push({role:'user', content:txt});
  if(inp) inp.value='';
  BUSY=true; saveMsgs(); re();

  sbLog(txt);

  const base = 'أنت مساعد ذكي لشركة Nations of Sky (NOS). أجب بناءً على قاعدة المعرفة التالية فقط. إذا لم تجد المعلومة، قل ذلك صراحةً. استخدم العربية أساساً. كن مختصراً ومفيداً.';

  try {
    let docs = [];

    if(KB.length > 0){
      /* ── الخطوة 1: الـ AI يختار الـ Docs الأكثر صلة من العناوين ── */
      const titles = KB.map(k=>`${k.id}: ${k.title}`).join('\n');

      const r1 = await fetch(WORKER_URL, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          messages:[{role:'user', content:
            `السؤال: ${txt}\n\nالمستندات المتاحة:\n${titles}\n\nأعطني IDs الـ 3 الأكثر صلة فقط كـ JSON array. لا تكتب أي شيء آخر.`
          }],
          system:'أنت نظام اختيار مستندات. أجب فقط بـ JSON array من IDs. مثال: ["k001","k008"]. لا كلام إضافي.'
        })
      });
      const d1 = await r1.json();

      if(!d1.error && d1.text){
        try {
          const match = d1.text.match(/\[[\s\S]*?\]/);
          if(match) docs = KB.filter(k => JSON.parse(match[0]).includes(k.id));
        } catch(e){}
      }

      /* fallback للـ keyword matching لو فشل الـ AI */
      if(!docs.length) docs = relevantDocs(txt);
    }

    /* ── الخطوة 2: السؤال الحقيقي مع السياق المختار ── */
    const ctx = KB.length
      ? base + '\n\n# قاعدة المعرفة:\n\n'
        + docs.map((k,i)=>`### [${i+1}] ${k.title}\n${trimDoc(k.content)}`).join('\n\n---\n\n')
      : base + '\n\nقاعدة المعرفة فارغة حالياً.';

    const res = await fetch(WORKER_URL, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        messages: MSGS.map(m=>({role:m.role, content:m.content})),
        system: ctx
      })
    });
    const d = await res.json();
    if(d.error) throw new Error(d.error);
    MSGS.push({role:'assistant', content: d.text||'لم أتمكن من الإجابة.'});

  } catch(err){
    const msg = err.message||'';
    const wait = msg.match(/try again in ([\d.]+)s/);
    MSGS.push({role:'assistant', content:
      wait ? `⏳ استنى ${Math.ceil(wait[1])} ثانية وحاول تاني.`
           : '❌ خطأ في الاتصال:\n'+msg
    });
  }
  BUSY=false; saveMsgs(); re();
}

function clearChat(){ if(!confirm('مسح كل المحادثة؟')) return; MSGS=[]; saveMsgs(); re(); }
function sendQuick(q){ const inp=document.getElementById('chat-inp'); if(inp) inp.value=q; doSend(); }

/* ── Sidebar Toggle ── */
function toggleSidebar(){
  document.getElementById('sb').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('on');
}
function closeSidebar(){
  document.getElementById('sb').classList.remove('open');
  document.getElementById('overlay').classList.remove('on');
}

/* ── PWA ── */
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});

/* ── Start ── */
init();
