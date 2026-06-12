// ═══ DB ═══
const APP_VERSION='清爽版 v1.2.5';
const DB_KEY='credit_sys_v3';
function loadDB(){
  try{
    const raw=localStorage.getItem(DB_KEY);
    const db=raw?JSON.parse(raw):{users:{}};
    if(!db||typeof db!=='object')return {users:{}};
    if(!db.users)db.users={};
    return db;
  }catch(err){
    console.warn('PASS 資料讀取失敗，已暫時使用空資料庫',err);
    return {users:{}};
  }
}
function saveDB(d){
  try{localStorage.setItem(DB_KEY,JSON.stringify(d));}
  catch(err){console.error('PASS 資料儲存失敗',err);alert('資料儲存失敗：瀏覽器儲存空間可能不足，請先匯出備份或清理空間。');}
}
let currentUser=null,currentDept=null;
function getUD(){const db=loadDB();return db.users[currentUser]||{name:'',depts:{},password:''}}
function saveUD(ud){
  const db=loadDB();
  db.users[currentUser]=ud;
  saveDB(db);
  if(window.PASSFirebase?.auth?.currentUser&&window.PASSFirebase.auth.currentUser.uid===currentUser){
    window.PASSFirebase.savePassData(ud).catch(err=>console.warn('Firestore 同步失敗，已保留本機備份',err));
  }
}
function getActiveDept(){return getUD().depts[currentDept]||null}
function getDeptLabel(deptId){
  const d=getUD().depts?.[deptId];
  return ((d?.short||d?.name||'')+'').trim()||'未命名科系';
}
function getDeptOptionsHTML(selected,{includeAll=false,allText='全部科系'}={}){
  const ud=getUD();
  const entries=Object.entries(ud.depts||{});
  const opts=entries.map(([id,d])=>`<option value="${id}" ${selected===id?'selected':''}>${esc(d.short||d.name||'未命名科系')}</option>`).join('');
  return (includeAll?`<option value="all" ${selected==='all'?'selected':''}>${allText}</option>`:'')+opts;
}
function fillDeptSelect(id,{includeAll=false,allText='全部科系'}={}){
  const sel=document.getElementById(id);
  if(!sel)return;
  const ud=getUD();
  const entries=Object.entries(ud.depts||{});
  const old=sel.value;
  const oldOK=old&&((old==='all'&&includeAll)||ud.depts?.[old]);
  let selected=oldOK?old:(includeAll?'all':(currentDept||entries[0]?.[0]||''));
  sel.innerHTML=getDeptOptionsHTML(selected,{includeAll,allText});
  if(selected)sel.value=selected;
}
function syncDeptSelectors(){
  fillDeptSelect('dash-dept-filter',{includeAll:true,allText:'全部科系'});
  fillDeptSelect('f-dept',{includeAll:true,allText:'全部科系'});
  fillDeptSelect('tt-dept-filter',{includeAll:true,allText:'全部科系'});
  fillDeptSelect('rem-dept-filter',{includeAll:true,allText:'全部科系'});
  fillDeptSelect('a-dept',{includeAll:false});
  fillDeptSelect('xl-import-dept',{includeAll:false});
  fillDeptSelect('clear-dept',{includeAll:false});
}
function getDeptEntriesByFilter(filterValue){
  const ud=getUD();
  const depts=ud.depts||{};
  const target=filterValue||'all';
  return target==='all'?Object.entries(depts):(depts[target]?[[target,depts[target]]]:[]);
}
function getCourseRefsByDeptFilter(filterValue){
  return getDeptEntriesByFilter(filterValue).flatMap(([deptId,dept])=>(dept.courses||[]).map(course=>({deptId,dept,course:{...course,_deptId:deptId}})));
}
function findCourseRef(id,ud=getUD()){
  for(const [deptId,dept] of Object.entries(ud.depts||{})){
    const list=dept.courses||[];
    const course=list.find(c=>c.id===id);
    if(course)return {ud,deptId,dept,list,course};
  }
  return null;
}
 
// ═══ AUTH：Firebase Authentication + Firestore ═══
function firebaseReady(timeout=8000){
  return new Promise((resolve,reject)=>{
    if(window.PASSFirebase)return resolve(window.PASSFirebase);
    const started=Date.now();
    const timer=setInterval(()=>{
      if(window.PASSFirebase){clearInterval(timer);resolve(window.PASSFirebase);}
      else if(Date.now()-started>timeout){clearInterval(timer);reject(new Error('Firebase 尚未載入，請確認 firebase-pass.js 已加入 index.html，且 firebaseConfig 已貼上。'));}
    },100);
  });
}
function authMsg(id,msg){const el=document.getElementById(id);if(el)el.textContent=msg||'';}
function fbErrorMessage(error){
  const code=error?.code||'';
  const map={
    'auth/invalid-email':'Email 格式不正確',
    'auth/user-not-found':'此 Email 尚未註冊',
    'auth/wrong-password':'密碼錯誤',
    'auth/invalid-credential':'Email 或密碼錯誤',
    'auth/email-already-in-use':'此 Email 已註冊',
    'auth/weak-password':'密碼強度不足，請至少 6 個字元',
    'auth/too-many-requests':'嘗試次數過多，請稍後再試',
    'auth/network-request-failed':'網路連線失敗，請確認網路'
  };
  return map[code]||error?.message||'發生未知錯誤';
}
function ensureLocalUser(uid,ud){
  const db=loadDB();
  db.users[uid]=ud;
  saveDB(db);
}
async function loadFirebaseUserData(user){
  const fb=await firebaseReady();
  let ud=null;
  try{ud=await fb.loadPassData();}
  catch(err){console.warn('Firestore 讀取失敗，改用本機快取',err);}
  if(!ud||typeof ud!=='object'||!ud.depts){
    const cached=loadDB().users[user.uid];
    ud=cached&&cached.depts?cached:{
      name:user.displayName||user.email?.split('@')[0]||'使用者',
      email:user.email||'',
      depts:{},
      createdAt:new Date().toISOString()
    };
  }
  ud.email=ud.email||user.email||'';
  ensureLocalUser(user.uid,ud);
  return ud;
}
async function enterFirebaseApp(user){
  await loadFirebaseUserData(user);
  enterApp(user.uid);
}
function switchAuthTab(t){
  document.getElementById('tab-login').style.display=t==='login'?'block':'none';
  document.getElementById('tab-register').style.display=t==='register'?'block':'none';
  document.querySelectorAll('.auth-tab').forEach((el,i)=>el.classList.toggle('active',(t==='login'&&i===0)||(t==='register'&&i===1)));
}
async function doLogin(){
  const email=document.getElementById('l-user').value.trim();
  const p=document.getElementById('l-pass').value;
  authMsg('l-err','');
  if(!email||!p){authMsg('l-err','請輸入 Email 與密碼');return;}
  try{
    authMsg('l-err','登入中...');
    const fb=await firebaseReady();
    const user=await fb.passLogin(email,p);
    authMsg('l-err','');
    await enterFirebaseApp(user);
    toast('✅ 已登入並同步雲端資料','ok');
  }catch(error){
    authMsg('l-err','登入失敗：'+fbErrorMessage(error));
  }
}
async function doRegister(){
  const name=document.getElementById('r-name').value.trim();
  const email=document.getElementById('r-user').value.trim();
  const p=document.getElementById('r-pass').value;
  const p2=document.getElementById('r-pass2').value;
  const err=s=>authMsg('r-err',s);
  err('');
  if(!name||!email){err('請填寫姓名與 Email');return;}
  if(!/^\S+@\S+\.\S+$/.test(email)){err('請輸入正確 Email，例如 test@gmail.com');return;}
  if(p.length<6){err('密碼至少 6 個字元');return;}
  if(p!==p2){err('兩次密碼不一致');return;}
  try{
    err('建立帳號中...');
    const fb=await firebaseReady();
    const user=await fb.passRegister(email,p);
    currentUser=user.uid;
    const ud={name,email:user.email||email,depts:{},createdAt:new Date().toISOString()};
    ensureLocalUser(user.uid,ud);
    await fb.savePassData(ud);
    err('');
    enterApp(user.uid);
    toast('✅ 帳號已建立，資料會同步到 Firestore','ok');
  }catch(error){
    err('註冊失敗：'+fbErrorMessage(error));
  }
}
async function doLogout(){
  try{
    if(window.PASSFirebase)await window.PASSFirebase.passLogout();
  }catch(err){console.warn('Firebase 登出失敗',err);}
  currentUser=null;currentDept=null;
  document.getElementById('auth-screen').style.display='flex';
  document.getElementById('app-screen').classList.remove('visible');
}
function enterApp(u){
  currentUser=u;
  const ud=getUD();
  const ids=Object.keys(ud.depts||{});
  currentDept=ids.length?ids[0]:null;
  document.getElementById('auth-screen').style.display='none';
  document.getElementById('app-screen').classList.add('visible');
  updateSidebar();showPage('dashboard');
}
window.addEventListener('DOMContentLoaded',()=>{
  firebaseReady(12000).then(fb=>{
    fb.watchPassAuth(async user=>{
      if(user&&!currentUser){
        try{await enterFirebaseApp(user);}
        catch(err){console.warn('自動登入同步失敗',err);}
      }
    });
  }).catch(err=>console.warn(err.message));
});
 
// ═══ SIDEBAR ═══
function updateSidebar(){
  const ud=getUD();
  document.getElementById('sb-avatar').textContent=(ud.name||'U')[0].toUpperCase();
  document.getElementById('sb-name').textContent=ud.name||ud.email||currentUser;
  const count=Object.keys(ud.depts||{}).length;
  document.getElementById('sb-dept').textContent=count?`共 ${count} 個科系 · 各頁自由篩選`:'尚未設定科系';
  syncDeptSelectors();
}
function switchDept(id){
  currentDept=id||currentDept||null;
  updateSidebar();
  const p=document.querySelector('.page.active');if(p)showPage(p.id.replace('page-',''));
}
 
// ═══ PAGES ═══
const PAGES=['dashboard','courses','excel','school','timetable','remaining','settings','add'];
function showPage(name){
  const page=document.getElementById('page-'+name);
  if(!page){name='dashboard';}
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.page===name));
  document.getElementById('page-'+name).classList.add('active');
  if(name==='add')document.querySelector('[data-page="courses"]')?.classList.add('active');
  if(['dashboard','add','courses','excel','school','timetable','remaining','settings'].includes(name))syncDeptSelectors();
  ({dashboard:renderDashboard,courses:renderTable,school:renderSchools,timetable:renderTimetable,remaining:renderRemaining,settings:renderSettings}[name]||function(){})();
}
 
