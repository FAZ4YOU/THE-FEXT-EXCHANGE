/* ============================================================
   THE FECT EXCHANGE — APP LOGIC (v2)
   Semua data disimpan di localStorage (client-side only).
   Halaman ANALISA menampilkan chart & indikator SIMULASI untuk
   keperluan edukasi — bukan data pasar real-time dan BUKAN sinyal
   / saran investasi.
   ============================================================ */

(function(){
"use strict";

/* ---------------- CONSTANTS ---------------- */
const STORAGE_KEY = "fectExchange_v2";

const INSTRUMENTS = [
  // CRYPTO
  {sym:"BTC/USDT", cat:"crypto", base:68000000, vol:0.006, chart:"candle", unit:"idr"},
  {sym:"ETH/USDT", cat:"crypto", base:3600000,  vol:0.008, chart:"candle", unit:"idr"},
  {sym:"SOL/USDT", cat:"crypto", base:2300000,  vol:0.012, chart:"candle", unit:"idr"},
  {sym:"XRP/USDT", cat:"crypto", base:8500,     vol:0.015, chart:"candle", unit:"idr"},
  {sym:"DOGE/USDT",cat:"crypto", base:2200,     vol:0.02,  chart:"candle", unit:"idr"},
  {sym:"BNB/USDT", cat:"crypto", base:9800000,  vol:0.009, chart:"candle", unit:"idr"},
  {sym:"ADA/USDT", cat:"crypto", base:6200,     vol:0.014, chart:"candle", unit:"idr"},
  // FOREX
  {sym:"EUR/USD", cat:"forex", base:1.08,   vol:0.003, chart:"candle", unit:"num"},
  {sym:"GBP/USD", cat:"forex", base:1.27,   vol:0.0035,chart:"candle", unit:"num"},
  {sym:"USD/JPY", cat:"forex", base:149.5,  vol:0.003, chart:"candle", unit:"num"},
  {sym:"USD/IDR", cat:"forex", base:15800,  vol:0.002, chart:"candle", unit:"num"},
  {sym:"AUD/USD", cat:"forex", base:0.66,   vol:0.004, chart:"candle", unit:"num"},
  // XAUUSD
  {sym:"XAU/USD", cat:"xauusd", base:2350, vol:0.004, chart:"candle", unit:"num"},
  // OBLIGASI (yield %, garis)
  {sym:"Indonesia 10Y", cat:"obligasi", base:6.8, vol:0.004, chart:"line", unit:"pct"},
  {sym:"Japan 10Y",     cat:"obligasi", base:1.1, vol:0.006, chart:"line", unit:"pct"},
  {sym:"China 10Y",     cat:"obligasi", base:2.3, vol:0.005, chart:"line", unit:"pct"},
  {sym:"India 10Y",     cat:"obligasi", base:7.0, vol:0.004, chart:"line", unit:"pct"},
  {sym:"US 10Y",        cat:"obligasi", base:4.3, vol:0.005, chart:"line", unit:"pct"},
];

const TIMEFRAMES = {"1M":60000,"5M":300000,"15M":900000,"1H":3600000,"4H":14400000,"1D":86400000};

const ACHIEVEMENTS = [
  {id:"first_save", name:"First Save", icon:"💰", desc:"Nabung pertama kali"},
  {id:"streak7", name:"7 Day Streak", icon:"🔥", desc:"Nabung 7 hari beruntun"},
  {id:"streak30", name:"30 Day Streak", icon:"🏆", desc:"Nabung 30 hari beruntun"},
  {id:"first_target", name:"First Target", icon:"🎯", desc:"Buat target pertama"},
  {id:"target_complete", name:"Target Complete", icon:"✅", desc:"Selesaikan sebuah target"},
];

/* ---------------- STATE ---------------- */
let state = null;

function defaultState(){
  return {
    transactions:[],
    targets:[],
    budgets:{ weekly:{amount:0}, monthly:{amount:0} },
    notes:[],
    favorites:[],           // array of instrument symbols
    achievements:[],
    notifications:[],
    market:{},              // sym -> {price, open24, high, low, candles:{tf:[...]}}
    premium:{ active:false, welcomeShown:false },
    settings:{}
  };
}

function load(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      state = JSON.parse(raw);
      const d = defaultState();
      state = Object.assign({}, d, state);
      state.budgets = Object.assign({}, d.budgets, state.budgets);
      state.premium = Object.assign({}, d.premium, state.premium);
    } else {
      state = defaultState();
    }
  }catch(e){
    console.error("load error", e);
    state = defaultState();
  }
}

function save(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }catch(e){
    console.error("save error", e);
    toast("Gagal menyimpan data (storage penuh?)");
  }
}

/* ---------------- UTIL ---------------- */
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
function fmtRupiah(n){
  n = Math.round(n||0);
  const neg = n < 0;
  n = Math.abs(n);
  return (neg?"-":"") + "Rp " + n.toLocaleString("id-ID");
}
function fmtNum(n, d){
  d = d===undefined?2:d;
  return Number(n).toLocaleString("id-ID",{minimumFractionDigits:0,maximumFractionDigits:d});
}
function fmtInstrumentPrice(instr, price){
  if(instr.unit==="idr") return "Rp "+fmtNum(price,2);
  if(instr.unit==="pct") return fmtNum(price,3)+"%";
  return fmtNum(price, price<10?4:2);
}
function todayISO(){ return new Date().toISOString().slice(0,10); }
function nowTime(){ const d=new Date(); return d.getHours().toString().padStart(2,"0")+":"+d.getMinutes().toString().padStart(2,"0"); }
function fmtDateID(iso){
  const d = new Date(iso+"T00:00:00");
  return d.toLocaleDateString("id-ID",{day:"numeric",month:"short",year:"numeric"});
}
function daysBetween(a,b){
  return Math.round((new Date(b)-new Date(a))/86400000);
}
function escapeHtml(s){
  const div = document.createElement("div");
  div.textContent = s==null?"":String(s);
  return div.innerHTML;
}

/* ---------------- TOAST ---------------- */
function toast(msg){
  const root = document.getElementById("toastRoot");
  const el = document.createElement("div");
  el.className="toast";
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(()=>{ el.remove(); }, 3200);
}

/* ---------------- NOTIFICATIONS ---------------- */
function pushNotif(text){
  state.notifications.unshift({id:uid(), text, date:new Date().toISOString(), read:false});
  state.notifications = state.notifications.slice(0,50);
  save();
  renderNotifBadge();
  toast(text);
}
function renderNotifBadge(){
  const unread = state.notifications.filter(n=>!n.read).length;
  const badge = document.getElementById("notifBadge");
  if(unread>0){ badge.textContent = unread>99?"99+":unread; badge.classList.remove("hidden"); }
  else badge.classList.add("hidden");
}
function renderNotifList(){
  const box = document.getElementById("notifList");
  if(state.notifications.length===0){ box.innerHTML = '<p class="empty">Belum ada notifikasi.</p>'; return; }
  box.innerHTML = state.notifications.slice(0,20).map(n=>{
    const d = new Date(n.date);
    return `<div class="notif-item"><b>${escapeHtml(n.text)}</b><br><small>${d.toLocaleString("id-ID")}</small></div>`;
  }).join("");
}

/* ============================================================
   MARKET ENGINE (SIMULATION)
   ============================================================ */
function initMarket(){
  const needsInit = Object.keys(state.market).length === 0;
  INSTRUMENTS.forEach(p=>{
    if(!state.market[p.sym]){
      state.market[p.sym] = {
        price: p.base, open24: p.base, high: p.base, low: p.base,
        candles: {}
      };
      Object.keys(TIMEFRAMES).forEach(tf=>{
        state.market[p.sym].candles[tf] = genInitialCandles(p.base, p.vol, 60);
      });
    }
  });
  if(needsInit) save();
}

function genInitialCandles(base, vol, count){
  let price = base;
  const arr = [];
  const now = Date.now();
  for(let i=count;i>0;i--){
    const open = price;
    const change = (Math.random()-0.5) * vol * 2 * price;
    let close = open + change;
    if(close <= 0) close = open * 0.99;
    const high = Math.max(open,close) * (1 + Math.random()*vol*0.5);
    const low = Math.min(open,close) * (1 - Math.random()*vol*0.5);
    arr.push({t: now - i*3600000, o:open, h:high, l:low, c:close});
    price = close;
  }
  return arr;
}

function tickMarket(){
  INSTRUMENTS.forEach(p=>{
    const m = state.market[p.sym];
    if(!m) return;
    const change = (Math.random()-0.5) * p.vol * 2 * m.price;
    let newPrice = m.price + change;
    if(newPrice <= 0) newPrice = m.price * 0.995;
    m.price = newPrice;
    m.high = Math.max(m.high, newPrice);
    m.low = Math.min(m.low, newPrice);
    Object.keys(TIMEFRAMES).forEach(tf=>{
      const arr = m.candles[tf];
      const last = arr[arr.length-1];
      const span = TIMEFRAMES[tf];
      if(Date.now() - last.t < span){
        last.c = newPrice; last.h = Math.max(last.h,newPrice); last.l = Math.min(last.l,newPrice);
      } else {
        arr.push({t:Date.now(), o:last.c, h:newPrice, l:newPrice, c:newPrice});
        if(arr.length>80) arr.shift();
      }
    });
  });
  save();
  refreshLiveViews();
}

function refreshLiveViews(){
  if(currentPage==="analisa") renderAnalisaLive();
  updateHeaderBalance();
}

/* ============================================================
   NAVIGATION
   ============================================================ */
let currentPage = "home";
let currentCategory = "crypto";
let currentSymbol = "BTC/USDT";
let currentTf = "1H";
let currentToolsTab = "stats";

function initNav(){
  document.querySelectorAll(".nav-btn[data-page]").forEach(btn=>{
    btn.addEventListener("click", ()=>goToPage(btn.dataset.page));
  });
  document.getElementById("navAdd").addEventListener("click", ()=>openTxModal("SAVING"));
  document.getElementById("brandHome").addEventListener("click", ()=>goToPage("home"));
}

function goToPage(page){
  currentPage = page;
  document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
  document.getElementById("page-"+page).classList.remove("hidden");
  document.querySelectorAll(".nav-btn[data-page]").forEach(b=>b.classList.toggle("active", b.dataset.page===page));
  closeDropdowns();
  renderPage(page);
}

function renderPage(page){
  if(page==="home") renderHome();
  else if(page==="analisa") renderAnalisaPage();
  else if(page==="target") renderTargetPage();
  else if(page==="lainnya") renderLainnyaPage();
}

function closeDropdowns(){
  document.getElementById("searchPanel").classList.add("hidden");
  document.getElementById("notifPanel").classList.add("hidden");
}

/* ============================================================
   HEADER
   ============================================================ */
function initHeader(){
  document.getElementById("searchToggle").addEventListener("click", ()=>toggleDropdown("searchPanel"));
  document.getElementById("notifToggle").addEventListener("click", ()=>{
    toggleDropdown("notifPanel");
    state.notifications.forEach(n=>n.read=true);
    save();
    renderNotifBadge();
    renderNotifList();
  });
  document.getElementById("premiumToggle").addEventListener("click", ()=>openPremiumPage(false));
  document.getElementById("searchInput").addEventListener("input", (e)=>doSearch(e.target.value.trim()));
  document.addEventListener("click",(e)=>{
    const header = document.querySelector(".header");
    if(!header.contains(e.target)) closeDropdowns();
  });
}

function toggleDropdown(id){
  const el = document.getElementById(id);
  const willOpen = el.classList.contains("hidden");
  closeDropdowns();
  if(willOpen) el.classList.remove("hidden");
}

function doSearch(q){
  const box = document.getElementById("searchResults");
  if(!q){ box.innerHTML=""; return; }
  const ql = q.toLowerCase();
  const results = [];
  state.transactions.filter(t=> (t.category+t.description).toLowerCase().includes(ql)).slice(0,5)
    .forEach(t=>results.push(`💵 ${t.category} — ${t.description||""} (${fmtRupiah(t.amount)})`));
  state.targets.filter(t=>t.name.toLowerCase().includes(ql)).slice(0,5)
    .forEach(t=>results.push(`🎯 Target: ${t.name}`));
  state.notes.filter(n=>(n.title+n.content).toLowerCase().includes(ql)).slice(0,5)
    .forEach(n=>results.push(`📝 Catatan: ${n.title}`));
  INSTRUMENTS.filter(p=>p.sym.toLowerCase().includes(ql)).slice(0,5).forEach(p=>results.push(`📈 ${p.sym}`));
  box.innerHTML = results.length ? results.map(r=>`<div class="sr-item">${escapeHtml(r)}</div>`).join("") : '<p class="empty">Tidak ditemukan.</p>';
}

/* ============================================================
   HOME PAGE
   ============================================================ */
function computeTotals(){
  let income=0, expense=0, saving=0;
  state.transactions.forEach(t=>{
    if(t.type==="INCOME") income += t.amount;
    else if(t.type==="EXPENSE") expense += t.amount;
    else if(t.type==="SAVING") saving += t.amount;
  });
  return {income, expense, saving, balance: income+saving-expense};
}

function computePlRange(days){
  const cutoff = Date.now() - days*86400000;
  let pl = 0;
  state.transactions.forEach(t=>{
    const ts = new Date(t.date+"T"+(t.time||"00:00")).getTime();
    if(ts >= cutoff){
      if(t.type==="INCOME"||t.type==="SAVING") pl += t.amount;
      else if(t.type==="EXPENSE") pl -= t.amount;
    }
  });
  return pl;
}

function updateHeaderBalance(){
  const {balance} = computeTotals();
  document.getElementById("headerBalance").textContent = fmtRupiah(balance);
}

function renderHome(){
  const {income, expense, balance} = computeTotals();
  document.getElementById("homeBalance").textContent = fmtRupiah(balance);
  document.getElementById("homePlToday").textContent = fmtRupiah(computePlRange(1));
  document.getElementById("statIncome").textContent = fmtRupiah(income);
  document.getElementById("statExpense").textContent = fmtRupiah(expense);
  document.getElementById("statPl7d").textContent = fmtRupiah(computePlRange(7));
  document.getElementById("statPl30d").textContent = fmtRupiah(computePlRange(30));
  document.getElementById("statTxCount").textContent = state.transactions.length;
  document.getElementById("statActiveTargets").textContent = state.targets.filter(t=>!t.completed).length;
  updateHeaderBalance();

  const main = state.targets.find(t=>t.primary && !t.completed) || state.targets.find(t=>!t.completed);
  const mtBox = document.getElementById("mainTargetCard");
  mtBox.innerHTML = main ? targetCardHtml(main, Math.min(100, Math.round((main.collected/main.targetAmount)*100))) : '<p class="empty">Belum ada target. Buat di halaman TARGET.</p>';

  const recentBox = document.getElementById("recentActivity");
  const recent = [...state.transactions].sort((a,b)=> (b.date+b.time) > (a.date+a.time) ? 1:-1).slice(0,6);
  recentBox.innerHTML = recent.length ? recent.map(activityHtml).join("") : '<p class="empty">Belum ada transaksi.</p>';
}