// ═══ STATS ═══
const GP={'A+':4,'A':4,'A-':3.7,'B+':3.5,'B':3,'B-':2.7,'C+':2.5,'C':2,'C-':1.7,'D':1,'F':0};
const YEAR_OPTIONS=['大一','大二','大三','大四','自訂'];
const TERM_OPTIONS=['上','下','暑修','全年','其他'];
function normalizeTermText(s){
  s=(s||'').toString().trim();
  if(!s)return '';
  if(s.includes('暑'))return '暑修';
  if(s.includes('全年'))return '全年';
  if(s.includes('上'))return '上';
  if(s.includes('下'))return '下';
  if(s.includes('其他'))return '其他';
  return TERM_OPTIONS.includes(s)?s:'';
}
function getSemesterParts(course){
  const c=course||{};
  let year=(c.year||'').toString().trim();
  let term=normalizeTermText(c.term||'');
  let customYear=(c.customYear||'').toString().trim();
  const sem=(c.sem||'').toString().trim();
  if(!year&&sem){
    const matched=YEAR_OPTIONS.slice(0,4).find(y=>sem.includes(y));
    if(matched){
      year=matched;
      term=term||normalizeTermText(sem.replace(matched,'').trim()||sem);
    }else{
      year='自訂';
      term=term||normalizeTermText(sem);
      customYear=sem.replace(/(上學期|下學期|上|下|暑修|全年|其他)$/,'').trim()||sem;
    }
  }
  if(year==='自訂'&&!customYear&&sem){
    customYear=sem.replace(/(上學期|下學期|上|下|暑修|全年|其他)$/,'').trim();
  }
  return{year,term,customYear};
}
function buildSemesterText(year,term,customYear){
  const y=year==='自訂'?(customYear||'自訂'):(year||'');
  return [y,term||''].filter(Boolean).join('');
}
function formatCourseSemester(course){
  const p=getSemesterParts(course);
  return buildSemesterText(p.year,p.term,p.customYear);
}
function applySemesterParts(course){
  const p=getSemesterParts(course);
  course.year=p.year;course.term=p.term;course.customYear=p.customYear;
  course.sem=buildSemesterText(p.year,p.term,p.customYear);
  return course;
}

function normalizeDayValue(v){
  v=(v||'').toString().trim();
  if(!v)return '';
  v=v.replace(/星期|禮拜|週|周/g,'').replace('天','日');
  const map={Mon:'一',Monday:'一',Tue:'二',Tuesday:'二',Wed:'三',Wednesday:'三',Thu:'四',Thursday:'四',Fri:'五',Friday:'五',Sat:'六',Saturday:'六',Sun:'日',Sunday:'日'};
  return map[v]||(['一','二','三','四','五','六','日'].includes(v)?v:'');
}
function compressPeriods(nums){
  nums=[...new Set(nums.map(n=>parseInt(n,10)).filter(n=>n>=1&&n<=14))].sort((a,b)=>a-b);
  const parts=[];let start=null,prev=null;
  nums.forEach(n=>{if(start===null){start=prev=n;}else if(n===prev+1){prev=n;}else{parts.push(start===prev?String(start):`${start}-${prev}`);start=prev=n;}});
  if(start!==null)parts.push(start===prev?String(start):`${start}-${prev}`);
  return parts.join(',');
}
function getClassScheduleParts(course){
  const c=course||{};
  let day=normalizeDayValue(c.classDay||'');
  let periods=(c.classPeriods||'').toString().trim();
  if((!day||!periods)&&(c.classTime||'').trim()){
    const slots=parseCourseTimes(c.classTime);
    if(slots.length){
      if(!day)day=['一','二','三','四','五','六','日'][slots[0].day]||'';
      if(!periods){
        const dayIdx=['一','二','三','四','五','六','日'].indexOf(day);
        periods=compressPeriods(slots.filter(s=>s.day===dayIdx).map(s=>s.period));
      }
    }
  }
  return{day,periods};
}
function buildClassTimeText(day,periods){
  day=normalizeDayValue(day);
  periods=(periods||'').toString().trim();
  if(day&&periods)return `星期${day} ${periods} 節`;
  if(day)return `星期${day}`;
  return periods;
}
function getCourseClassTime(course){
  const p=getClassScheduleParts(course);
  return (course?.classTime||'').toString().trim()||buildClassTimeText(p.day,p.periods);
}
function getDeptPrefix(course){
  const deptId=course?._deptId||course?.deptId||currentDept;
  return getDeptLabel(deptId);
}
function courseNameHTML(course){
  const prefix=getDeptPrefix(course);
  const p=prefix?`<span class="dept-prefix">${esc(prefix)}</span>`:'';
  return `<span class="course-title">${p}<span>${esc(course?.name||'')}</span></span>`;
}
function toggleAddCustomYear(){
  const y=document.getElementById('a-year')?.value||'';
  const wrap=document.getElementById('a-custom-year-wrap');
  if(wrap)wrap.style.display=y==='自訂'?'block':'none';
}
function calcStats(dId){
  const ud=getUD();const dept=ud.depts[dId];if(!dept)return null;
  const cs=(dept.courses||[]).filter(c=>normalizeStatus(c.status)==='已修');
  let req=0,elec=0,gen=0,gs=0,gc=0;
  cs.forEach(c=>{const cr=+c.credits||0;if(c.type==='必修')req+=cr;else if(c.type==='選修')elec+=cr;else gen+=cr;if(c.grade&&GP[c.grade]!==undefined){gs+=GP[c.grade]*cr;gc+=cr;}});
  return{req,elec,gen,total:req+elec+gen,gpa:gc>0?gs/gc:null,settings:dept.settings||{req:60,elec:40,gen:20}};
}
function calcStatsByDeptFilter(filterValue){
  const entries=getDeptEntriesByFilter(filterValue||'all');
  let req=0,elec=0,gen=0,gs=0,gc=0;
  const settings={req:0,elec:0,gen:0};
  entries.forEach(([,dept])=>{
    const st={req:60,elec:40,gen:20,...(dept.settings||{})};
    settings.req+=+st.req||0;settings.elec+=+st.elec||0;settings.gen+=+st.gen||0;
    (dept.courses||[]).filter(c=>normalizeStatus(c.status)==='已修').forEach(c=>{
      const cr=+c.credits||0;
      if(c.type==='必修')req+=cr;else if(c.type==='選修')elec+=cr;else gen+=cr;
      if(c.grade&&GP[c.grade]!==undefined){gs+=GP[c.grade]*cr;gc+=cr;}
    });
  });
  return {req,elec,gen,total:req+elec+gen,gpa:gc>0?gs/gc:null,settings,deptCount:entries.length};
}
 
// ═══ DASHBOARD ═══
function renderDashboard(){
  syncDeptSelectors();
  const ud=getUD();
  const deptCount=Object.keys(ud.depts||{}).length;
  if(!deptCount){
    document.getElementById('dash-stats').innerHTML='<div class="empty"><div class="empty-icon">🏫</div>請先到「學校設定」新增學校與科系</div>';
    ['dash-progress','dash-recent'].forEach(id=>document.getElementById(id).innerHTML='');
    document.getElementById('dash-sub').textContent='尚未建立科系';return;
  }
  const deptFilter=document.getElementById('dash-dept-filter')?.value||'all';
  const deptLabel=deptFilter==='all'?'全部科系':getDeptLabel(deptFilter);
  document.getElementById('dash-sub').textContent=deptLabel+'・學分達成狀況';
  const s=calcStatsByDeptFilter(deptFilter);
  const tt=s.settings.req+s.settings.elec+s.settings.gen;
  const pct=tt>0?Math.min(100,Math.round(s.total/tt*100)):0;
  document.getElementById('dash-stats').innerHTML=`
    <div class="stat"><div class="stat-label">已修總學分</div><div class="stat-value">${s.total}</div><div class="stat-sub">目標 ${tt} · ${pct}%</div></div>
    <div class="stat"><div class="stat-label">必修</div><div class="stat-value c-req">${s.req}</div><div class="stat-sub">目標 ${s.settings.req}</div></div>
    <div class="stat"><div class="stat-label">選修</div><div class="stat-value c-elec">${s.elec}</div><div class="stat-sub">目標 ${s.settings.elec}</div></div>
    <div class="stat"><div class="stat-label">通識</div><div class="stat-value c-gen">${s.gen}</div><div class="stat-sub">目標 ${s.settings.gen}</div></div>
    <div class="stat"><div class="stat-label">GPA (4.0)</div><div class="stat-value c-accent">${s.gpa!==null?s.gpa.toFixed(2):'—'}</div><div class="stat-sub">加權平均</div></div>`;
  document.getElementById('dash-progress').innerHTML=[{l:'必修',v:s.req,t:s.settings.req,c:'pf-req'},{l:'選修',v:s.elec,t:s.settings.elec,c:'pf-elec'},{l:'通識',v:s.gen,t:s.settings.gen,c:'pf-gen'}].map(b=>{
    const p=b.t>0?Math.min(100,Math.round(b.v/b.t*100)):0;
    return `<div class="prog-row"><div class="prog-label">${b.l}</div><div class="prog-track"><div class="prog-fill ${b.c}" style="width:${p}%"></div></div><div class="prog-nums ${b.v>=b.t?'done':''}">${b.v} / ${b.t}</div></div>`;
  }).join('');
  const recent=getCourseRefsByDeptFilter(deptFilter).map(ref=>ref.course).reverse().slice(0,6);
  document.getElementById('dash-recent').innerHTML=recent.length?`<table><thead><tr><th>科系</th><th>課程</th><th>類別</th><th>學分</th><th>成績</th><th>建議修讀</th></tr></thead><tbody>${recent.map(c=>`<tr><td><span class="dept-prefix">${esc(getDeptPrefix(c))}</span></td><td>${courseNameHTML(c)}</td><td><span class="badge b-${c.type==='必修'?'req':c.type==='選修'?'elec':'gen'}">${c.type}</span></td><td><input class="inline-edit inline-credit" type="number" min="0" max="12" step="0.5" value="${esc(c.credits??0)}" onchange="updateCourseField('${c.id}','credits',this.value)" onkeydown="if(event.key==='Enter')this.blur()"></td><td style="font-family:'DM Mono',monospace;font-weight:600">${c.grade||'—'}</td><td>${formatCourseSemester(c)?`<span class="sem-badge">${formatCourseSemester(c)}</span>`:''}</td></tr>`).join('')}</tbody></table>`:'<div class="empty"><div class="empty-icon">📭</div>目前範圍內還沒有課程。</div>';
}
 