function activityHtml(t){
  const sign = (t.type==="EXPENSE") ? "-" : "+";
  const cls = (t.type==="EXPENSE") ? "neg" : "pos";
  return `<div class="activity-item">
    <div class="tx-main"><span class="tx-cat">${escapeHtml(t.category)}</span><span class="tx-desc">${escapeHtml(t.description||"")} · ${fmtDateID(t.date)}</span></div>
    <span class="tx-amount ${cls}">${sign}${fmtRupiah(t.amount)}</span>
  </div>`;
}

function targetCardHtml(t, pct){
  const remain = Math.max(0, t.targetAmount - t.collected);
  return `<div class="target-card ${t.primary?"primary":""}">
    <div class="target-head"><span class="target-name">${escapeHtml(t.name)}</span>${t.primary?'<span class="primary-badge">UTAMA</span>':""}</div>
    <div class="target-amounts">${fmtRupiah(t.collected)} / ${fmtRupiah(t.targetAmount)}</div>
    <div class="progress-track"><div class="progress-fill ${pct>=100?"done":""}" style="width:${pct}%"></div><span class="progress-pct">${pct}%</span></div>
    <div class="target-meta"><span>Sisa: ${fmtRupiah(remain)}</span><span>${t.deadline?("Deadline: "+fmtDateID(t.deadline)):""}</span></div>
  </div>`;
}

/* ============================================================
   TRANSACTIONS
   ============================================================ */
function initQuickActions(){
  document.querySelectorAll("[data-action]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const act = btn.dataset.action;
      if(act==="open-nabung") openTxModal("SAVING");
      else if(act==="open-keluar") openTxModal("EXPENSE");
      else if(act==="goto-target") goToPage("target");
      else if(act==="goto-analisa") goToPage("analisa");
    });
  });
}

function openTxModal(defaultType, editId){
  const editing = editId ? state.transactions.find(t=>t.id===editId) : null;
  const type = editing ? editing.type : defaultType;
  const body = `
    <button class="modal-close" data-close>✕</button>
    <h2>${editing?"Edit":"Tambah"} Transaksi</h2>
    <div class="radio-row" id="txTypeRow">
      <button data-type="SAVING" class="${type==="SAVING"?"active":""}">SAVING</button>
      <button data-type="INCOME" class="${type==="INCOME"?"active":""}">INCOME</button>
      <button data-type="EXPENSE" class="${type==="EXPENSE"?"active":""}">EXPENSE</button>
    </div>
    <div class="field"><label>Kategori</label><input class="text-input" id="txCategory" placeholder="mis. Gaji, Makan, Tabungan Laptop" value="${editing?escapeHtml(editing.category):""}"></div>
    <div class="field"><label>Deskripsi</label><input class="text-input" id="txDesc" placeholder="opsional" value="${editing?escapeHtml(editing.description||""):""}"></div>
    <div class="field"><label>Jumlah (Rp)</label><input type="number" class="text-input" id="txAmount" placeholder="0" value="${editing?editing.amount:""}"></div>
    <div class="field"><label>Tanggal</label><input type="date" class="text-input" id="txDate" value="${editing?editing.date:todayISO()}"></div>
    <div class="modal-actions">
      <button class="btn btn-primary btn-block" id="txSave">SIMPAN</button>
      ${editing?'<button class="btn btn-danger btn-block" id="txDelete">HAPUS</button>':""}
    </div>
  `;
  openModal(body);
  let selType = type;
  document.querySelectorAll("#txTypeRow button").forEach(b=>{
    b.addEventListener("click", ()=>{
      selType = b.dataset.type;
      document.querySelectorAll("#txTypeRow button").forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
    });
  });
  document.getElementById("txSave").addEventListener("click", ()=>{
    const category = document.getElementById("txCategory").value.trim();
    const description = document.getElementById("txDesc").value.trim();
    const amount = parseFloat(document.getElementById("txAmount").value);
    const date = document.getElementById("txDate").value || todayISO();
    if(!category){ toast("Kategori wajib diisi"); return; }
    if(!amount || amount<=0){ toast("Jumlah harus lebih dari 0"); return; }
    if(editing){
      editing.type=selType; editing.category=category; editing.description=description;
      editing.amount=amount; editing.date=date;
      toast("Transaksi diperbarui");
    } else {
      const wasFirstSave = state.transactions.filter(t=>t.type==="SAVING").length===0;
      state.transactions.push({id:uid(), date, time:nowTime(), category, description, type:selType, amount});
      if(selType==="SAVING" && wasFirstSave) unlockAchievement("first_save");
      toast("Transaksi ditambahkan");
    }
    save();
    updateStreakAndCheck();
    closeModal();
    renderHome();
    if(currentPage==="target") renderTargetPage();
  });
  if(editing){
    document.getElementById("txDelete").addEventListener("click", ()=>{
      state.transactions = state.transactions.filter(t=>t.id!==editId);
      save();
      closeModal();
      renderHome();
    });
  }
}

/* ---------------- STREAK ---------------- */
function computeStreak(){
  const saveDates = new Set(state.transactions.filter(t=>t.type==="SAVING").map(t=>t.date));
  if(saveDates.size===0) return {current:0, best:0};
  const sorted = [...saveDates].sort();
  let best=1, cur=1;
  for(let i=1;i<sorted.length;i++){
    cur = daysBetween(sorted[i-1], sorted[i])===1 ? cur+1 : 1;
    best = Math.max(best, cur);
  }
  let currentStreak = 0, d = new Date();
  for(;;){
    const iso = d.toISOString().slice(0,10);
    if(saveDates.has(iso)){ currentStreak++; d.setDate(d.getDate()-1); }
    else break;
  }
  return {current: currentStreak, best};
}

let lastStreak = 0;
function updateStreakAndCheck(){
  const {current} = computeStreak();
  if(current > lastStreak && current>1) pushNotif(`Saving streak meningkat: ${current} hari 🔥`);
  lastStreak = current;
  if(current>=7) unlockAchievement("streak7");
  if(current>=30) unlockAchievement("streak30");
}

/* ============================================================
   TARGETS
   ============================================================ */
function renderTargetPage(){
  const box = document.getElementById("targetList");
  if(state.targets.length===0){ box.innerHTML='<p class="empty">Belum ada target.</p>'; }
  else {
    box.innerHTML = state.targets.map(t=>{
      const pct = Math.min(100, Math.round((t.collected/t.targetAmount)*100));
      const daysLeft = t.deadline ? daysBetween(todayISO(), t.deadline) : null;
      return `<div class="target-card ${t.primary?"primary":""}" data-id="${t.id}">
        <div class="target-head"><span class="target-name">${escapeHtml(t.name)}</span>${t.primary?'<span class="primary-badge">UTAMA</span>':""}</div>
        <div class="target-amounts">${fmtRupiah(t.collected)} / ${fmtRupiah(t.targetAmount)}</div>
        <div class="progress-track"><div class="progress-fill ${pct>=100?"done":""}" style="width:${pct}%"></div><span class="progress-pct">${pct}%</span></div>
        <div class="target-meta">
          <span>Sisa: ${fmtRupiah(Math.max(0,t.targetAmount-t.collected))}</span>
          <span>${t.deadline?("Estimasi: "+ (daysLeft>=0?daysLeft+" hari lagi":"lewat deadline")):"Tanpa deadline"}</span>
        </div>
        <div class="target-actions">
          <button data-act="add" data-id="${t.id}">+ TAMBAH</button>
          <button data-act="edit" data-id="${t.id}">EDIT</button>
          <button data-act="del" data-id="${t.id}">HAPUS</button>
        </div>
      </div>`;
    }).join("");
    box.querySelectorAll("[data-act]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const id = btn.dataset.id, act = btn.dataset.act;
        if(act==="add") openTargetAddFundsModal(id);
        else if(act==="edit") openTargetModal(id);
        else if(act==="del") deleteTarget(id);
      });
    });
  }
  renderBudgetGrid();
}

function openTargetModal(editId){
  const editing = editId ? state.targets.find(t=>t.id===editId) : null;
  const body = `
    <button class="modal-close" data-close>✕</button>
    <h2>${editing?"Edit":"Tambah"} Target</h2>
    <div class="field"><label>Nama Target</label><input class="text-input" id="tName" value="${editing?escapeHtml(editing.name):""}"></div>
    <div class="field"><label>Target Jumlah (Rp)</label><input type="number" class="text-input" id="tAmount" value="${editing?editing.targetAmount:""}"></div>
    <div class="field"><label>Jumlah Terkumpul (Rp)</label><input type="number" class="text-input" id="tCollected" value="${editing?editing.collected:0}"></div>
    <div class="field"><label>Deadline</label><input type="date" class="text-input" id="tDeadline" value="${editing?editing.deadline||"":""}"></div>
    <div class="field"><label><input type="checkbox" id="tPrimary" ${editing&&editing.primary?"checked":""}> Jadikan Target Utama</label></div>
    <div class="modal-actions">
      <button class="btn btn-primary btn-block" id="tSave">SIMPAN</button>
      ${editing?'<button class="btn btn-danger btn-block" id="tDelete">HAPUS</button>':""}
    </div>
  `;
  openModal(body);
  document.getElementById("tSave").addEventListener("click", ()=>{
    const name = document.getElementById("tName").value.trim();
    const targetAmount = parseFloat(document.getElementById("tAmount").value);
    const collected = parseFloat(document.getElementById("tCollected").value)||0;
    const deadline = document.getElementById("tDeadline").value;
    const primary = document.getElementById("tPrimary").checked;
    if(!name){ toast("Nama target wajib diisi"); return; }
    if(!targetAmount || targetAmount<=0){ toast("Target jumlah harus > 0"); return; }
    if(primary) state.targets.forEach(t=>t.primary=false);
    if(editing){
      Object.assign(editing, {name, targetAmount, collected, deadline, primary});
      checkTargetCompletion(editing);
    } else {
      const isFirst = state.targets.length===0;
      const nt = {id:uid(), name, targetAmount, collected, deadline, primary, completed:false};
      state.targets.push(nt);
      if(isFirst) unlockAchievement("first_target");
      checkTargetCompletion(nt);
    }
    save();
    closeModal();
    renderTargetPage();
    renderHome();
  });
  if(editing){
    document.getElementById("tDelete").addEventListener("click", ()=>deleteTarget(editId, true));
  }
}

function openTargetAddFundsModal(id){
  const t = state.targets.find(x=>x.id===id);
  if(!t) return;
  const body = `
    <button class="modal-close" data-close>✕</button>
    <h2>Tambah Dana: ${escapeHtml(t.name)}</h2>
    <div class="field"><label>Jumlah (Rp)</label><input type="number" class="text-input" id="addAmt" placeholder="0"></div>
    <p style="font-size:12px;color:#666;margin-bottom:8px">Ini akan tercatat juga sebagai transaksi SAVING.</p>
    <div class="modal-actions"><button class="btn btn-primary btn-block" id="addSave">TAMBAH</button></div>
  `;
  openModal(body);
  document.getElementById("addSave").addEventListener("click", ()=>{
    const amt = parseFloat(document.getElementById("addAmt").value);
    if(!amt || amt<=0){ toast("Jumlah harus > 0"); return; }
    t.collected += amt;
    const wasFirstSave = state.transactions.filter(x=>x.type==="SAVING").length===0;
    state.transactions.push({id:uid(), date:todayISO(), time:nowTime(), category:"Target: "+t.name, description:"Setor target", type:"SAVING", amount:amt});
    if(wasFirstSave) unlockAchievement("first_save");
    checkTargetCompletion(t);
    save();
    updateStreakAndCheck();
    closeModal();
    renderTargetPage();
    renderHome();
  });
}

function checkTargetCompletion(t){
  if(!t.completed && t.collected >= t.targetAmount){
    t.completed = true;
    unlockAchievement("target_complete");
    pushNotif(`Target "${t.name}" tercapai! 🎉`);
  } else if(t.completed===undefined){
    t.completed = false;
  }
  const pct = t.collected/t.targetAmount;
  if(!t.completed && pct>=0.9 && !t._nearNotified){
    t._nearNotified = true;
    pushNotif(`Target "${t.name}" hampir tercapai (${Math.round(pct*100)}%)`);
  }
}

function deleteTarget(id, fromModal){
  state.targets = state.targets.filter(t=>t.id!==id);
  save();
  if(fromModal) closeModal();
  renderTargetPage();
  renderHome();
}

/* ---------------- BUDGET ---------------- */
function periodStart(period){
  const d = new Date();
  if(period==="weekly"){ d.setDate(d.getDate()-d.getDay()); }
  else { d.setDate(1); }
  d.setHours(0,0,0,0);
  return d;
}

function budgetSpent(period){
  const start = periodStart(period);
  let spent = 0;
  state.transactions.forEach(t=>{
    if(t.type!=="EXPENSE") return;
    if(new Date(t.date+"T00:00:00") >= start) spent += t.amount;
  });
  return spent;
}

function renderBudgetGrid(){
  const box = document.getElementById("budgetGrid");
  const periods = [["weekly","Mingguan"],["monthly","Bulanan"]];
  box.innerHTML = periods.map(([key,label])=>{
    const budget = state.budgets[key].amount || 0;
    const spent = budgetSpent(key);
    const remain = budget - spent;
    const pct = budget>0 ? Math.min(999, Math.round((spent/budget)*100)) : 0;
    let statusClass="status-aman", statusText="AMAN";
    if(budget>0){
      if(spent > budget){ statusClass="status-lebih"; statusText="MELEBIHI BUDGET"; }
      else if(pct>=80){ statusClass="status-hampir"; statusText="HAMPIR HABIS"; }
    }
    if(budget>0 && spent>budget && !state.budgets[key]._overNotified){
      state.budgets[key]._overNotified = true;
      pushNotif(`Budget ${label} melebihi batas!`);
    } else if(budget>0 && pct>=80 && pct<100 && !state.budgets[key]._nearNotified){
      state.budgets[key]._nearNotified = true;
      pushNotif(`Budget ${label} hampir habis (${pct}%)`);
    }
    return `<div class="budget-card">
      <div class="budget-head"><span>${label}</span><span class="budget-status ${statusClass}">${statusText}</span></div>
      <div class="budget-nums"><span>Budget: ${fmtRupiah(budget)}</span><span>Terpakai: ${fmtRupiah(spent)}</span></div>
      <div class="progress-track"><div class="progress-fill ${spent>budget&&budget>0?"done":""}" style="width:${Math.min(100,pct)}%;${spent>budget&&budget>0?"background:var(--red)":""}"></div><span class="progress-pct">${pct}%</span></div>
      <div class="budget-nums"><span>Sisa: ${fmtRupiah(remain)}</span><span></span></div>
    </div>`;
  }).join("");
}