// ═══ TABLE ═══
function resetCourseFilters(){
  const ids=['f-status','f-type','f-year','f-term','f-search'];
  ids.forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.value='';
  });
}
function renderTable(){
  syncDeptSelectors();
  const colCount=13;
  const ud=getUD();
  if(!Object.keys(ud.depts||{}).length){document.getElementById('course-tbody').innerHTML=`<tr><td colspan="${colCount}"><div class="empty">請先到「學校設定」新增科系</div></td></tr>`;return;}
  const deptFilter=document.getElementById('f-dept')?.value||currentDept||'all';
  const courseRefs=getCourseRefsByDeptFilter(deptFilter);
  const tf=document.getElementById('f-type')?.value||'';
  const sf=document.getElementById('f-status')?.value||'';
  const yf=document.getElementById('f-year')?.value||'';
  const termf=document.getElementById('f-term')?.value||'';
  const kw=(document.getElementById('f-search')?.value||'').toLowerCase();
  const filtered=courseRefs.filter(ref=>{
    const c=ref.course;
    const p=getSemesterParts(c);
    const t=getClassScheduleParts(c);
    const deptName=getDeptLabel(ref.deptId);
    const hay=[deptName,c.name,c.courseCode,c.classroom,c.note,t.day,t.periods,getCourseClassTime(c)].map(x=>(x||'').toString().toLowerCase()).join(' ');
    return (!tf||c.type===tf)&&(!sf||normalizeStatus(c.status)===sf)&&(!yf||p.year===yf)&&(!termf||p.term===termf)&&(!kw||hay.includes(kw));
  });
  const tbody=document.getElementById('course-tbody');
  if(!filtered.length){tbody.innerHTML=`<tr><td colspan="${colCount}"><div class="empty"><div class="empty-icon">🔍</div>沒有符合的課程</div></td></tr>`;return;}
  tbody.innerHTML=filtered.map(ref=>{
    const c=ref.course;
    const deptId=ref.deptId;
    const p=getSemesterParts(c);
    const t=getClassScheduleParts(c);
    const typeOptions=['必修','選修','通識'].map(x=>`<option value="${x}" ${c.type===x?'selected':''}>${x}</option>`).join('');
    const yearOptions=['','大一','大二','大三','大四','自訂'].map(y=>`<option value="${y}" ${p.year===y?'selected':''}>${y||'— 未設定 —'}</option>`).join('');
    const termOptions=['','上','下','暑修','全年','其他'].map(x=>`<option value="${x}" ${p.term===x?'selected':''}>${x?({'上':'上學期','下':'下學期','暑修':'暑修','全年':'全年','其他':'其他'}[x]):'— 未設定 —'}</option>`).join('');
    const gradeOptions=['','A+','A','A-','B+','B','B-','C+','C','C-','D','F'].map(g=>`<option value="${g}" ${c.grade===g?'selected':''}>${g||'—'}</option>`).join('');
    const cStatus=normalizeStatus(c.status)||'未修';
    const statusOptions=['已修','修課中','未修','未來計畫'].map(s=>`<option value="${s}" ${cStatus===s?'selected':''}>${s}</option>`).join('');
    const dayOptions=['','一','二','三','四','五','六','日'].map(d=>`<option value="${d}" ${t.day===d?'selected':''}>${d?`星期${d}`:'— 未設定 —'}</option>`).join('');
    const customInput=p.year==='自訂'?`<input class="inline-edit inline-custom-year" type="text" value="${esc(p.customYear||'')}" placeholder="自訂年級" onchange="updateCourseSchedule('${c.id}','customYear',this.value)" onkeydown="if(event.key==='Enter')this.blur()">`:'';
    return `<tr>
      <td><span class="dept-prefix">${esc(getDeptLabel(deptId))}</span></td>
      <td class="course-cell"><div class="course-main">${courseNameHTML(c)}</div><div class="course-code-edit"><span>課號</span><input class="inline-edit inline-code" type="text" value="${esc(c.courseCode||'')}" placeholder="選填" onchange="updateCourseField('${c.id}','courseCode',this.value)" onkeydown="if(event.key==='Enter')this.blur()"></div>${c.note?`<div style="font-size:11px;color:var(--text3);margin-top:4px;">${esc(c.note)}</div>`:''}</td>
      <td><select class="inline-edit" onchange="updateCourseField('${c.id}','type',this.value)">${typeOptions}</select></td>
      <td><input class="inline-edit inline-credit" type="number" min="0" max="12" step="0.5" value="${esc(c.credits??0)}" onchange="updateCourseField('${c.id}','credits',this.value)" onkeydown="if(event.key==='Enter')this.blur()"></td>
      <td><select class="inline-edit" onchange="updateCourseField('${c.id}','grade',this.value)">${gradeOptions}</select></td>
      <td><select class="inline-edit" onchange="updateCourseField('${c.id}','status',this.value)">${statusOptions}</select></td>
      <td><select class="inline-edit inline-year" onchange="updateCourseSchedule('${c.id}','year',this.value)">${yearOptions}</select>${customInput}</td>
      <td><select class="inline-edit inline-term" onchange="updateCourseSchedule('${c.id}','term',this.value)">${termOptions}</select></td>
      <td><select class="inline-edit inline-day" onchange="updateCourseClassSchedule('${c.id}','day',this.value)">${dayOptions}</select></td>
      <td><input class="inline-edit inline-periods" type="text" value="${esc(t.periods||'')}" placeholder="1-2" onchange="updateCourseClassSchedule('${c.id}','periods',this.value)" onkeydown="if(event.key==='Enter')this.blur()"></td>
      <td><input class="inline-edit inline-room" type="text" value="${esc(c.classroom||'')}" placeholder="教室" onchange="updateCourseField('${c.id}','classroom',this.value)" onkeydown="if(event.key==='Enter')this.blur()"></td>
      <td><button class="btn btn-ghost btn-sm" onclick="openCourseSearch('${c.id}')">開啟</button></td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteCourseById('${c.id}')">刪除</button></td>
    </tr>`;
  }).join('');
} 
function updateCourseField(id,field,value){
  const ud=getUD();
  const ref=findCourseRef(id,ud);
  if(!ref){toast('找不到這門課','err');return;}
  const {list,course}=ref;
  if(field==='type'&&!['必修','選修','通識'].includes(value)){toast('類別格式錯誤','err');return;}
  if(field==='status'){
    value=normalizeStatus(value);
    if(!value){toast('狀態格式錯誤','err');return;}
  }
  if(field==='grade')value=normalizeGrade(value);
  if(field==='credits'){
    const n=parseFloat(value);
    if(!Number.isFinite(n)||n<0||n>30){toast('學分數格式錯誤','err');return;}
    value=n;
  }
  if(['courseCode','teacher','classTime','classroom','classDay','classPeriods'].includes(field))value=(value||'').trim();
  if(!['type','status','grade','credits','courseCode','teacher','classTime','classroom','classDay','classPeriods'].includes(field)){toast('欄位格式錯誤','err');return;}
  course[field]=value;
  saveUD(ud);
  if(field==='type'||field==='status'||field==='credits')renderTable();
  if(['status','credits'].includes(field)){
    const page=document.getElementById('page-timetable');
    if(page&&page.classList.contains('active'))renderTimetable();
  }
  if(['classTime','classroom','teacher','classDay','classPeriods'].includes(field)){
    warnCourseConflicts(course,list);
    const page=document.getElementById('page-timetable');
    if(page&&page.classList.contains('active'))renderTimetable();
  }
  toast('✅ 課程已更新','ok');
}
function updateCourseSchedule(id,field,value){
  const ud=getUD();
  const ref=findCourseRef(id,ud);
  if(!ref){toast('找不到這門課','err');return;}
  const {list,course}=ref;
  const p=getSemesterParts(course);
  course.year=p.year;course.term=p.term;course.customYear=p.customYear;
  if(field==='year'){
    course.year=value||'';
    if(course.year!=='自訂')course.customYear='';
  }
  if(field==='term')course.term=normalizeTermText(value);
  if(field==='customYear'){
    course.year='自訂';
    course.customYear=(value||'').trim();
  }
  course.sem=buildSemesterText(course.year,course.term,course.customYear);
  saveUD(ud);
  warnCourseConflicts(course,list);
  const page=document.getElementById('page-timetable');
  if(page&&page.classList.contains('active'))renderTimetable();
  if(field==='year'||field==='term')renderTable();
  toast('✅ 學期已更新','ok');
}

function updateCourseClassSchedule(id,field,value){
  const ud=getUD();
  const ref=findCourseRef(id,ud);
  if(!ref){toast('找不到這門課','err');return;}
  const {list,course}=ref;
  const p=getClassScheduleParts(course);
  if(field==='day')course.classDay=normalizeDayValue(value);
  if(field==='periods')course.classPeriods=(value||'').toString().trim();
  const latest=getClassScheduleParts({...course,classTime:''});
  course.classTime=buildClassTimeText(latest.day,latest.periods);
  saveUD(ud);
  warnCourseConflicts(course,list);
  const page=document.getElementById('page-timetable');
  if(page&&page.classList.contains('active'))renderTimetable();
  toast('已更新課表時間','ok');
}