function openBudgetModal(){
  const body = `
    <button class="modal-close" data-close>✕</button>
    <h2>Atur Budget</h2>
    <div class="field"><label>Budget Mingguan (Rp)</label><input type="number" class="text-input" id="bWeekly" value="${state.budgets.weekly.amount||0}"></div>
    <div class="field"><label>Budget Bulanan (Rp)</label><input type="number" class="text-input" id="bMonthly" value="${state.budgets.monthly.amount||0}"></div>
    <div class="modal-actions"><button class="btn btn-primary btn-block" id="bSave">SIMPAN</button></div>
  `;
  openModal(body);
  document.getElementById("bSave").addEventListener("click", ()=>{
    state.budgets.weekly.amount = parseFloat(document.getElementById("bWeekly").value)||0;
    state.budgets.monthly.amount = parseFloat(document.getElementById("bMonthly").value)||0;
    state.budgets.weekly._overNotified=false; state.budgets.weekly._nearNotified=false;
    state.budgets.monthly._overNotified=false; state.budgets.monthly._nearNotified=false;
    save();
    closeModal();
    renderBudgetGrid();
  });
}

/* ============================================================
   ANALISA PAGE (multi-asset chart + indicators, no auto-signal)
   ============================================================ */
function initAnalisaControls(){
  document.querySelectorAll("#categoryTabs .tab").forEach(tab=>{
    tab.addEventListener("click", ()=>{
      currentCategory = tab.dataset.cat;
      document.querySelectorAll("#categoryTabs .tab").forEach(t=>t.classList.toggle("active", t===tab));
      const first = INSTRUMENTS.find(i=>i.cat===currentCategory);
      currentSymbol = first ? first.sym : currentSymbol;
      populateSymbolSelect();
      renderAnalisaPanel();
    });
  });

  const sel = document.getElementById("symbolSelect");
  sel.addEventListener("change", ()=>{
    currentSymbol = sel.value;
    renderAnalisaPanel();
  });

  document.querySelectorAll(".tf").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      currentTf = btn.dataset.tf;
      document.querySelectorAll(".tf").forEach(b=>b.classList.toggle("active", b===btn));
      renderChart();
    });
  });

  document.getElementById("favBtn").addEventListener("click", toggleFavorite);
}

function populateSymbolSelect(){
  const sel = document.getElementById("symbolSelect");
  const list = INSTRUMENTS.filter(i=>i.cat===currentCategory);
  sel.innerHTML = list.map(i=>`<option value="${i.sym}">${i.sym}</option>`).join("");
  sel.value = currentSymbol;
}

function renderAnalisaPage(){
  populateSymbolSelect();
  renderAnalisaPanel();
}

function renderAnalisaLive(){
  renderChart();
  renderIndicators();
  updatePriceHeader();
}

function renderAnalisaPanel(){
  updatePriceHeader();
  renderChart();
  renderIndicators();
  renderFavBtn();
  renderFavList();
}

function updatePriceHeader(){
  const instr = INSTRUMENTS.find(i=>i.sym===currentSymbol);
  const m = state.market[currentSymbol];
  if(!instr || !m) return;
  document.getElementById("tradePrice").textContent = fmtInstrumentPrice(instr, m.price);
  const chgPct = ((m.price-m.open24)/m.open24*100);
  const chgEl = document.getElementById("tradeChange");
  chgEl.textContent = (chgPct>=0?"+":"")+chgPct.toFixed(2)+"%";
  chgEl.className = "change "+(chgPct>=0?"up":"down");
}

function currentInstrument(){
  return INSTRUMENTS.find(i=>i.sym===currentSymbol);
}

/* ---- Candlestick / line chart via Canvas ---- */
function renderChart(){
  const canvas = document.getElementById("chartCanvas");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if(rect.width===0) return;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const W = rect.width, H = rect.height;
  ctx.clearRect(0,0,W,H);

  const instr = currentInstrument();
  const m = state.market[currentSymbol];
  if(!instr || !m) return;
  const candles = (m.candles[currentTf]||[]).slice(-40);
  if(candles.length===0) return;

  const highs = candles.map(c=>c.h), lows = candles.map(c=>c.l);
  let max = Math.max(...highs), min = Math.min(...lows);
  if(max===min){ max*=1.001; min*=0.999; }
  const pad = (max-min)*0.08;
  max += pad; min -= pad;

  const marginL = 4, marginR = 4, marginT = 8, marginB = 18;
  const plotW = W - marginL - marginR;
  const plotH = H - marginT - marginB;
  const cw = plotW / candles.length;

  ctx.strokeStyle = "#e5e5e5";
  ctx.lineWidth = 1;
  for(let i=0;i<=4;i++){
    const y = marginT + (plotH/4)*i;
    ctx.beginPath(); ctx.moveTo(marginL,y); ctx.lineTo(W-marginR,y); ctx.stroke();
  }

  if(instr.chart==="line"){
    ctx.strokeStyle="#000"; ctx.lineWidth=2;
    ctx.beginPath();
    candles.forEach((c,i)=>{
      const x = marginL + i*cw + cw/2;
      const y = marginT + plotH*(1-(c.c-min)/(max-min));
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();
    // fill under line
    const last = candles[candles.length-1];
    ctx.lineTo(marginL+(candles.length-1)*cw+cw/2, marginT+plotH);
    ctx.lineTo(marginL+cw/2, marginT+plotH);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,212,0,0.35)";
    ctx.fill();
  } else {
    candles.forEach((c,i)=>{
      const x = marginL + i*cw + cw/2;
      const yOpen = marginT + plotH*(1-(c.o-min)/(max-min));
      const yClose = marginT + plotH*(1-(c.c-min)/(max-min));
      const yHigh = marginT + plotH*(1-(c.h-min)/(max-min));
      const yLow = marginT + plotH*(1-(c.l-min)/(max-min));
      const up = c.c >= c.o;
      ctx.strokeStyle = "#000"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, yHigh); ctx.lineTo(x, yLow); ctx.stroke();
      ctx.fillStyle = up ? "#1FA463" : "#E8382C";
      const bw = Math.max(2, cw*0.55);
      const top = Math.min(yOpen,yClose), h = Math.max(1, Math.abs(yClose-yOpen));
      ctx.fillRect(x-bw/2, top, bw, h);
      ctx.strokeStyle="#000"; ctx.strokeRect(x-bw/2, top, bw, h);
    });
  }

  ctx.fillStyle="#000";
  ctx.font = "10px Arial";
  ctx.fillText(fmtNum(max,instr.unit==="pct"?3:2), marginL, marginT+8);
  ctx.fillText(fmtNum(min,instr.unit==="pct"?3:2), marginL, H-4);
}