// ═══ ADD ═══
function addCourse(){
  const targetDept=document.getElementById('a-dept')?.value||currentDept;
  if(!targetDept){toast('請先選擇科系','err');return;}
  const name=document.getElementById('a-name').value.trim();
  if(!name){toast('請輸入課程名稱','err');return;}
  const year=document.getElementById('a-year')?.value||'';
  const term=document.getElementById('a-term')?.value||'';
  const customYear=document.getElementById('a-custom-year')?.value.trim()||'';
  const ud=getUD();
  if(!ud.depts[targetDept]){toast('找不到科系','err');return;}
  if(!ud.depts[targetDept].courses)ud.depts[targetDept].courses=[];
  ud.depts[targetDept].courses.push({
    id:Date.now().toString(36)+Math.random().toString(36).slice(2,5),
    name,type:document.getElementById('a-type').value,
    credits:+document.getElementById('a-credits').value||0,
    grade:document.getElementById('a-grade').value,
    status:document.getElementById('a-status').value,
    courseCode:document.getElementById('a-course-code')?.value.trim()||'',
    teacher:'',
    classDay:document.getElementById('a-class-day')?.value||'',
    classPeriods:document.getElementById('a-class-periods')?.value.trim()||'',
    classTime:buildClassTimeText(document.getElementById('a-class-day')?.value||'',document.getElementById('a-class-periods')?.value.trim()||''),
    classroom:document.getElementById('a-classroom')?.value.trim()||'',
    year,term,customYear,
    sem:buildSemesterText(year,term,customYear),
    note:document.getElementById('a-note').value.trim()
  });
  currentDept=targetDept;
  saveUD(ud);
  const fDept=document.getElementById('f-dept');if(fDept)fDept.value=targetDept;
  const ttDept=document.getElementById('tt-dept-filter');if(ttDept)ttDept.value=targetDept;
  updateSidebar();
  const daySel=document.getElementById('a-class-day');if(daySel)daySel.value='';
  ['a-name','a-grade','a-note','a-course-code','a-class-periods','a-classroom'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('a-year').value='';
  document.getElementById('a-term').value='';
  document.getElementById('a-custom-year').value='';
  toggleAddCustomYear();
  toast('✅ 課程已新增！','ok');
  showPage('courses');
}
 
// ═══ DELETE ═══
function deleteCourseById(id){
  const ref=findCourseRef(id);
  if(!ref){toast('找不到這門課','err');return;}
  deleteCourse(id,ref.course.name||'這門課');
}
function deleteCourse(id,name){
  openModal('刪除課程',`確定要刪除「${name}」？`,()=>{
    const ud=getUD();
    const ref=findCourseRef(id,ud);
    if(!ref){toast('找不到這門課','err');return;}
    ud.depts[ref.deptId].courses=(ud.depts[ref.deptId].courses||[]).filter(c=>c.id!==id);
    saveUD(ud);renderTable();toast('已刪除','ok');
  });
}
 
// ═══ REMAINING ═══
function renderRemaining(){
  syncDeptSelectors();
  const ud=getUD();
  if(!Object.keys(ud.depts||{}).length){document.getElementById('rem-content').innerHTML='<div class="empty">請先到「學校設定」新增科系</div>';document.getElementById('future-courses').innerHTML='';return;}
  const deptFilter=document.getElementById('rem-dept-filter')?.value||'all';
  const deptLabel=deptFilter==='all'?'全部科系':getDeptLabel(deptFilter);
  const s=calcStatsByDeptFilter(deptFilter);
  const rR=Math.max(0,s.settings.req-s.req),rE=Math.max(0,s.settings.elec-s.elec),rG=Math.max(0,s.settings.gen-s.gen),rT=rR+rE+rG;
  document.getElementById('rem-content').innerHTML=`
    <div class="notice green">目前計算範圍：<strong>${esc(deptLabel)}</strong></div>
    ${rT===0?'<div class="card" style="text-align:center;padding:2rem;border-color:var(--gen)"><div style="font-size:40px;margin-bottom:8px">🎓</div><div style="font-size:18px;font-weight:700;margin-bottom:4px">恭喜！學分已達標！</div></div>':''}
    <div class="rem-grid">
      <div class="rem-card"><div style="font-size:11px;color:var(--text3);font-weight:600">必修還差</div><div class="rem-num c-req">${rR}</div><div class="rem-sub">已修 ${s.req} / 目標 ${s.settings.req}</div></div>
      <div class="rem-card"><div style="font-size:11px;color:var(--text3);font-weight:600">選修還差</div><div class="rem-num c-elec">${rE}</div><div class="rem-sub">已修 ${s.elec} / 目標 ${s.settings.elec}</div></div>
      <div class="rem-card"><div style="font-size:11px;color:var(--text3);font-weight:600">通識還差</div><div class="rem-num c-gen">${rG}</div><div class="rem-sub">已修 ${s.gen} / 目標 ${s.settings.gen}</div></div>
      <div class="rem-card"><div style="font-size:11px;color:var(--text3);font-weight:600">合計還差</div><div class="rem-num c-accent">${rT}</div><div class="rem-sub">已修 ${s.total} / 目標 ${s.settings.req+s.settings.elec+s.settings.gen}</div></div>
    </div>`;
  const fc=getCourseRefsByDeptFilter(deptFilter).map(ref=>ref.course).filter(c=>c.status==='未來計畫');
  document.getElementById('future-courses').innerHTML=fc.length?`<table><thead><tr><th>科系</th><th>課程</th><th>類別</th><th>學分</th><th>建議修讀</th></tr></thead><tbody>${fc.map(c=>`<tr><td><span class="dept-prefix">${esc(getDeptPrefix(c))}</span></td><td>${courseNameHTML(c)}</td><td><span class="badge b-${c.type==='必修'?'req':c.type==='選修'?'elec':'gen'}">${c.type}</span></td><td><input class="inline-edit inline-credit" type="number" min="0" max="12" step="0.5" value="${esc(c.credits??0)}" onchange="updateCourseField('${c.id}','credits',this.value)" onkeydown="if(event.key==='Enter')this.blur()"></td><td>${formatCourseSemester(c)?`<span class="sem-badge">${formatCourseSemester(c)}</span>`:''}</td></tr>`).join('')}</tbody></table>`:'<div class="empty" style="padding:1.5rem">目前範圍內尚無「未來計畫」課程</div>';
}
 

// ═══ SCHOOL SETTINGS ═══
function ensureSchools(ud){if(!ud.schools)ud.schools={};return ud.schools;}
function getSchools(){const ud=getUD();return ensureSchools(ud);}
function getSchoolById(id){const schools=getSchools();return id?schools[id]||null:null;}
function getSchoolForDept(dept){return getSchoolById(dept?.schoolId||'');}
function getSchoolForCurrentDept(){return getSchoolForDept(getActiveDept());}
function schoolOptionsHTML(selected){
  const schools=getSchools();
  const entries=Object.entries(schools);
  return '<option value="">— 未綁定 —</option>'+entries.map(([id,sc])=>`<option value="${id}" ${selected===id?'selected':''}>${esc(sc.name||'未命名學校')}</option>`).join('');
}
function deptSettingsDefault(){return {req:60,elec:40,gen:20};}
function getDeptEntriesBySchool(schoolId){
  const ud=getUD();
  return Object.entries(ud.depts||{}).filter(([,d])=>(d.schoolId||'')===schoolId);
}
function createDeptForSchool(ud,schoolId,name,short){
  const deptId='dept_'+Date.now()+'_'+Math.floor(Math.random()*1000);
  ud.depts=ud.depts||{};
  ud.depts[deptId]={name,short:short||'',schoolId,settings:deptSettingsDefault(),courses:[]};
  if(!currentDept)currentDept=deptId;
  return deptId;
}
function renderSchoolDeptBindings(){renderSchools();}
function renderSchools(){
  const ud=getUD();
  const schools=ensureSchools(ud);
  Object.values(schools).forEach(sc=>{delete sc.apiUrl;delete sc.apiParam;delete sc.fieldMap;});
  saveUD(ud);
  const list=document.getElementById('school-list-ui');
  if(list){
    const entries=Object.entries(schools);
    list.innerHTML=entries.length?entries.map(([id,sc])=>{
      const depts=getDeptEntriesBySchool(id);
      const deptHTML=depts.length?depts.map(([deptId,d])=>`<span class="school-dept-pill">${esc(d.name||'未命名科系')}${d.short?`／${esc(d.short)}`:''}</span>`).join(''):'<div class="school-mini">這個學校目前還沒有綁定科系。</div>';
      return `
      <div class="school-card">
        <div class="school-card-head">
          <div class="form-group"><label>學校名稱</label><input class="inline-edit" value="${esc(sc.name||'')}" onchange="updateSchoolField('${id}','name',this.value)" onkeydown="if(event.key==='Enter')this.blur()"></div>
          <div class="form-group"><label>課程查詢網址</label><input class="inline-edit" value="${esc(sc.courseUrl||'')}" placeholder="貼上學校課程查詢系統網址" onchange="updateSchoolField('${id}','courseUrl',this.value)" onkeydown="if(event.key==='Enter')this.blur()"></div>
          <button class="btn btn-danger btn-sm" onclick="deleteSchool('${id}','${(sc.name||'').replace(/'/g,"\\'")}' )">刪除學校</button>
        </div>
        <div class="school-dept-list">
          <div style="font-size:12px;font-weight:800;color:var(--text2);margin-bottom:.45rem;">已綁定科系</div>
          <div>${deptHTML}</div>
          <div class="school-add-dept">
            <div class="form-group" style="margin:0;"><label>新增此學校的科系</label><input id="school-dept-name-${id}" class="inline-edit" placeholder="例：公共衛生學系"></div>
            <div class="form-group" style="margin:0;"><label>簡稱</label><input id="school-dept-short-${id}" class="inline-edit" placeholder="例：公衛"></div>
            <button class="btn btn-ghost btn-sm" onclick="addDeptToSchool('${id}')">➕ 新增科系</button>
          </div>
        </div>
      </div>`;
    }).join(''):'<div class="empty">尚未建立學校，請在上方新增學校與科系。</div>';
  }
}
function addSchoolWithDept(){
  const schoolName=document.getElementById('new-school-name')?.value.trim()||'';
  const deptName=document.getElementById('new-school-dept-name')?.value.trim()||'';
  const deptShort=document.getElementById('new-school-dept-short')?.value.trim()||'';
  const courseUrl=document.getElementById('new-school-url')?.value.trim()||'';
  if(!schoolName){toast('請輸入學校名稱','err');return;}
  if(!deptName){toast('請輸入科系名稱','err');return;}
  const ud=getUD();
  const schools=ensureSchools(ud);
  const schoolId='school_'+Date.now();
  schools[schoolId]={name:schoolName,courseUrl};
  createDeptForSchool(ud,schoolId,deptName,deptShort);
  saveUD(ud);
  ['new-school-name','new-school-dept-name','new-school-dept-short','new-school-url'].forEach(x=>{const el=document.getElementById(x);if(el)el.value='';});
  updateSidebar();renderSchools();renderSettings();renderSettingsSchoolSelectOnly();
  toast('✅ 已新增學校並綁定科系','ok');
}
function addSchool(){addSchoolWithDept();}
function addDeptToSchool(schoolId){
  const nameEl=document.getElementById(`school-dept-name-${schoolId}`);
  const shortEl=document.getElementById(`school-dept-short-${schoolId}`);
  const name=nameEl?.value.trim()||'';
  const short=shortEl?.value.trim()||'';
  if(!name){toast('請輸入科系名稱','err');return;}
  const ud=getUD();
  const schools=ensureSchools(ud);
  if(!schools[schoolId]){toast('找不到學校','err');return;}
  createDeptForSchool(ud,schoolId,name,short);
  saveUD(ud);
  if(nameEl)nameEl.value='';
  if(shortEl)shortEl.value='';
  updateSidebar();renderSchools();renderSettings();renderSettingsSchoolSelectOnly();
  toast('✅ 已新增科系並綁定學校','ok');
}
function updateSchoolField(id,field,value){
  const ud=getUD();const schools=ensureSchools(ud);const sc=schools[id];
  if(!sc){toast('找不到學校','err');return;}
  if(!['name','courseUrl'].includes(field)){toast('欄位格式錯誤','err');return;}
  value=(value||'').trim();
  if(field==='name'&&!value){toast('學校名稱不能空白','err');renderSchools();return;}
  sc[field]=value;delete sc.apiUrl;delete sc.apiParam;delete sc.fieldMap;
  saveUD(ud);renderSchools();renderSettingsSchoolSelectOnly();toast('✅ 學校設定已更新','ok');
}
function deleteSchool(id,name){
  openModal('刪除學校',`確定要刪除「${name}」？已綁定此學校的科系會改為未綁定。`,()=>{
    const ud=getUD();const schools=ensureSchools(ud);delete schools[id];
    Object.values(ud.depts||{}).forEach(d=>{if(d.schoolId===id)d.schoolId='';});
    saveUD(ud);renderSchools();renderSettings();renderSettingsSchoolSelectOnly();updateSidebar();toast('已刪除學校','ok');
  });
}
function updateDeptSchool(deptId,schoolId){
  const ud=getUD();const d=ud.depts?.[deptId];
  if(!d){toast('找不到科系','err');return;}
  d.schoolId=schoolId||'';saveUD(ud);updateSidebar();renderSchools();renderSettingsSchoolSelectOnly();toast('✅ 科系已綁定學校','ok');
}
function renderSettingsSchoolSelectOnly(){
  const sel=document.getElementById('new-dept-school');
  if(sel)sel.innerHTML=schoolOptionsHTML(sel.value||'');
}
function findCourseById(id){
  const ref=findCourseRef(id);
  return ref?{...ref.course,_deptId:ref.deptId}:null;
}
function buildSchoolSearchUrl(school,course){
  const base=(school?.courseUrl||'').trim();
  if(!base)return '';
  const code=encodeURIComponent(course?.courseCode||'');
  const name=encodeURIComponent(course?.name||'');
  const keyword=encodeURIComponent(course?.courseCode||course?.name||'');
  if(base.includes('{keyword}')||base.includes('{code}')||base.includes('{name}')){
    return base.replaceAll('{keyword}',keyword).replaceAll('{code}',code).replaceAll('{name}',name);
  }
  return base;
}
function openCourseSearch(courseId){
  const ref=findCourseRef(courseId);
  const course=ref?{...ref.course,_deptId:ref.deptId}:null;
  const school=ref?getSchoolForDept(ref.dept):getSchoolForCurrentDept();
  if(!school||!school.courseUrl){toast('請先到「學校設定」填寫課程查詢系統網址','err');showPage('school');return;}
  const url=buildSchoolSearchUrl(school,course);
  if(!url){toast('課程查詢網址尚未設定','err');return;}
  window.open(url,'_blank');
}

// ═══ TIMETABLE ═══
const TT_DAYS=['一','二','三','四','五','六','日'];
const TT_DAY_LABELS=['星期一','星期二','星期三','星期四','星期五','星期六','星期日'];
const TT_PERIODS=Array.from({length:14},(_,i)=>i+1);
function normalizeClassTimeText(text){
  return (text||'').toString()
    .replace(/Monday|Mon\.?/ig,'星期一').replace(/Tuesday|Tue\.?/ig,'星期二').replace(/Wednesday|Wed\.?/ig,'星期三')
    .replace(/Thursday|Thu\.?/ig,'星期四').replace(/Friday|Fri\.?/ig,'星期五').replace(/Saturday|Sat\.?/ig,'星期六').replace(/Sunday|Sun\.?/ig,'星期日')
    .replace(/禮拜/g,'星期').replace(/周/g,'週').replace(/星期天/g,'星期日').replace(/週天/g,'週日');
}
function parseCourseTimes(text){
  const s=normalizeClassTimeText(text);
  const dayRegex=/(星期|週)?([一二三四五六日天])/g;
  const matches=[...s.matchAll(dayRegex)];
  const out=[];
  matches.forEach((m,idx)=>{
    const dayChar=m[2]==='天'?'日':m[2];
    const day=TT_DAYS.indexOf(dayChar);
    if(day<0)return;
    const next=matches[idx+1]?.index ?? s.length;
    const block=s.slice(m.index,next);
    const nums=[...block.matchAll(/(\d{1,2})(?:\s*(?:-|~|～|至|到)\s*(\d{1,2}))?/g)];
    nums.forEach(nm=>{
      let a=parseInt(nm[1],10),b=nm[2]?parseInt(nm[2],10):a;
      if(!Number.isFinite(a)||!Number.isFinite(b))return;
      if(a>b){const tmp=a;a=b;b=tmp;}
      for(let p=a;p<=b;p++){
        if(p>=1&&p<=14)out.push({day,period:p});
      }
    });
  });
  const seen=new Set();
  return out.filter(x=>{const k=x.day+'-'+x.period;if(seen.has(k))return false;seen.add(k);return true;});
}
function timetableStatusOK(course,filter){
  if(filter==='all')return true;
  if(filter==='active')return ['修課中','未修','未來計畫'].includes(course.status||'');
  return course.status===filter;
}

function samePlanningTerm(a,b){
  const pa=getSemesterParts(a),pb=getSemesterParts(b);
  const ya=pa.year==='自訂'?(pa.customYear||'自訂'):pa.year;
  const yb=pb.year==='自訂'?(pb.customYear||'自訂'):pb.year;
  if(ya&&yb&&ya!==yb)return false;
  if(pa.term&&pb.term&&pa.term!==pb.term)return false;
  return true;
}
function findCourseConflicts(course,courses){
  const slots=parseCourseTimes(getCourseClassTime(course));
  if(!slots.length)return [];
  const activeStatus=['修課中','未修','未來計畫'];
  const result=[];
  courses.forEach(other=>{
    if(!other||other.id===course.id)return;
    if(!activeStatus.includes(other.status||''))return;
    if(!samePlanningTerm(course,other))return;
    const otherSlots=parseCourseTimes(getCourseClassTime(other));
    const hits=slots.filter(a=>otherSlots.some(b=>a.day===b.day&&a.period===b.period));
    if(hits.length)result.push({course:other,slots:hits});
  });
  return result;
}
function warnCourseConflicts(course,courses){return;}

function planningGroupLabel(course){
  const p=getSemesterParts(course);
  const y=p.year==='自訂'?(p.customYear||'自訂'):(p.year||'未設定年級');
  const t=p.term||'未設定學期';
  return `${y}${t}`;
}
function groupConflictingCourses(list){
  const groups={};
  (list||[]).forEach(c=>{const k=planningGroupLabel(c);(groups[k]||(groups[k]=[])).push(c);});
  return Object.entries(groups).filter(([,items])=>items.length>1).map(([label,items])=>({label,items}));
}
function cellHasConflict(list){return false;}

function renderTimetable(){
  syncDeptSelectors();
  const table=document.getElementById('course-timetable');
  const unplaced=document.getElementById('tt-unplaced');
  const summary=document.getElementById('tt-summary');
  const conflictBox=document.getElementById('tt-conflicts');
  if(!table)return;
  const ud=getUD();
  if(!Object.keys(ud.depts||{}).length){table.innerHTML='<tr><td><div class="empty">請先到「學校設定」新增科系</div></td></tr>';if(unplaced)unplaced.innerHTML='';if(conflictBox)conflictBox.style.display='none';return;}
  const deptFilter=document.getElementById('tt-dept-filter')?.value||currentDept||'all';
  const filter=document.getElementById('tt-status-filter')?.value||'active';
  const yearFilter=document.getElementById('tt-year-filter')?.value||'';
  const termFilter=document.getElementById('tt-term-filter')?.value||'';
  const courses=getCourseRefsByDeptFilter(deptFilter).map(ref=>ref.course).filter(c=>{
    const sp=getSemesterParts(c);
    return timetableStatusOK(c,filter)&&(!yearFilter||sp.year===yearFilter)&&(!termFilter||sp.term===termFilter);
  });
  const matrix={};
  const noTime=[];const badTime=[];
  courses.forEach(c=>{
    const classTime=getCourseClassTime(c);
    if(!classTime.trim()){noTime.push(c);return;}
    const slots=parseCourseTimes(classTime);
    if(!slots.length){badTime.push(c);return;}
    slots.forEach(slot=>{
      const key=slot.period+'-'+slot.day;
      if(!matrix[key])matrix[key]=[];
      matrix[key].push(c);
    });
  });
  const placedIds=new Set();
  Object.values(matrix).forEach(list=>list.forEach(c=>placedIds.add((c._deptId||'')+'::'+c.id)));
  if(summary){
    summary.style.display='block';
    summary.className='notice green';
    const deptLabel=deptFilter==='all'?'全部科系':getDeptLabel(deptFilter);
    summary.innerHTML=`✅ 已排入 <strong>${placedIds.size}</strong> 門課。顯示範圍：<strong>${esc(deptLabel)}</strong>${yearFilter||termFilter?'（已套用年級/學期篩選）':''}`;
  }
  if(conflictBox){conflictBox.style.display='none';conflictBox.innerHTML='';}
  table.innerHTML=`<thead><tr><th>節次</th>${TT_DAY_LABELS.map(d=>`<th>${d}</th>`).join('')}</tr></thead><tbody>`+
    TT_PERIODS.map(p=>`<tr><td>第 ${p} 節</td>${TT_DAYS.map((d,dayIdx)=>{
      const list=matrix[p+'-'+dayIdx]||[];
      return `<td>${list.map(c=>`<div class="tt-course"><strong>${courseNameHTML(c)}</strong>${c.teacher?`<span>👤 ${esc(c.teacher)}</span>`:''}${c.classroom?`<span>📍 ${esc(c.classroom)}</span>`:''}<span>${esc(getCourseClassTime(c)||'')}</span></div>`).join('')}</td>`;
    }).join('')}</tr>`).join('')+'</tbody>';
  if(unplaced){
    const rows=[...badTime.map(c=>({c,reason:'時間格式無法判讀'})),...noTime.map(c=>({c,reason:'尚未填寫上課時間'}))];
    unplaced.innerHTML=rows.length?`<table><thead><tr><th>科系</th><th>課程</th><th>狀態</th><th>原因</th><th>目前時間</th></tr></thead><tbody>${rows.map(r=>`<tr><td><span class="dept-prefix">${esc(getDeptPrefix(r.c))}</span></td><td>${courseNameHTML(r.c)}</td><td>${esc(r.c.status||'')}</td><td>${r.reason}</td><td>${esc(getCourseClassTime(r.c)||'—')}</td></tr>`).join('')}</tbody></table>`:'<div class="empty" style="padding:1.5rem">所有有時間的課程都已排入課表。</div>';
  }
}

// ═══ SETTINGS ═══
function renderSettings(){
  const ud=getUD();
  document.getElementById('dept-list-ui').innerHTML=Object.entries(ud.depts).map(([id,d])=>{
    const s={req:60,elec:40,gen:20,...(d.settings||{})};
    return `
    <div class="dept-setting-row">
      <div class="form-group" style="margin:0;">
        <label>科系名稱</label>
        <input class="inline-edit" type="text" value="${esc(d.name||'')}" onchange="updateDeptField('${id}','name',this.value)" onkeydown="if(event.key==='Enter')this.blur()">
      </div>
      <div class="form-group" style="margin:0;">
        <label>簡稱</label>
        <input class="inline-edit" type="text" value="${esc(d.short||'')}" onchange="updateDeptField('${id}','short',this.value)" onkeydown="if(event.key==='Enter')this.blur()">
      </div>
      <div class="form-group" style="margin:0;">
        <label style="color:var(--req);">必修</label>
        <input class="inline-edit" type="number" min="0" value="${s.req}" onchange="updateDeptSetting('${id}','req',this.value)" onkeydown="if(event.key==='Enter')this.blur()">
      </div>
      <div class="form-group" style="margin:0;">
        <label style="color:var(--elec);">選修</label>
        <input class="inline-edit" type="number" min="0" value="${s.elec}" onchange="updateDeptSetting('${id}','elec',this.value)" onkeydown="if(event.key==='Enter')this.blur()">
      </div>
      <div class="form-group" style="margin:0;">
        <label style="color:var(--gen);">通識</label>
        <input class="inline-edit" type="number" min="0" value="${s.gen}" onchange="updateDeptSetting('${id}','gen',this.value)" onkeydown="if(event.key==='Enter')this.blur()">
      </div>
      <button class="btn btn-danger btn-sm" onclick="deleteDept('${id}','${(d.name||'').replace(/'/g,"\'")}')">刪除</button>
    </div>`;
  }).join('')||'<div style="font-size:13px;color:var(--text3);padding:.5rem 0">尚無科系，請先到「學校設定」新增學校與科系。</div>';
  renderSettingsSchoolSelectOnly();
}
function updateDeptField(id,field,value){
  const ud=getUD();
  const dept=ud.depts[id];
  if(!dept){toast('找不到這個科系','err');return;}
  value=(value||'').trim();
  if(field==='name'&&!value){toast('科系名稱不能空白','err');renderSettings();return;}
  if(!['name','short'].includes(field)){toast('欄位格式錯誤','err');return;}
  dept[field]=value;
  saveUD(ud);
  updateSidebar();
  renderSettings();
  toast('✅ 科系資料已更新','ok');
}
function updateDeptSetting(id,key,value){
  const ud=getUD();
  const dept=ud.depts[id];
  if(!dept){toast('找不到這個科系','err');return;}
  if(!['req','elec','gen'].includes(key)){toast('欄位格式錯誤','err');return;}
  const n=Number(value);
  if(!Number.isFinite(n)||n<0){toast('學分目標請輸入 0 以上的數字','err');renderSettings();return;}
  if(!dept.settings)dept.settings={req:60,elec:40,gen:20};
  dept.settings[key]=Math.round(n*10)/10;
  saveUD(ud);
  renderSettings();
  toast('✅ 學分目標已更新','ok');
}
function getNumberOrDefault(id,defaultValue){
  const el=document.getElementById(id);
  const raw=el?el.value:'';
  if(raw==='')return defaultValue;
  const n=Number(raw);
  return Number.isFinite(n)&&n>=0?n:defaultValue;
}
function addDept(){
  const name=document.getElementById('new-dept-name').value.trim();
  if(!name){toast('請輸入科系名稱','err');return;}
  const id='dept_'+Date.now();
  const ud=getUD();
  ud.depts[id]={name,short:document.getElementById('new-dept-short').value.trim(),schoolId:document.getElementById('new-dept-school')?.value||'',settings:{req:getNumberOrDefault('new-req',60),elec:getNumberOrDefault('new-elec',40),gen:getNumberOrDefault('new-gen',20)},courses:[]};
  saveUD(ud);if(!currentDept)currentDept=id;
  updateSidebar();renderSettings();renderSchoolDeptBindings();
  document.getElementById('new-dept-name').value='';document.getElementById('new-dept-short').value='';
  toast('✅ 科系已新增','ok');
}
function deleteDept(id,name){
  openModal('刪除科系',`確定要刪除「${name}」及其所有課程？`,()=>{
    const ud=getUD();delete ud.depts[id];saveUD(ud);
    if(currentDept===id){const ids=Object.keys(ud.depts);currentDept=ids.length?ids[0]:null;}
    updateSidebar();renderSettings();toast('已刪除','ok');
  });
}
function confirmClear(){
  const targetDept=document.getElementById('clear-dept')?.value||'';
  if(!targetDept){toast('請先選擇要清除的科系','err');return;}
  const ud=getUD();
  const dept=ud.depts?.[targetDept];
  if(!dept){toast('找不到這個科系','err');syncDeptSelectors();return;}
  openModal('清除課程',`確定要清除「${dept?.name}」的所有課程？`,()=>{
    const latest=getUD();
    if(latest.depts?.[targetDept])latest.depts[targetDept].courses=[];
    saveUD(latest);
    renderSettings();renderDashboard();renderTable();renderTimetable();renderRemaining();
    toast('已清除','ok');
  });
}
 
// ═══ EXCEL IMPORT ═══
let xlWorkbook=null,xlSheetName=null,xlSheetData=[];
const XL_FIELDS=[
  {key:'name',label:'課程名稱',required:true},
  {key:'courseCode',label:'課程代碼'},
  {key:'credits',label:'學分'},
  {key:'type',label:'修別（必修/選修/通識）'},
  {key:'status',label:'修課狀態（已修/修課中/未修）'},
  {key:'grade',label:'成績'},
  {key:'sem',label:'建議修讀學期'},
  {key:'teacher',label:'授課老師'},
  {key:'classTime',label:'上課時間'},
  {key:'classroom',label:'教室'},
  {key:'note',label:'備註'}
];
 
function onDrag(e,on){e.preventDefault();document.getElementById('upload-zone').classList.toggle('drag',on);}
function onDrop(e){e.preventDefault();onDrag(e,false);const f=e.dataTransfer.files[0];if(f)processXlFile(f);}
function handleXlFile(e){const f=e.target.files[0];if(f)processXlFile(f);}
 
function processXlFile(file){
  if(typeof XLSX==='undefined'){
    toast('❌ Excel 讀取套件尚未載入，請確認網路連線後重新開啟網頁','err');
    return;
  }
  const reader=new FileReader();
  reader.onload=function(e){
    try{
      xlWorkbook=XLSX.read(e.target.result,{type:'array'});
      renderSheetTabs();
    }catch(err){console.error(err);toast('❌ 無法讀取檔案，請確認格式','err');}
  };
  reader.readAsArrayBuffer(file);
}
 
function renderSheetTabs(){
  xlSheetName=xlWorkbook.SheetNames[0];
  const tabsHtml=xlWorkbook.SheetNames.map(n=>`<div class="xl-tab ${n===xlSheetName?'active':''}" onclick="selectSheet('${n}')">${n}</div>`).join('');
  document.getElementById('xl-sheet-area').innerHTML=`
    <div class="xl-preview">
      <div class="xl-preview-head"><span class="xl-preview-title">📋 檔案預覽</span></div>
      ${xlWorkbook.SheetNames.length>1?`<div class="xl-sheet-tabs">${tabsHtml}</div>`:''}
      <div class="xl-table-wrap"><table class="xl-table" id="xl-preview-table"></table></div>
    </div>`;
  loadSheetPreview();
  document.getElementById('xl-map-card').style.display='block';
  document.getElementById('xl-result-card').style.display='none';
  renderMapRows();
}
 
function selectSheet(name){
  xlSheetName=name;
  document.querySelectorAll('.xl-tab').forEach(t=>t.classList.toggle('active',t.textContent===name));
  loadSheetPreview();
  renderMapRows();
}
 
function loadSheetPreview(){
  const ws=xlWorkbook.Sheets[xlSheetName];
  const data=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
  xlSheetData=data;
  const table=document.getElementById('xl-preview-table');
  if(!data.length){table.innerHTML='<tr><td style="padding:1rem;color:var(--text3)">工作表為空</td></tr>';return;}
  const headers=data[0];
  table.innerHTML=`
    <thead><tr>${headers.map(h=>`<th>${h||''}</th>`).join('')}</tr></thead>
    <tbody>${data.slice(1,11).map(row=>`<tr>${headers.map((_,i)=>`<td>${row[i]||''}</td>`).join('')}</tr>`).join('')}</tbody>`;
}
 

function getCell(row,i){return row&&row[i]!==undefined&&row[i]!==null?row[i].toString().trim():'';}
function parseYearHeader(text){
  const s=(text||'').toString().trim();
  if(!s)return null;
  const zh={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
  let n=null;
  const m1=s.match(/大([一二三四五六七八九])/);
  const m2=s.match(/([一二三四五六七八九])年級/);
  const m3=s.match(/(\d+)\s*年級/);
  if(m1)n=zh[m1[1]];else if(m2)n=zh[m2[1]];else if(m3)n=parseInt(m3[1],10);
  if(!n)return null;
  if(n>=1&&n<=4)return{year:'大'+['','一','二','三','四'][n],customYear:''};
  return{year:'自訂',customYear:'大'+(Object.keys(zh).find(k=>zh[k]===n)||n)};
}
function parseCreditValue(v){
  const s=(v??'').toString().trim();
  if(!s)return null;
  const m=s.match(/\d+(?:\.\d+)?/);
  if(!m)return null;
  const n=parseFloat(m[0]);
  return Number.isFinite(n)?n:null;
}
function detectCreditMatrix(data){
  if(!data||data.length<2)return null;
  const maxRows=Math.min(8,data.length);
  const maxCols=Math.max(...data.slice(0,maxRows).map(r=>r?r.length:0),0);
  for(let r=0;r<maxRows-1;r++){
    const row=data[r]||[],next=data[r+1]||[];
    let nameCol=-1,typeCol=-1,creditCol=-1;
    for(let c=0;c<maxCols;c++){
      const h=getCell(row,c);
      if(nameCol<0&&/(科目名稱|課程名稱|科目|課程名|課名)/.test(h))nameCol=c;
      if(typeCol<0&&/(修別|類別|必選修|選別)/.test(h))typeCol=c;
      if(creditCol<0&&/(學分|學分數|credits?)/i.test(h))creditCol=c;
    }
    if(nameCol<0)continue;
    let currentYear=null,semCols=[];
    for(let c=0;c<maxCols;c++){
      const top=getCell(row,c),sub=getCell(next,c),combo=(top+' '+sub).trim();
      const y=parseYearHeader(top)||parseYearHeader(combo);
      if(y)currentYear=y;
      const term=normalizeTermText(sub)||normalizeTermText(top)||normalizeTermText(combo);
      if(currentYear&&term&&c!==nameCol&&c!==typeCol&&c!==creditCol){
        semCols.push({col:c,year:currentYear.year,term,customYear:currentYear.customYear,label:[currentYear.customYear||currentYear.year,term].filter(Boolean).join('')});
      }
    }
    const seen=new Set();
    semCols=semCols.filter(x=>{const k=x.col+'-'+x.label;if(seen.has(k))return false;seen.add(k);return true;});
    if(semCols.length>=2){
      const headers=[];
      for(let c=0;c<maxCols;c++)headers[c]=[getCell(row,c),getCell(next,c)].filter(Boolean).join(' ')||`欄位 ${c+1}`;
      return{headerRow:r,subHeaderRow:r+1,dataStart:r+2,nameCol,typeCol,creditCol,semCols,headers};
    }
  }
  return null;
}
function getXlHeaderInfo(){
  const matrix=detectCreditMatrix(xlSheetData);
  if(matrix)return{headers:matrix.headers,dataStart:matrix.dataStart,matrix};
  const headers=(xlSheetData[0]||[]).map((h,i)=>getCell(xlSheetData[0],i)||`欄位 ${i+1}`);
  return{headers,dataStart:1,matrix:null};
}
function updateMatrixHint(matrix){
  const box=document.getElementById('xl-matrix-hint');
  if(!box)return;
  if(matrix){
    box.style.display='block';
    box.innerHTML=`✅ 已偵測到矩陣式學分表 <span class="xl-matrix-badge">自動判讀</span><br>系統會以「${esc(matrix.headers[matrix.nameCol]||'科目名稱')}」作為課程名稱，並依照 ${matrix.semCols.map(x=>esc(x.label)).join('、')} 欄位中的數字，自動設定學分、年級與學期。匯入狀態預設為「未修」。`;
  }else{
    box.style.display='none';
    box.innerHTML='';
  }
}


function renderMapRows(){
  if(!xlSheetData.length)return;
  const info=getXlHeaderInfo();
  const headers=info.headers||[];
  updateMatrixHint(info.matrix);
  const opts=['<option value="">— 略過 —</option>',...headers.map((h,i)=>`<option value="${i}">${h||`欄位 ${i+1}`}</option>`)].join('');
  const guess={};
  headers.forEach((h,i)=>{
    const s=(h||'').toString().toLowerCase();
    if(s.includes('課號')||s.includes('代碼')||s.includes('code'))guess['courseCode']=i;
    else if(s.includes('名稱')||s.includes('課程')||s.includes('科目')||s.includes('name'))guess['name']=i;
    else if(s.includes('學分')||s.includes('credit'))guess['credits']=i;
    else if(s.includes('狀態')||s.includes('修課')||s.includes('status')||s.includes('完成'))guess['status']=i;
    else if((s.includes('類別')||s.includes('type')||s.includes('修別')||s.includes('必選修'))&&!s.includes('狀態'))guess['type']=i;
    else if(s.includes('成績')||s.includes('grade')||s.includes('score'))guess['grade']=i;
    else if(s.includes('學期')||s.includes('sem'))guess['sem']=i;
    else if(s.includes('老師')||s.includes('教師')||s.includes('teacher')||s.includes('instructor'))guess['teacher']=i;
    else if(s.includes('時間')||s.includes('節次')||s.includes('time')||s.includes('period'))guess['classTime']=i;
    else if(s.includes('教室')||s.includes('地點')||s.includes('room')||s.includes('classroom'))guess['classroom']=i;
    else if(s.includes('備註')||s.includes('note'))guess['note']=i;
  });
  if(info.matrix){
    guess.name=info.matrix.nameCol;
    if(info.matrix.typeCol>=0)guess.type=info.matrix.typeCol;
    if(info.matrix.creditCol>=0)guess.credits=info.matrix.creditCol;
  }
  document.getElementById('xl-map-rows').innerHTML=XL_FIELDS.map(f=>`
    <div class="map-row" style="display:grid;grid-template-columns:130px 20px 1fr;gap:8px;align-items:center;margin-bottom:8px;">
      <div style="font-size:12px;color:var(--text);font-weight:600">${f.label}${f.required?' <span style="color:var(--danger)">*</span>':''}</div>
      <div style="color:var(--text3);text-align:center">→</div>
      <select id="map-${f.key}" style="font-size:12px;padding:6px 8px;border-radius:7px;border:1px solid var(--border);background:var(--bg3);color:var(--text);font-family:inherit;outline:none;">
        ${opts}
      </select>
    </div>`).join('');
  XL_FIELDS.forEach(f=>{
    if(guess[f.key]!==undefined){
      const sel=document.getElementById('map-'+f.key);
      if(sel)sel.value=String(guess[f.key]);
    }
  });
}

 
let xlParsed=[];

function parseXlData(){
  if(!xlSheetData.length){toast('請先上傳 Excel 檔案','err');return;}
  const info=getXlHeaderInfo();
  const matrix=info.matrix;
  const map={};
  XL_FIELDS.forEach(f=>{const el=document.getElementById('map-'+f.key);const v=el?el.value:'';if(v!=='')map[f.key]=+v;});
  const defStatus=normalizeStatus(document.getElementById('xl-default-status')?.value)||'未修';
  xlParsed=[];

  if(matrix){
    const start=matrix.dataStart;
    xlSheetData.slice(start).forEach(row=>{
      const name=getCell(row,matrix.nameCol);
      if(!name||/(科目名稱|課程名稱|合計|小計|總計|備註)/.test(name))return;
      const baseType=normalizeType(getCell(row,matrix.typeCol));
      const baseCredit=parseCreditValue(getCell(row,matrix.creditCol));
      let pushed=false;
      matrix.semCols.forEach(sc=>{
        const raw=getCell(row,sc.col);
        if(!raw)return;
        const credit=parseCreditValue(raw);
        // 若學期欄位填的是學分數，優先使用；若只是符號，則退回「學分」欄。
        const finalCredit=credit!==null?credit:(baseCredit!==null?baseCredit:0);
        if(finalCredit===0&&credit===null&&baseCredit===null)return;
        xlParsed.push({
          name,
          courseCode:map.courseCode!==undefined?getCell(row,map.courseCode):'',
          credits:finalCredit,
          type:baseType,
          grade:'',
          year:sc.year,
          term:sc.term,
          customYear:sc.customYear||'',
          sem:buildSemesterText(sc.year,sc.term,sc.customYear||''),
          teacher:map.teacher!==undefined?getCell(row,map.teacher):'',
          classTime:map.classTime!==undefined?getCell(row,map.classTime):'',
          classDay:getClassScheduleParts({classTime:map.classTime!==undefined?getCell(row,map.classTime):''}).day,
          classPeriods:getClassScheduleParts({classTime:map.classTime!==undefined?getCell(row,map.classTime):''}).periods,
          classroom:map.classroom!==undefined?getCell(row,map.classroom):'',
          note:map.note!==undefined?getCell(row,map.note):'矩陣式學分表匯入',
          status:normalizeStatus(map.status!==undefined?getCell(row,map.status):'')||defStatus
        });
        pushed=true;
      });
      if(!pushed&&baseCredit!==null){
        const semText=map.sem!==undefined?getCell(row,map.sem):'';
        const semParts=getSemesterParts({sem:semText});
        xlParsed.push({
          name,
          courseCode:map.courseCode!==undefined?getCell(row,map.courseCode):'',
          credits:baseCredit,
          type:baseType,
          grade:'',
          year:semParts.year,
          term:semParts.term,
          customYear:semParts.customYear,
          sem:buildSemesterText(semParts.year,semParts.term,semParts.customYear)||semText,
          teacher:map.teacher!==undefined?getCell(row,map.teacher):'',
          classTime:map.classTime!==undefined?getCell(row,map.classTime):'',
          classDay:getClassScheduleParts({classTime:map.classTime!==undefined?getCell(row,map.classTime):''}).day,
          classPeriods:getClassScheduleParts({classTime:map.classTime!==undefined?getCell(row,map.classTime):''}).periods,
          classroom:map.classroom!==undefined?getCell(row,map.classroom):'',
          note:map.note!==undefined?getCell(row,map.note):'矩陣式學分表匯入',
          status:normalizeStatus(map.status!==undefined?getCell(row,map.status):'')||defStatus
        });
      }
    });
  }else{
    const nameCol=document.getElementById('map-name').value;
    if(nameCol===''){toast('請設定「課程名稱」對應的欄位','err');return;}
    xlSheetData.slice(info.dataStart||1).forEach(row=>{
      const name=getCell(row,map['name']);
      if(!name)return;
      const semText=map['sem']!==undefined?getCell(row,map['sem']):'';
      const semParts=getSemesterParts({sem:semText});
      const rawTime=map['classTime']!==undefined?getCell(row,map['classTime']):'';
      xlParsed.push({
        name,
        courseCode:map['courseCode']!==undefined?getCell(row,map['courseCode']):'',
        credits:map['credits']!==undefined?(parseCreditValue(getCell(row,map['credits']))??0):0,
        type:normalizeType(map['type']!==undefined?getCell(row,map['type']):''),
        grade:normalizeGrade(map['grade']!==undefined?getCell(row,map['grade']):''),
        year:semParts.year,
        term:semParts.term,
        customYear:semParts.customYear,
        sem:buildSemesterText(semParts.year,semParts.term,semParts.customYear)||semText,
        teacher:map['teacher']!==undefined?getCell(row,map['teacher']):'',
        classTime:rawTime,
        classDay:getClassScheduleParts({classTime:rawTime}).day,
        classPeriods:getClassScheduleParts({classTime:rawTime}).periods,
        classroom:map['classroom']!==undefined?getCell(row,map['classroom']):'',
        note:map['note']!==undefined?getCell(row,map['note']):'',
        status:normalizeStatus(map['status']!==undefined?getCell(row,map['status']):'')||defStatus
      });
    });
  }
  if(!xlParsed.length){toast('沒有找到有效課程，請確認欄位設定','err');return;}
  renderXlResults();
  document.getElementById('xl-result-card').style.display='block';
  document.getElementById('xl-result-count').textContent=`共 ${xlParsed.length} 門課程${matrix?'（矩陣式自動判讀）':''}`;
  document.getElementById('xl-result-card').scrollIntoView({behavior:'smooth',block:'start'});
}

 
function normalizeStatus(s){
  s=(s||'').toString().trim();
  if(!s)return '';
  if(/^(done|passed|pass|completed|complete)$/i.test(s))return '已修';
  if(/^(taking|current|enrolled|in progress)$/i.test(s))return '修課中';
  if(/^(todo|not yet|not taken|uncompleted|pending)$/i.test(s))return '未修';
  if(/^(plan|planned|future)$/i.test(s))return '未來計畫';
  if(s.includes('修課中')||s.includes('正在修')||s.includes('在修')||s.includes('現修'))return '修課中';
  if(s.includes('未來')||s.includes('計畫')||s.includes('預計'))return '未來計畫';
  if(s.includes('未修')||s.includes('尚未')||s.includes('待修')||s.includes('沒修'))return '未修';
  if(s.includes('已修')||s.includes('通過')||s.includes('完成')||s.includes('抵免'))return '已修';
  return ['已修','修課中','未修','未來計畫'].includes(s)?s:'';
}

function normalizeType(s){
  s=(s||'').toString().trim();
  if(!s)return '必修';
  if(normalizeStatus(s))return '必修';
  if(s.includes('通識'))return '通識';
  if(s.includes('選修')||s.includes('選'))return '選修';
  if(s.includes('必修')||s.includes('必'))return '必修';
  return '必修';
}
function normalizeGrade(s){
  s=(s||'').toString().trim().toUpperCase();
  const valid=['A+','A','A-','B+','B','B-','C+','C','C-','D','F'];
  if(valid.includes(s))return s;
  // numeric → letter
  const n=parseFloat(s);
  if(!isNaN(n)){
    if(n>=90)return 'A+';if(n>=85)return 'A';if(n>=80)return 'A-';
    if(n>=77)return 'B+';if(n>=73)return 'B';if(n>=70)return 'B-';
    if(n>=67)return 'C+';if(n>=63)return 'C';if(n>=60)return 'C-';
    if(n>=50)return 'D';return 'F';
  }
  return '';
}
 
function renderXlResults(){
  const gradeOpts=['','A+','A','A-','B+','B','B-','C+','C','C-','D','F'].map(g=>`<option value="${g}">${g||'—'}</option>`).join('');
  const statusOpts=['未修','修課中','已修','未來計畫'];
  const grid='1fr 90px 55px 85px 95px 100px 100px 110px 130px 100px';
  document.getElementById('xl-result-area').innerHTML=`
    <div class="xl-result-row xl-result-head" style="grid-template-columns:${grid};padding:4px 0;border-bottom:2px solid var(--border);min-width:1040px;">
      <span>課程名稱</span><span>課程代碼</span><span>學分</span><span>修別</span><span>修課狀態</span><span>建議學期</span><span>成績</span><span>老師</span><span>上課時間</span><span>教室</span>
    </div>
    ${xlParsed.map((c,i)=>`
    <div class="xl-result-row" style="grid-template-columns:${grid};min-width:1040px;">
      <input type="text" value="${esc(c.name)}" data-i="${i}" data-f="name" oninput="updXl(this)">
      <input type="text" value="${esc(c.courseCode||'')}" data-i="${i}" data-f="courseCode" oninput="updXl(this)">
      <input type="number" value="${c.credits}" min="0" max="12" data-i="${i}" data-f="credits" oninput="updXl(this)">
      <select data-i="${i}" data-f="type" onchange="updXl(this)">${['必修','選修','通識'].map(t=>`<option ${c.type===t?'selected':''}>${t}</option>`).join('')}</select>
      <select data-i="${i}" data-f="status" onchange="updXl(this)">${statusOpts.map(s=>`<option value="${s}" ${(normalizeStatus(c.status)||'未修')===s?'selected':''}>${s}</option>`).join('')}</select>
      <input type="text" value="${esc(c.sem)}" placeholder="大一上…" data-i="${i}" data-f="sem" oninput="updXl(this)">
      <select data-i="${i}" data-f="grade" onchange="updXl(this)">${gradeOpts.replace(`value=\"${c.grade}\"`,`value=\"${c.grade}\" selected`)}</select>
      <input type="text" value="${esc(c.teacher||'')}" data-i="${i}" data-f="teacher" oninput="updXl(this)">
      <input type="text" value="${esc(c.classTime||'')}" placeholder="星期一 1-2" data-i="${i}" data-f="classTime" oninput="updXl(this)">
      <input type="text" value="${esc(c.classroom||'')}" data-i="${i}" data-f="classroom" oninput="updXl(this)">
    </div>`).join('')}`;
}
function esc(s){return (s??'').toString().replace(/"/g,'&quot;').replace(/</g,'&lt;');}
function updXl(el){
  const i=+el.dataset.i,f=el.dataset.f;
  xlParsed[i][f]=f==='credits'?+el.value:(f==='status'?normalizeStatus(el.value):el.value);
  if(f==='sem'){
    const semParts=getSemesterParts({sem:el.value});
    xlParsed[i].year=semParts.year;xlParsed[i].term=semParts.term;xlParsed[i].customYear=semParts.customYear;
  }
}
function importXlResults(){
  const targetDept=document.getElementById('xl-import-dept')?.value||currentDept;
  if(!targetDept){toast('請先選擇匯入科系','err');return;}
  if(!xlParsed.length){toast('沒有可匯入的資料','err');return;}
  const ud=getUD();
  if(!ud.depts[targetDept]){toast('找不到匯入科系','err');return;}
  if(!ud.depts[targetDept].courses)ud.depts[targetDept].courses=[];
  xlParsed.forEach(c=>{
    ud.depts[targetDept].courses.push({
      id:Date.now().toString(36)+Math.random().toString(36).slice(2,5),
      name:c.name,type:c.type||'必修',credits:+c.credits||0,
      courseCode:c.courseCode||'',teacher:c.teacher||'',classDay:c.classDay||getClassScheduleParts(c).day,classPeriods:c.classPeriods||getClassScheduleParts(c).periods,classTime:c.classTime||buildClassTimeText(c.classDay||getClassScheduleParts(c).day,c.classPeriods||getClassScheduleParts(c).periods),classroom:c.classroom||'',
      grade:c.grade||'',status:normalizeStatus(c.status)||'未修',
      year:getSemesterParts(c).year,term:getSemesterParts(c).term,customYear:getSemesterParts(c).customYear,
      sem:formatCourseSemester(c)||c.sem||'',note:c.note?c.note+'（Excel 匯入）':'（Excel 匯入）'
    });
  });
  currentDept=targetDept;
  saveUD(ud);
  const fDept=document.getElementById('f-dept');if(fDept)fDept.value=targetDept;
  const ttDept=document.getElementById('tt-dept-filter');if(ttDept)ttDept.value=targetDept;
  const importedCount=xlParsed.length;
  xlParsed=[];
  document.getElementById('xl-result-card').style.display='none';
  document.getElementById('xl-result-count').textContent='';
  resetCourseFilters();
  updateSidebar();
  showPage('courses');
  renderDashboard();
  renderTable();
  toast(`✅ 已匯入 ${importedCount} 門課程，已切到課程管理`,'ok');
}
 
// ═══ TEMPLATE DOWNLOAD ═══
function downloadTemplate(){
  const ws=XLSX.utils.aoa_to_sheet([
    ['課程名稱','課程代碼','學分','修別','修課狀態','成績','建議修讀學期','授課老師','上課時間','教室','備註'],
    ['微積分','MATH101','3','必修','已修','A','大一上','王老師','星期一 1-2 節','A305',''],
    ['程式設計','CS101','3','必修','修課中','B+','大一下','李老師','星期三 3-4 節','電腦教室 1',''],
    ['通識藝術','GE201','2','通識','未修','','大二上','陳老師','週五 5-6','B102','藝術領域'],
    ['選修專題','EL301','3','選修','未來計畫','','大三上','林老師','Tue 7-8','C201',''],
  ]);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'學分表');
  XLSX.writeFile(wb,'學分表範本.xlsx');
  toast('📋 範本已下載','ok');
}
 
// ═══ EXPORT / IMPORT ═══
function exportData(){
  const ud=getUD();
  const backupText=JSON.stringify({user:currentUser,data:ud},null,2);
  const blob=new Blob([backupText],{type:'text/plain;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=`PASS資料備份_${(ud.email||ud.name||currentUser).replace(/[^a-zA-Z0-9_@.-]/g,'_')}_${new Date().toLocaleDateString('zh-TW').replace(/\//g,'-')}.txt`;
  a.click();toast('📥 資料備份文字檔已匯出','ok');
}
function importData(e){
  const f=e.target.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=ev=>{
    try{const d=JSON.parse(ev.target.result);const ud=d.data||d;if(!ud.depts)throw 0;saveUD(ud);updateSidebar();renderDashboard();toast('✅ 匯入成功','ok');}
    catch{toast('❌ 備份檔案格式錯誤','err');}
  };
  r.readAsText(f);
}
 


// ═══ MODAL ═══
let _ma=null;
function openModal(t,b,a){document.getElementById('m-title').textContent=t;document.getElementById('m-body').textContent=b;_ma=a;document.getElementById('modal').classList.add('open');}
function closeModal(){document.getElementById('modal').classList.remove('open');_ma=null;}
document.getElementById('m-confirm').onclick=()=>{if(_ma)_ma();closeModal();};
document.getElementById('modal').onclick=e=>{if(e.target.id==='modal')closeModal();};
 
// ═══ TOAST ═══
function toast(msg,type=''){
  const t=document.getElementById('toast');
  t.textContent=msg;t.className='toast show '+(type==='ok'?'ok':type==='err'?'err':'');
  clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),2500);
}