/* ---- Indicators (informational only, no buy/sell output) ---- */
function computeMA(closes, period){
  if(closes.length<period) period = closes.length;
  if(period===0) return null;
  const slice = closes.slice(-period);
  return slice.reduce((a,b)=>a+b,0)/slice.length;
}

function computeRSI(closes, period){
  if(closes.length<2) return null;
  period = Math.min(period, closes.length-1);
  let gains=0, losses=0;
  for(let i=closes.length-period;i<closes.length;i++){
    const diff = closes[i]-closes[i-1];
    if(diff>=0) gains+=diff; else losses+=Math.abs(diff);
  }
  if(gains+losses===0) return 50;
  const avgGain = gains/period, avgLoss = losses/period;
  if(avgLoss===0) return 100;
  const rs = avgGain/avgLoss;
  return 100 - (100/(1+rs));
}

function renderIndicators(){
  const instr = currentInstrument();
  const m = state.market[currentSymbol];
  if(!instr || !m) return;
  const candles = m.candles[currentTf]||[];
  const closes = candles.map(c=>c.c);
  const ma = computeMA(closes, 20);
  const rsi = computeRSI(closes, 14);
  document.getElementById("indMA").textContent = ma!=null ? fmtInstrumentPrice(instr, ma) : "-";
  document.getElementById("indRSI").textContent = rsi!=null ? rsi.toFixed(1) : "-";
  document.getElementById("indHigh").textContent = fmtInstrumentPrice(instr, m.high);
  document.getElementById("indLow").textContent = fmtInstrumentPrice(instr, m.low);
}

/* ---- Favorites ---- */
function toggleFavorite(){
  const idx = state.favorites.indexOf(currentSymbol);
  if(idx>=0) state.favorites.splice(idx,1);
  else state.favorites.push(currentSymbol);
  save();
  renderFavBtn();
  renderFavList();
}

function renderFavBtn(){
  const btn = document.getElementById("favBtn");
  const isFav = state.favorites.includes(currentSymbol);
  btn.textContent = isFav ? "★ HAPUS DARI FAVORIT" : "☆ TAMBAH KE FAVORIT";
}

function renderFavList(){
  const box = document.getElementById("favList");
  if(state.favorites.length===0){ box.innerHTML='<p class="empty">Belum ada favorit.</p>'; return; }
  box.innerHTML = state.favorites.map(sym=>{
    const instr = INSTRUMENTS.find(i=>i.sym===sym);
    const m = state.market[sym];
    if(!instr || !m) return "";
    const chg = ((m.price-m.open24)/m.open24*100);
    return `<div class="market-row" data-sym="${sym}">
      <div><div class="pair-name">${sym}</div><div class="pair-sub">${instr.cat.toUpperCase()}</div></div>
      <div class="price-col">${fmtInstrumentPrice(instr, m.price)}<div class="chg ${chg>=0?"up":"down"}">${chg>=0?"+":""}${chg.toFixed(2)}%</div></div>
      <div class="hl"></div>
    </div>`;
  }).join("");
  box.querySelectorAll(".market-row").forEach(row=>{
    row.addEventListener("click", ()=>{
      const sym = row.dataset.sym;
      const instr = INSTRUMENTS.find(i=>i.sym===sym);
      currentCategory = instr.cat;
      currentSymbol = sym;
      document.querySelectorAll("#categoryTabs .tab").forEach(t=>t.classList.toggle("active", t.dataset.cat===currentCategory));
      populateSymbolSelect();
      renderAnalisaPanel();
      window.scrollTo({top:0, behavior:"smooth"});
    });
  });
}

/* ============================================================
   LAINNYA PAGE (stats / calc / achievements / notes / data)
   ============================================================ */
function initToolsTabs(){
  document.querySelectorAll("#toolsTabs .tab").forEach(tab=>{
    tab.addEventListener("click", ()=>{
      currentToolsTab = tab.dataset.tab;
      document.querySelectorAll("#toolsTabs .tab").forEach(t=>t.classList.toggle("active", t===tab));
      document.querySelectorAll("#page-lainnya .tab-panel").forEach(p=>p.classList.add("hidden"));
      document.getElementById("tools-"+currentToolsTab).classList.remove("hidden");
      renderToolsTabContent();
    });
  });
}

function renderLainnyaPage(){
  document.querySelectorAll("#page-lainnya .tab-panel").forEach(p=>p.classList.add("hidden"));
  document.getElementById("tools-"+currentToolsTab).classList.remove("hidden");
  renderToolsTabContent();
}

function renderToolsTabContent(){
  if(currentToolsTab==="stats") renderStatistics();
  else if(currentToolsTab==="achv") renderAchievements();
  else if(currentToolsTab==="notes") renderNotes();
}

/* ---- Calculators ---- */
function initCalculators(){
  const bind = (id, fn) => { const el = document.getElementById(id); if(el) el.addEventListener("input", fn); };

  function c1(){
    const target = parseFloat(document.getElementById("c1_target").value);
    const per = parseFloat(document.getElementById("c1_permonth").value);
    document.getElementById("c1_result").textContent = (target>0 && per>0) ? `Hasil: butuh ${Math.ceil(target/per)} bulan` : "Hasil: -";
  }
  ["c1_target","c1_permonth"].forEach(id=>bind(id,c1));

  function c2(){
    const target = parseFloat(document.getElementById("c2_target").value);
    const days = parseFloat(document.getElementById("c2_days").value);
    document.getElementById("c2_result").textContent = (target>0 && days>0) ? `Hasil: nabung ${fmtRupiah(target/days)} / hari` : "Hasil: -";
  }
  ["c2_target","c2_days"].forEach(id=>bind(id,c2));

  function c3(){
    const remain = parseFloat(document.getElementById("c3_remain").value);
    const perday = parseFloat(document.getElementById("c3_perday").value);
    document.getElementById("c3_result").textContent = (remain>0 && perday>0) ? `Hasil: ${Math.ceil(remain/perday)} hari lagi` : "Hasil: -";
  }
  ["c3_remain","c3_perday"].forEach(id=>bind(id,c3));

  function c4(){
    const value = parseFloat(document.getElementById("c4_value").value);
    const total = parseFloat(document.getElementById("c4_total").value);
    document.getElementById("c4_result").textContent = (total>0) ? `Hasil: ${((value/total)*100).toFixed(2)}%` : "Hasil: -";
  }
  ["c4_value","c4_total"].forEach(id=>bind(id,c4));

  function c5(){
    const income = parseFloat(document.getElementById("c5_income").value);
    const fixed = parseFloat(document.getElementById("c5_fixed").value);
    document.getElementById("c5_result").textContent = (income>0) ? `Hasil: sisa bisa dialokasikan ${fmtRupiah(income-fixed)}` : "Hasil: -";
  }
  ["c5_income","c5_fixed"].forEach(id=>bind(id,c5));

  function c6(){
    const start = parseFloat(document.getElementById("c6_start").value);
    const now = parseFloat(document.getElementById("c6_now").value);
    if(start>0){
      const pl = now-start;
      document.getElementById("c6_result").textContent = `Hasil: P/L ${fmtRupiah(pl)} (${((pl/start)*100).toFixed(2)}%)`;
    } else document.getElementById("c6_result").textContent = "Hasil: -";
  }
  ["c6_start","c6_now"].forEach(id=>bind(id,c6));

  function c7(){
    const principal = parseFloat(document.getElementById("c7_principal").value);
    const rate = parseFloat(document.getElementById("c7_rate").value);
    const years = parseFloat(document.getElementById("c7_years").value);
    if(principal>0 && rate>=0 && years>0){
      const result = principal * Math.pow(1+rate/100, years);
      document.getElementById("c7_result").textContent = `Hasil: ${fmtRupiah(result)} setelah ${years} tahun`;
    } else document.getElementById("c7_result").textContent = "Hasil: -";
  }
  ["c7_principal","c7_rate","c7_years"].forEach(id=>bind(id,c7));
}

/* ---- Statistics ---- */
let statsFilter = "weekly";
function initStatsFilter(){
  document.querySelectorAll("#statsFilter .tab").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      statsFilter = btn.dataset.filter;
      document.querySelectorAll("#statsFilter .tab").forEach(b=>b.classList.toggle("active", b===btn));
      renderStatistics();
    });
  });
}

function renderStatistics(){
  const days = statsFilter==="weekly"?7:statsFilter==="monthly"?30:365;
  const cutoff = Date.now()-days*86400000;
  const txs = state.transactions.filter(t=> new Date(t.date).getTime() >= cutoff);
  const savings = txs.filter(t=>t.type==="SAVING");
  const expenses = txs.filter(t=>t.type==="EXPENSE");
  const totalSaving = savings.reduce((s,t)=>s+t.amount,0);
  const totalExpense = expenses.reduce((s,t)=>s+t.amount,0);
  const uniqueDays = new Set(savings.map(t=>t.date)).size || 1;
  const avgDaily = totalSaving/uniqueDays;
  const {current} = computeStreak();
  let bestDay = "-", bestAmt = -1;
  const byDay = {};
  savings.forEach(t=>{ byDay[t.date]=(byDay[t.date]||0)+t.amount; });
  Object.keys(byDay).forEach(d=>{ if(byDay[d]>bestAmt){ bestAmt=byDay[d]; bestDay=d; } });
  let largestExpense = 0;
  expenses.forEach(t=>{ if(t.amount>largestExpense) largestExpense=t.amount; });

  document.getElementById("s_totalSaving").textContent = fmtRupiah(totalSaving);
  document.getElementById("s_avgDaily").textContent = fmtRupiah(avgDaily);
  document.getElementById("s_streak").textContent = current+" hari";
  document.getElementById("s_bestDay").textContent = bestDay!=="-" ? fmtDateID(bestDay) : "-";
  document.getElementById("s_totalExpense").textContent = fmtRupiah(totalExpense);
  document.getElementById("s_largestExpense").textContent = fmtRupiah(largestExpense);

  drawStatsChart(byDay, days);
}

function drawStatsChart(byDay, days){
  const canvas = document.getElementById("statsCanvas");
  const dpr = window.devicePixelRatio||1;
  const rect = canvas.getBoundingClientRect();
  if(rect.width===0) return;
  canvas.width = rect.width*dpr; canvas.height=rect.height*dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const W=rect.width, H=rect.height;
  ctx.clearRect(0,0,W,H);

  const bucket = days<=7?7:(days<=30?10:12);
  const labels = [], values = [];
  const now = new Date();
  const stepDays = Math.ceil(days/bucket);
  for(let i=bucket-1;i>=0;i--){
    let sum=0;
    for(let d=0; d<stepDays; d++){
      const dt = new Date(now); dt.setDate(dt.getDate()-(i*stepDays+d));
      sum += byDay[dt.toISOString().slice(0,10)]||0;
    }
    values.push(sum);
    const lbl = new Date(now); lbl.setDate(lbl.getDate()-i*stepDays);
    labels.push((lbl.getMonth()+1)+"/"+lbl.getDate());
  }
  const max = Math.max(...values, 1);
  const marginL=6, marginR=6, marginT=10, marginB=16;
  const plotW = W-marginL-marginR, plotH = H-marginT-marginB;
  const bw = plotW/values.length;
  ctx.fillStyle="#FFD400";
  values.forEach((v,i)=>{
    const h = (v/max)*plotH;
    const x = marginL + i*bw + bw*0.15;
    const y = marginT + (plotH-h);
    ctx.fillRect(x, y, bw*0.7, h);
    ctx.strokeStyle="#000"; ctx.lineWidth=2; ctx.strokeRect(x,y,bw*0.7,h);
  });
  ctx.fillStyle="#000"; ctx.font="9px Arial";
  labels.forEach((l,i)=>{
    if(i%Math.ceil(labels.length/6)===0) ctx.fillText(l, marginL+i*bw, H-4);
  });
}

/* ---- Achievements ---- */
function unlockAchievement(id){
  if(state.achievements.includes(id)) return;
  state.achievements.push(id);
  save();
  const a = ACHIEVEMENTS.find(x=>x.id===id);
  if(a) pushNotif(`Achievement terbuka: ${a.name} ${a.icon}`);
  if(currentPage==="lainnya" && currentToolsTab==="achv") renderAchievements();
}

function renderAchievements(){
  const box = document.getElementById("achvGrid");
  box.innerHTML = ACHIEVEMENTS.map(a=>{
    const unlocked = state.achievements.includes(a.id);
    return `<div class="achv-item ${unlocked?"unlocked":""}"><span class="achv-icon">${a.icon}</span><span class="achv-name">${a.name}</span></div>`;
  }).join("");
}

/* ---- Notes ---- */
function renderNotes(){
  const box = document.getElementById("notesList");
  const q = (document.getElementById("noteSearch").value||"").toLowerCase();
  const filtered = state.notes.filter(n=>(n.title+n.content).toLowerCase().includes(q));
  if(filtered.length===0){ box.innerHTML='<p class="empty">Belum ada catatan.</p>'; return; }
  box.innerHTML = [...filtered].sort((a,b)=>b.date.localeCompare(a.date)).map(n=>`
    <div class="note-item">
      <div class="note-head"><span>${escapeHtml(n.title)}</span><span class="note-type">${n.type}</span></div>
      <div class="note-content">${escapeHtml(n.content)}</div>
      <div class="note-actions">
        <button data-edit="${n.id}">EDIT</button>
        <button data-del="${n.id}">HAPUS</button>
      </div>
    </div>`).join("");
  box.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click", ()=>openNoteModal(b.dataset.edit)));
  box.querySelectorAll("[data-del]").forEach(b=>b.addEventListener("click", ()=>{
    state.notes = state.notes.filter(n=>n.id!==b.dataset.del);
    save(); renderNotes();
  }));
}

function openNoteModal(editId){
  const editing = editId ? state.notes.find(n=>n.id===editId) : null;
  const type = editing ? editing.type : "Savings Plan";
  const body = `
    <button class="modal-close" data-close>✕</button>
    <h2>${editing?"Edit":"Tambah"} Catatan</h2>
    <div class="field"><label>Tipe</label>
      <select class="text-input" id="nType">
        <option ${type==="Savings Plan"?"selected":""}>Savings Plan</option>
        <option ${type==="Trading Notes"?"selected":""}>Trading Notes</option>
        <option ${type==="Reminder"?"selected":""}>Reminder</option>
      </select>
    </div>
    <div class="field"><label>Judul</label><input class="text-input" id="nTitle" value="${editing?escapeHtml(editing.title):""}"></div>
    <div class="field"><label>Isi</label><textarea class="text-input" id="nContent" rows="5">${editing?escapeHtml(editing.content):""}</textarea></div>
    <div class="modal-actions"><button class="btn btn-primary btn-block" id="nSave">SIMPAN</button></div>
  `;
  openModal(body);
  document.getElementById("nSave").addEventListener("click", ()=>{
    const type = document.getElementById("nType").value;
    const title = document.getElementById("nTitle").value.trim();
    const content = document.getElementById("nContent").value.trim();
    if(!title){ toast("Judul wajib diisi"); return; }
    if(editing){ Object.assign(editing, {type,title,content}); }
    else { state.notes.push({id:uid(), type, title, content, date:new Date().toISOString()}); }
    save();
    closeModal();
    renderNotes();
  });
}

/* ---- Data (export/import/backup/restore/reset) ---- */
function initDataActions(){
  document.getElementById("exportBtn").addEventListener("click", exportData);
  document.getElementById("backupBtn").addEventListener("click", exportData);
  document.getElementById("importFile").addEventListener("change", (e)=>importData(e.target.files[0]));
  document.getElementById("restoreFile").addEventListener("change", (e)=>importData(e.target.files[0]));
  document.getElementById("resetBtn").addEventListener("click", confirmReset);
}

function exportData(){
  const blob = new Blob([JSON.stringify(state,null,2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "fect-exchange-backup-"+todayISO()+".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("Data diexport");
}

function importData(file){
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const imported = JSON.parse(reader.result);
      if(!imported || typeof imported !== "object") throw new Error("format tidak valid");
      state = Object.assign({}, defaultState(), imported);
      save();
      toast("Data berhasil diimport");
      renderAll();
    }catch(e){
      toast("Gagal import: file tidak valid");
    }
  };
  reader.readAsText(file);
}

function confirmReset(){
  const body = `
    <button class="modal-close" data-close>✕</button>
    <h2>Reset Semua Data?</h2>
    <p style="font-size:13px;margin-bottom:14px">Tindakan ini akan menghapus seluruh data (transaksi, target, catatan) secara permanen dan tidak dapat dibatalkan.</p>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" data-close>BATAL</button>
      <button class="btn btn-danger btn-block" id="confirmResetBtn">HAPUS SEMUA</button>
    </div>
  `;
  openModal(body);
  document.getElementById("confirmResetBtn").addEventListener("click", ()=>{
    state = defaultState();
    initMarket();
    save();
    closeModal();
    toast("Semua data telah direset");
    renderAll();
  });
}

/* ============================================================
   PREMIUM / PROMO (UI demo only — no real payment collection)
   ============================================================ */
const PROMO_CODE = "GETPREM34%";
const PROMO_PCT = 34;
const BASE_PRICE = 1.00;

function openPremiumPage(prefillPromo){
  goToPage("premium");
  document.getElementById("promoMsg").textContent = "";
  document.getElementById("priceDiscountRow").classList.add("hidden");
  if(prefillPromo){
    document.getElementById("promoInput").value = PROMO_CODE;
    applyPromo();
  } else {
    document.getElementById("promoInput").value = "";
    updatePriceDisplay(0);
  }
}

function goToPage_premiumOverride(){}

function applyPromo(){
  const code = document.getElementById("promoInput").value.trim().toUpperCase();
  const msg = document.getElementById("promoMsg");
  if(code === PROMO_CODE){
    updatePriceDisplay(PROMO_PCT);
    msg.textContent = `Kode promo diterapkan — diskon ${PROMO_PCT}% ✅`;
    document.getElementById("promoCodeLabel").textContent = PROMO_CODE;
    document.getElementById("priceDiscountRow").classList.remove("hidden");
  } else if(code===""){
    updatePriceDisplay(0);
    msg.textContent = "";
  } else {
    updatePriceDisplay(0);
    msg.textContent = "Kode promo tidak valid.";
    document.getElementById("priceDiscountRow").classList.add("hidden");
  }
}

function updatePriceDisplay(discountPct){
  const discountAmt = BASE_PRICE * (discountPct/100);
  const total = BASE_PRICE - discountAmt;
  document.getElementById("priceNormal").textContent = "$"+BASE_PRICE.toFixed(2);
  document.getElementById("priceDiscount").textContent = "-$"+discountAmt.toFixed(2);
  document.getElementById("priceTotal").textContent = "$"+total.toFixed(2);
}

function initPremiumPage(){
  document.getElementById("premiumBack").addEventListener("click", ()=>goToPage("home"));
  document.getElementById("applyPromoBtn").addEventListener("click", applyPromo);
  document.getElementById("skipPromoBtn").addEventListener("click", ()=>{
    document.getElementById("promoInput").value="";
    updatePriceDisplay(0);
    document.getElementById("promoMsg").textContent="";
    document.getElementById("priceDiscountRow").classList.add("hidden");
    document.querySelector(".section-block:nth-of-type(2)")?.scrollIntoView({behavior:"smooth"});
  });
  document.getElementById("payBtn").addEventListener("click", ()=>{
    toast("Pembayaran belum terhubung ke payment gateway (versi demo)");
  });
}

function initWelcomePopup(){
  const overlay = document.getElementById("welcomeOverlay");
  document.getElementById("welcomeContinueBtn").addEventListener("click", ()=>{
    overlay.classList.add("hidden");
    state.premium.welcomeShown = true;
    save();
    openPremiumPage(true);
  });
  document.getElementById("welcomeDismissBtn").addEventListener("click", ()=>{
    overlay.classList.add("hidden");
    state.premium.welcomeShown = true;
    save();
  });
  if(!state.premium.welcomeShown){
    setTimeout(()=>overlay.classList.remove("hidden"), 500);
  }
}

/* ============================================================
   MODAL
   ============================================================ */
function openModal(html){
  document.getElementById("modalBox").innerHTML = html;
  document.getElementById("modalOverlay").classList.remove("hidden");
  document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click", closeModal));
}
function closeModal(){
  document.getElementById("modalOverlay").classList.add("hidden");
  document.getElementById("modalBox").innerHTML="";
}

/* ============================================================
   BOOT
   ============================================================ */
function renderAll(){
  updateHeaderBalance();
  renderNotifBadge();
  renderPage(currentPage);
}

function boot(){
  initMarket();
  initHeader();
  initNav();
  initQuickActions();
  initAnalisaControls();
  initToolsTabs();
  initCalculators();
  initStatsFilter();
  initDataActions();
  initPremiumPage();
  initWelcomePopup();

  document.getElementById("addTargetBtn").addEventListener("click", ()=>openTargetModal());
  document.getElementById("editBudgetBtn").addEventListener("click", openBudgetModal);
  document.getElementById("marketSearch")?.addEventListener("input", ()=>{});
  document.getElementById("addNoteBtn").addEventListener("click", ()=>openNoteModal());
  document.getElementById("noteSearch").addEventListener("input", renderNotes);
  document.getElementById("modalOverlay").addEventListener("click",(e)=>{ if(e.target.id==="modalOverlay") closeModal(); });

  lastStreak = computeStreak().current;
  goToPage("home");
  renderNotifBadge();
  setInterval(tickMarket, 3000);
  window.addEventListener("resize", ()=>{
    if(currentPage==="analisa") renderChart();
    if(currentPage==="lainnya" && currentToolsTab==="stats") renderStatistics();
  });
}

document.addEventListener("DOMContentLoaded", ()=>{
  load();
  boot();
});

})();
