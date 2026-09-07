/* ============================================================
   THE FECT EXCHANGE — APP LOGIC
   Semua data disimpan di localStorage (client-side only).
   PAPER TRADING = SIMULASI. Tidak ada transaksi uang nyata.
   ============================================================ */

(function(){
"use strict";

/* ---------------- CONSTANTS ---------------- */
const STORAGE_KEY = "fectExchange_v1";
const PAIRS = [
  {sym:"BTC/USDT", base:68000000, vol:0.006},
  {sym:"ETH/USDT", base:3600000,  vol:0.008},
  {sym:"SOL/USDT", base:2300000,  vol:0.012},
  {sym:"XRP/USDT", base:8500,     vol:0.015},
  {sym:"DOGE/USDT",base:2200,     vol:0.02},
  {sym:"BNB/USDT", base:9800000,  vol:0.009},
  {sym:"ADA/USDT", base:6200,     vol:0.014},
];
const TIMEFRAMES = {"1M":60000,"5M":300000,"15M":900000,"1H":3600000,"4H":14400000,"1D":86400000};
const ACHIEVEMENTS = [
  {id:"first_save", name:"First Save", icon:"💰", desc:"Nabung pertama kali"},
  {id:"streak7", name:"7 Day Streak", icon:"🔥", desc:"Nabung 7 hari beruntun"},
  {id:"streak30", name:"30 Day Streak", icon:"🏆", desc:"Nabung 30 hari beruntun"},
  {id:"first_target", name:"First Target", icon:"🎯", desc:"Buat target pertama"},
  {id:"target_complete", name:"Target Complete", icon:"✅", desc:"Selesaikan sebuah target"},
  {id:"first_trade", name:"First Paper Trade", icon:"📈", desc:"Transaksi paper trading pertama"},
];

/* ---------------- STATE ---------------- */
let state = null;

function defaultState(){
  return {
    account:{ username:"", telegramId:"", loggedIn:false },
    transactions:[],        // {id,date,time,category,description,type,amount}
    targets:[],              // {id,name,targetAmount,collected,deadline,primary,completed}
    budgets:{
      weekly:{amount:0},
      monthly:{amount:0}
    },
    notes:[],                 // {id,type,title,content,date}
    watchlist:["BTC/USDT","ETH/USDT","SOL/USDT"],
    paper:{
      balance:100000000,
      positions:{},          // sym -> {qty, avgEntry}
      orders:[],             // limit orders pending {id,sym,side,type,price,qty,total,date}
      history:[]             // executed trades {id,sym,side,price,qty,total,date,realizedPl}
    },
    achievements:[],          // unlocked ids
    notifications:[],         // {id,text,date,read}
    market:{},                // sym -> {price, open24, high, low, vol, candles:{tf:[...]}}
    settings:{}
  };
}

function load(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      state = JSON.parse(raw);
      // merge in any new default fields for forward-compat
      const d = defaultState();
      state = Object.assign({}, d, state);
      state.paper = Object.assign({}, d.paper, state.paper);
      state.budgets = Object.assign({}, d.budgets, state.budgets);
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
function todayISO(){ return new Date().toISOString().slice(0,10); }
function nowTime(){ const d=new Date(); return d.getHours().toString().padStart(2,"0")+":"+d.getMinutes().toString().padStart(2,"0"); }
function fmtDateID(iso){
  const d = new Date(iso+"T00:00:00");
  return d.toLocaleDateString("id-ID",{day:"numeric",month:"short",year:"numeric"});
}
function daysBetween(a,b){
  return Math.round((new Date(b)-new Date(a))/86400000);
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

function escapeHtml(s){
  const div = document.createElement("div");
  div.textContent = s==null?"":String(s);
  return div.innerHTML;
}

/* ============================================================
   LOGIN
   ============================================================ */
function initLogin(){
  const loginScreen = document.getElementById("loginScreen");
  const app = document.getElementById("app");

  if(state.account.loggedIn){
    loginScreen.classList.add("hidden");
    app.classList.remove("hidden");
    boot();
    return;
  }

  document.getElementById("loginBtn").addEventListener("click", ()=>{
    const uname = document.getElementById("tgUsername").value.trim().replace(/^@/,"");
    const tgid = document.getElementById("tgId").value.trim();
    if(!uname){ toast("Masukkan username Telegram"); return; }
    if(!tgid || !/^[0-9]+$/.test(tgid)){ toast("Telegram ID harus berupa angka"); return; }
    state.account = { username: uname, telegramId: tgid, loggedIn:true };
    save();
    loginScreen.classList.add("hidden");
    app.classList.remove("hidden");
    boot();
  });
}

function logout(){
  state.account.loggedIn = false;
  save();
  location.reload();
}

/* ============================================================
   MARKET ENGINE (SIMULATION)
   ============================================================ */
function initMarket(){
  const needsInit = Object.keys(state.market).length === 0;
  PAIRS.forEach(p=>{
    if(!state.market[p.sym]){
      state.market[p.sym] = {
        price: p.base,
        open24: p.base,
        high: p.base,
        low: p.base,
        vol: Math.round(p.base * (500+Math.random()*2000)),
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
  PAIRS.forEach(p=>{
    const m = state.market[p.sym];
    if(!m) return;
    const change = (Math.random()-0.5) * p.vol * 2 * m.price;
    let newPrice = m.price + change;
    if(newPrice <= 0) newPrice = m.price * 0.995;
    m.price = newPrice;
    m.high = Math.max(m.high, newPrice);
    m.low = Math.min(m.low, newPrice);
    m.vol = m.vol + Math.round((Math.random()-0.4) * p.base * 5);
    if(m.vol < 0) m.vol = Math.round(p.base*100);

    // update last candle of each timeframe (simple: append to 1M always, roll up others occasionally)
    Object.keys(TIMEFRAMES).forEach(tf=>{
      const arr = m.candles[tf];
      const last = arr[arr.length-1];
      const span = TIMEFRAMES[tf];
      if(Date.now() - last.t < span){
        last.c = newPrice;
        last.h = Math.max(last.h, newPrice);
        last.l = Math.min(last.l, newPrice);
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
  if(currentPage==="market") renderMarketPage();
  if(currentPage==="trade" && currentTradeTab==="panel") renderTradePanel(false);
  if(currentPage==="trade" && currentTradeTab==="positions") renderPositions();
  if(currentPage==="trade" && currentTradeTab==="portfolio") renderPortfolioTab();
  if(currentPage==="trade" && currentTradeTab==="watchlist") renderWatchlistTab();
  updateHeaderBalance();
  checkPendingOrders();
}

/* ============================================================
   NAVIGATION
   ============================================================ */
let currentPage = "home";
let currentTradeTab = "panel";
let currentToolsTab = "calc";
let currentTf = "1H";
let currentSymbol = "BTC/USDT";

function initNav(){
  document.querySelectorAll(".nav-btn").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      goToPage(btn.dataset.page);
    });
  });
  document.getElementById("brandHome").addEventListener("click", ()=>goToPage("home"));
}

function goToPage(page){
  currentPage = page;
  document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
  document.getElementById("page-"+page).classList.remove("hidden");
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active", b.dataset.page===page));
  closeDropdowns();
  renderPage(page);
}

function renderPage(page){
  if(page==="home") renderHome();
  else if(page==="market") renderMarketPage();
  else if(page==="trade") renderTradePage();
  else if(page==="target") renderTargetPage();
  else if(page==="tools") renderToolsPage();
}

function closeDropdowns(){
  document.getElementById("searchPanel").classList.add("hidden");
  document.getElementById("notifPanel").classList.add("hidden");
  document.getElementById("profilePanel").classList.add("hidden");
}

/* ============================================================
   HEADER (search / notif / profile)
   ============================================================ */
function initHeader(){
  document.getElementById("searchToggle").addEventListener("click", ()=>{
    toggleDropdown("searchPanel");
  });
  document.getElementById("notifToggle").addEventListener("click", ()=>{
    toggleDropdown("notifPanel");
    state.notifications.forEach(n=>n.read=true);
    save();
    renderNotifBadge();
    renderNotifList();
  });
  document.getElementById("profileToggle").addEventListener("click", ()=>{
    toggleDropdown("profilePanel");
    document.getElementById("profileUsername").textContent = "@"+state.account.username;
    document.getElementById("profileId").textContent = "Telegram ID: " + maskId(state.account.telegramId);
  });
  document.getElementById("logoutBtn").addEventListener("click", logout);

  document.getElementById("searchInput").addEventListener("input", (e)=>{
    doSearch(e.target.value.trim());
  });

  document.addEventListener("click",(e)=>{
    const header = document.querySelector(".header");
    if(!header.contains(e.target)) closeDropdowns();
  });
}

function maskId(id){
  if(!id) return "";
  return id.length>4 ? id.slice(0,4)+"••••" : id+"••••";
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
  PAIRS.filter(p=>p.sym.toLowerCase().includes(ql)).forEach(p=>results.push(`📈 Pair: ${p.sym}`));
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
  const balance = income + saving - expense;
  return {income, expense, saving, balance};
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

function portfolioValue(){
  let val = state.paper.balance;
  Object.keys(state.paper.positions).forEach(sym=>{
    const pos = state.paper.positions[sym];
    const price = state.market[sym] ? state.market[sym].price : pos.avgEntry;
    val += pos.qty * price;
  });
  return val;
}

function updateHeaderBalance(){
  const {balance} = computeTotals();
  document.getElementById("headerBalance").textContent = fmtRupiah(balance);
}

function renderHome(){
  const {income, expense, balance} = computeTotals();
  const plToday = computePlRange(1);
  document.getElementById("homeBalance").textContent = fmtRupiah(balance);
  document.getElementById("homePlToday").textContent = fmtRupiah(plToday);
  document.getElementById("statIncome").textContent = fmtRupiah(income);
  document.getElementById("statExpense").textContent = fmtRupiah(expense);
  document.getElementById("statPl7d").textContent = fmtRupiah(computePlRange(7));
  document.getElementById("statPl30d").textContent = fmtRupiah(computePlRange(30));
  document.getElementById("statTxCount").textContent = state.transactions.length;
  document.getElementById("statPortfolio").textContent = fmtRupiah(portfolioValue());
  updateHeaderBalance();

  // main target
  const main = state.targets.find(t=>t.primary && !t.completed) || state.targets.find(t=>!t.completed);
  const mtBox = document.getElementById("mainTargetCard");
  if(main){
    const pct = Math.min(100, Math.round((main.collected/main.targetAmount)*100));
    mtBox.innerHTML = targetCardHtml(main, pct);
  } else {
    mtBox.innerHTML = '<p class="empty">Belum ada target. Buat di halaman TARGET.</p>';
  }

  // recent activity
  const recentBox = document.getElementById("recentActivity");
  const recent = [...state.transactions].sort((a,b)=> (b.date+b.time) > (a.date+a.time) ? 1:-1).slice(0,6);
  if(recent.length===0){ recentBox.innerHTML = '<p class="empty">Belum ada transaksi.</p>'; }
  else {
    recentBox.innerHTML = recent.map(t=>activityHtml(t)).join("");
  }
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
   TRANSACTIONS (SAVINGS SYSTEM)
   ============================================================ */
function initQuickActions(){
  document.querySelectorAll("[data-action]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const act = btn.dataset.action;
      if(act==="open-nabung") openTxModal("SAVING");
      else if(act==="open-keluar") openTxModal("EXPENSE");
      else if(act==="goto-target") goToPage("target");
      else if(act==="goto-trade") goToPage("trade");
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

/* ============================================================
   STREAK
   ============================================================ */
function computeStreak(){
  const saveDates = new Set(state.transactions.filter(t=>t.type==="SAVING").map(t=>t.date));
  if(saveDates.size===0) return {current:0, best:0};
  const sorted = [...saveDates].sort();
  let best=1, cur=1;
  for(let i=1;i<sorted.length;i++){
    if(daysBetween(sorted[i-1], sorted[i])===1) { cur++; }
    else { cur=1; }
    best = Math.max(best, cur);
  }
  // current streak = consecutive days ending today or yesterday
  let currentStreak = 0;
  let d = new Date();
  for(;;){
    const iso = d.toISOString().slice(0,10);
    if(saveDates.has(iso)){ currentStreak++; d.setDate(d.getDate()-1); }
    else break;
  }
  return {current: currentStreak, best};
}

let lastStreak = 0;
function updateStreakAndCheck(){
  const {current, best} = computeStreak();
  if(current > lastStreak && current>1){
    pushNotif(`Saving streak meningkat: ${current} hari 🔥`);
  }
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
  // near completion notif
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

document.addEventListener("DOMContentLoaded", ()=>{
  const addBtn = document.getElementById("addTargetBtn");
  if(addBtn) addBtn.addEventListener("click", ()=>openTargetModal());
});

/* ---------------- BUDGET ---------------- */
function periodStart(period){
  const d = new Date();
  if(period==="weekly"){
    const day = d.getDay(); // 0 sun
    d.setDate(d.getDate()-day);
  } else {
    d.setDate(1);
  }
  d.setHours(0,0,0,0);
  return d;
}

function budgetSpent(period){
  const start = periodStart(period);
  let spent = 0;
  state.transactions.forEach(t=>{
    if(t.type!=="EXPENSE") return;
    const ts = new Date(t.date+"T00:00:00");
    if(ts >= start) spent += t.amount;
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

document.addEventListener("DOMContentLoaded", ()=>{
  const editBtn = document.getElementById("editBudgetBtn");
  if(editBtn) editBtn.addEventListener("click", openBudgetModal);
});

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
   MARKET PAGE
   ============================================================ */
function renderMarketPage(){
  const box = document.getElementById("marketTable");
  const q = (document.getElementById("marketSearch").value||"").toLowerCase();
  const rows = PAIRS.filter(p=>p.sym.toLowerCase().includes(q)).map(p=>{
    const m = state.market[p.sym];
    const chgPct = ((m.price - m.open24)/m.open24*100);
    const up = chgPct>=0;
    return `<div class="market-row" data-sym="${p.sym}">
      <div><div class="pair-name">${p.sym}</div><div class="pair-sub">Vol ${fmtNum(m.vol,0)}</div></div>
      <div class="price-col">${fmtNum(m.price,2)}<div class="chg ${up?"up":"down"}">${up?"+":""}${chgPct.toFixed(2)}%</div></div>
      <div class="hl">H ${fmtNum(m.high,2)}<br>L ${fmtNum(m.low,2)}</div>
    </div>`;
  }).join("");
  box.innerHTML = rows || '<p class="empty">Pair tidak ditemukan.</p>';
  box.querySelectorAll(".market-row").forEach(row=>{
    row.addEventListener("click", ()=>{
      currentSymbol = row.dataset.sym;
      goToPage("trade");
    });
  });
}
document.addEventListener("DOMContentLoaded", ()=>{
  document.getElementById("marketSearch").addEventListener("input", renderMarketPage);
});

/* ============================================================
   TRADE PAGE
   ============================================================ */
function initTradeTabs(){
  document.querySelectorAll("#tradeTabs .tab").forEach(tab=>{
    tab.addEventListener("click", ()=>{
      currentTradeTab = tab.dataset.tab;
      document.querySelectorAll("#tradeTabs .tab").forEach(t=>t.classList.toggle("active", t===tab));
      document.querySelectorAll("#page-trade .tab-panel").forEach(p=>p.classList.add("hidden"));
      document.getElementById("tab-"+currentTradeTab).classList.remove("hidden");
      renderTradeTabContent();
    });
  });
}

function renderTradePage(){
  const sel = document.getElementById("symbolSelect");
  if(sel.options.length===0){
    sel.innerHTML = PAIRS.map(p=>`<option value="${p.sym}">${p.sym}</option>`).join("");
    sel.addEventListener("change", ()=>{ currentSymbol = sel.value; renderTradePanel(true); });
    document.querySelectorAll(".tf").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        currentTf = btn.dataset.tf;
        document.querySelectorAll(".tf").forEach(b=>b.classList.toggle("active", b===btn));
        renderChart();
      });
    });
    document.querySelectorAll(".ot").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        document.querySelectorAll(".ot").forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById("limitPriceField").style.display = btn.dataset.ot==="LIMIT" ? "block":"none";
        recalcOrderTotal();
      });
    });
    document.getElementById("orderQty").addEventListener("input", recalcOrderTotal);
    document.getElementById("orderPrice").addEventListener("input", recalcOrderTotal);
    document.getElementById("buyBtn").addEventListener("click", ()=>executeOrder("BUY"));
    document.getElementById("sellBtn").addEventListener("click", ()=>executeOrder("SELL"));
  }
  sel.value = currentSymbol;
  renderTradeTabContent();
}

function renderTradeTabContent(){
  if(currentTradeTab==="panel") renderTradePanel(true);
  else if(currentTradeTab==="positions") renderPositions();
  else if(currentTradeTab==="orders") renderOrders();
  else if(currentTradeTab==="history") renderTradeHistory();
  else if(currentTradeTab==="portfolio") renderPortfolioTab();
  else if(currentTradeTab==="watchlist") renderWatchlistTab();
}

function renderTradePanel(full){
  const m = state.market[currentSymbol];
  if(!m) return;
  const chgPct = ((m.price-m.open24)/m.open24*100);
  document.getElementById("tradePrice").textContent = fmtNum(m.price,2);
  const chgEl = document.getElementById("tradeChange");
  chgEl.textContent = (chgPct>=0?"+":"")+chgPct.toFixed(2)+"%";
  chgEl.className = "change "+(chgPct>=0?"up":"down");
  document.getElementById("paperAvail").textContent = fmtRupiah(state.paper.balance);
  document.getElementById("paperEquity").textContent = fmtRupiah(portfolioValue());
  if(full){
    renderChart();
    recalcOrderTotal();
  } else {
    renderOrderBook(); // keep prices live
    updateLastCandlePoint();
  }
  renderOrderBook();
}

function updateLastCandlePoint(){
  renderChart();
}

/* ---- Candlestick chart via Canvas ---- */
function renderChart(){
  const canvas = document.getElementById("chartCanvas");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const W = rect.width, H = rect.height;
  ctx.clearRect(0,0,W,H);

  const m = state.market[currentSymbol];
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

  // grid
  ctx.strokeStyle = "#e5e5e5";
  ctx.lineWidth = 1;
  for(let i=0;i<=4;i++){
    const y = marginT + (plotH/4)*i;
    ctx.beginPath(); ctx.moveTo(marginL,y); ctx.lineTo(W-marginR,y); ctx.stroke();
  }

  candles.forEach((c,i)=>{
    const x = marginL + i*cw + cw/2;
    const yOpen = marginT + plotH*(1-(c.o-min)/(max-min));
    const yClose = marginT + plotH*(1-(c.c-min)/(max-min));
    const yHigh = marginT + plotH*(1-(c.h-min)/(max-min));
    const yLow = marginT + plotH*(1-(c.l-min)/(max-min));
    const up = c.c >= c.o;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, yHigh); ctx.lineTo(x, yLow); ctx.stroke();
    ctx.fillStyle = up ? "#1FA463" : "#E8382C";
    const bw = Math.max(2, cw*0.55);
    const top = Math.min(yOpen,yClose), h = Math.max(1, Math.abs(yClose-yOpen));
    ctx.fillRect(x-bw/2, top, bw, h);
    ctx.strokeStyle="#000"; ctx.strokeRect(x-bw/2, top, bw, h);
  });

  // price label
  ctx.fillStyle="#000";
  ctx.font = "10px Arial";
  ctx.fillText(fmtNum(max,2), marginL, marginT+8);
  ctx.fillText(fmtNum(min,2), marginL, H-4);
}

/* ---- Order book (simulated) ---- */
function renderOrderBook(){
  const m = state.market[currentSymbol];
  const price = m.price;
  document.getElementById("obMid").textContent = fmtNum(price,2);
  const asksHtml = [], bidsHtml = [];
  for(let i=8;i>=1;i--){
    const p = price * (1 + i*0.0015 + Math.random()*0.0004);
    const amt = Math.random()*2;
    asksHtml.push(`<div class="ob-row"><span>${fmtNum(p,2)}</span><span>${amt.toFixed(4)}</span><span>${fmtNum(p*amt,0)}</span></div>`);
  }
  for(let i=1;i<=8;i++){
    const p = price * (1 - i*0.0015 - Math.random()*0.0004);
    const amt = Math.random()*2;
    bidsHtml.push(`<div class="ob-row"><span>${fmtNum(p,2)}</span><span>${amt.toFixed(4)}</span><span>${fmtNum(p*amt,0)}</span></div>`);
  }
  document.getElementById("obAsks").innerHTML = asksHtml.join("");
  document.getElementById("obBids").innerHTML = bidsHtml.join("");
}

/* ---- Order form ---- */
function recalcOrderTotal(){
  const type = document.querySelector(".ot.active").dataset.ot;
  const qty = parseFloat(document.getElementById("orderQty").value)||0;
  let price;
  if(type==="LIMIT"){
    price = parseFloat(document.getElementById("orderPrice").value)||0;
  } else {
    price = state.market[currentSymbol].price;
  }
  document.getElementById("orderTotal").value = fmtRupiah(qty*price);
}

function executeOrder(side){
  const type = document.querySelector(".ot.active").dataset.ot;
  const qty = parseFloat(document.getElementById("orderQty").value);
  if(!qty || qty<=0){ toast("Masukkan quantity"); return; }
  const marketPrice = state.market[currentSymbol].price;
  let price = marketPrice;
  if(type==="LIMIT"){
    price = parseFloat(document.getElementById("orderPrice").value);
    if(!price || price<=0){ toast("Masukkan price limit"); return; }
  }
  const total = qty*price;

  if(type==="LIMIT"){
    // check if would fill immediately, else queue as pending order
    const wouldFillNow = (side==="BUY" && price>=marketPrice) || (side==="SELL" && price<=marketPrice);
    if(!wouldFillNow){
      if(side==="BUY" && total > state.paper.balance){ toast("Saldo tidak cukup"); return; }
      state.paper.orders.push({id:uid(), sym:currentSymbol, side, type, price, qty, total, date:new Date().toISOString()});
      save();
      toast(`Order LIMIT ${side} ${currentSymbol} dipasang`);
      renderOrders();
      return;
    }
  }
  fillOrder(currentSymbol, side, price, qty);
}

function fillOrder(sym, side, price, qty){
  const total = price*qty;
  const isFirstTrade = state.paper.history.length===0;
  if(side==="BUY"){
    if(total > state.paper.balance){ toast("Saldo tidak cukup"); return; }
    state.paper.balance -= total;
    const pos = state.paper.positions[sym] || {qty:0, avgEntry:0};
    const newQty = pos.qty + qty;
    pos.avgEntry = newQty>0 ? ((pos.avgEntry*pos.qty) + total)/newQty : 0;
    pos.qty = newQty;
    state.paper.positions[sym] = pos;
    state.paper.history.unshift({id:uid(), sym, side, price, qty, total, date:new Date().toISOString(), realizedPl:0});
  } else {
    const pos = state.paper.positions[sym];
    if(!pos || pos.qty < qty){ toast("Posisi tidak cukup untuk dijual"); return; }
    const realizedPl = (price - pos.avgEntry) * qty;
    pos.qty -= qty;
    state.paper.balance += total;
    if(pos.qty <= 0.00000001){ delete state.paper.positions[sym]; }
    else state.paper.positions[sym] = pos;
    state.paper.history.unshift({id:uid(), sym, side, price, qty, total, date:new Date().toISOString(), realizedPl});
  }
  if(isFirstTrade) unlockAchievement("first_trade");
  save();
  pushNotif(`Paper trade berhasil: ${side} ${fmtNum(qty,4)} ${sym}`);
  document.getElementById("orderQty").value="";
  recalcOrderTotal();
  renderTradePanel(true);
}

function checkPendingOrders(){
  if(!state.paper.orders.length) return;
  const remaining = [];
  let changed = false;
  state.paper.orders.forEach(o=>{
    const mp = state.market[o.sym] ? state.market[o.sym].price : null;
    if(mp!=null && ((o.side==="BUY" && mp<=o.price) || (o.side==="SELL" && mp>=o.price))){
      changed = true;
      fillOrder(o.sym, o.side, o.price, o.qty);
    } else {
      remaining.push(o);
    }
  });
  if(changed){
    state.paper.orders = remaining;
    save();
    if(currentPage==="trade" && currentTradeTab==="orders") renderOrders();
  }
}

function renderPositions(){
  const box = document.getElementById("positionsList");
  const syms = Object.keys(state.paper.positions);
  if(syms.length===0){ box.innerHTML='<p class="empty">Belum ada posisi terbuka.</p>'; return; }
  box.innerHTML = syms.map(sym=>{
    const pos = state.paper.positions[sym];
    const price = state.market[sym] ? state.market[sym].price : pos.avgEntry;
    const upl = (price - pos.avgEntry) * pos.qty;
    return `<div class="position-item">
      <div class="position-head"><span>${sym}</span><span>${upl>=0?"+":""}${fmtRupiah(upl)}</span></div>
      <div class="position-body">
        <span>Qty: ${fmtNum(pos.qty,4)}</span>
        <span>Avg: ${fmtNum(pos.avgEntry,2)}</span>
        <span>Now: ${fmtNum(price,2)}</span>
      </div>
      <div class="target-actions" style="margin-top:8px"><button data-sym="${sym}" data-close-pos>TUTUP POSISI</button></div>
    </div>`;
  }).join("");
  box.querySelectorAll("[data-close-pos]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const sym = btn.dataset.sym;
      const pos = state.paper.positions[sym];
      if(pos) fillOrder(sym, "SELL", state.market[sym].price, pos.qty);
      renderPositions();
    });
  });
}

function renderOrders(){
  const box = document.getElementById("ordersList");
  if(state.paper.orders.length===0){ box.innerHTML='<p class="empty">Belum ada order terbuka.</p>'; return; }
  box.innerHTML = state.paper.orders.map(o=>`
    <div class="order-item">
      <div class="position-head"><span>${o.side} ${o.sym}</span><span>${o.type}</span></div>
      <div class="position-body"><span>Price: ${fmtNum(o.price,2)}</span><span>Qty: ${fmtNum(o.qty,4)}</span><span>Total: ${fmtRupiah(o.total)}</span></div>
      <div class="target-actions" style="margin-top:8px"><button data-id="${o.id}" data-cancel>BATALKAN</button></div>
    </div>`).join("");
  box.querySelectorAll("[data-cancel]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      state.paper.orders = state.paper.orders.filter(o=>o.id!==btn.dataset.id);
      save();
      renderOrders();
    });
  });
}

function renderTradeHistory(){
  const box = document.getElementById("tradeHistoryList");
  if(state.paper.history.length===0){ box.innerHTML='<p class="empty">Belum ada histori trading.</p>'; return; }
  box.innerHTML = state.paper.history.slice(0,50).map(h=>`
    <div class="history-item">
      <div class="position-head"><span>${h.side} ${h.sym}</span><span>${new Date(h.date).toLocaleString("id-ID")}</span></div>
      <div class="position-body"><span>Price: ${fmtNum(h.price,2)}</span><span>Qty: ${fmtNum(h.qty,4)}</span><span>Realized P/L: ${fmtRupiah(h.realizedPl)}</span></div>
    </div>`).join("");
}

function renderPortfolioTab(){
  const positions = state.paper.positions;
  let posValue = 0;
  const alloc = [];
  Object.keys(positions).forEach(sym=>{
    const pos = positions[sym];
    const price = state.market[sym] ? state.market[sym].price : pos.avgEntry;
    const val = pos.qty*price;
    posValue += val;
    alloc.push({sym, val});
  });
  alloc.push({sym:"Cash (IDR)", val: state.paper.balance});
  const total = posValue + state.paper.balance;
  const startCapital = 100000000;
  const pl = total - startCapital;
  document.getElementById("pfTotal").textContent = fmtRupiah(total);
  document.getElementById("pfAvail").textContent = fmtRupiah(state.paper.balance);
  document.getElementById("pfPl").textContent = fmtRupiah(pl);
  document.getElementById("pfPlPct").textContent = ((pl/startCapital)*100).toFixed(2)+"%";
  drawAllocation(alloc, total);
}

function drawAllocation(alloc, total){
  const canvas = document.getElementById("allocCanvas");
  const dpr = window.devicePixelRatio||1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width*dpr; canvas.height = rect.height*dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const W=rect.width, H=rect.height;
  ctx.clearRect(0,0,W,H);
  const colors = ["#FFD400","#000000","#1FA463","#E8382C","#6b6b6b","#8899AA","#B08968"];
  const cx = W/2, cy=H/2, r = Math.min(W,H)/2 - 10;
  let start = -Math.PI/2;
  const legend = [];
  alloc.forEach((a,i)=>{
    if(total<=0) return;
    const frac = a.val/total;
    if(frac<=0) return;
    const end = start + frac*Math.PI*2;
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,r,start,end);
    ctx.closePath();
    ctx.fillStyle = colors[i%colors.length];
    ctx.fill();
    ctx.strokeStyle="#000"; ctx.lineWidth=2; ctx.stroke();
    legend.push(`<span><span class="swatch" style="background:${colors[i%colors.length]}"></span>${a.sym} ${(frac*100).toFixed(1)}%</span>`);
    start = end;
  });
  document.getElementById("allocLegend").innerHTML = legend.join("");
}

function renderWatchlistTab(){
  const box = document.getElementById("watchlistList");
  if(state.watchlist.length===0){ box.innerHTML = '<p class="empty">Watchlist kosong.</p>'; }
  else {
    box.innerHTML = state.watchlist.map(sym=>{
      const m = state.market[sym];
      if(!m) return "";
      const chg = ((m.price-m.open24)/m.open24*100);
      return `<div class="market-row" data-sym="${sym}">
        <div><div class="pair-name">${sym}</div></div>
        <div class="price-col">${fmtNum(m.price,2)}<div class="chg ${chg>=0?"up":"down"}">${chg>=0?"+":""}${chg.toFixed(2)}%</div></div>
        <div class="hl"><button data-remove="${sym}" style="border:2px solid #000;background:#fff;font-weight:900;font-size:10px;padding:4px 6px">HAPUS</button></div>
      </div>`;
    }).join("");
    box.querySelectorAll("[data-remove]").forEach(btn=>{
      btn.addEventListener("click", (e)=>{
        e.stopPropagation();
        state.watchlist = state.watchlist.filter(s=>s!==btn.dataset.remove);
        save();
        renderWatchlistTab();
      });
    });
    box.querySelectorAll(".market-row").forEach(row=>{
      row.addEventListener("click", ()=>{
        currentSymbol = row.dataset.sym;
        document.querySelector('[data-tab="panel"]').click();
        document.getElementById("symbolSelect").value = currentSymbol;
        renderTradePanel(true);
      });
    });
  }
  // add-to-watchlist control
  const allNotAdded = PAIRS.filter(p=>!state.watchlist.includes(p.sym));
  if(allNotAdded.length){
    box.innerHTML += `<div class="field" style="margin-top:10px">
      <label>Tambah ke Watchlist</label>
      <select class="text-input" id="addWatchSelect">${allNotAdded.map(p=>`<option value="${p.sym}">${p.sym}</option>`).join("")}</select>
      <button class="btn btn-primary btn-block" style="margin-top:8px" id="addWatchBtn">TAMBAH</button>
    </div>`;
    document.getElementById("addWatchBtn").addEventListener("click", ()=>{
      const sym = document.getElementById("addWatchSelect").value;
      state.watchlist.push(sym);
      save();
      renderWatchlistTab();
    });
  }
}

/* ============================================================
   TOOLS PAGE
   ============================================================ */
function initToolsTabs(){
  document.querySelectorAll("#toolsTabs .tab").forEach(tab=>{
    tab.addEventListener("click", ()=>{
      currentToolsTab = tab.dataset.tab;
      document.querySelectorAll("#toolsTabs .tab").forEach(t=>t.classList.toggle("active", t===tab));
      document.querySelectorAll("#page-tools .tab-panel").forEach(p=>p.classList.add("hidden"));
      document.getElementById("tools-"+currentToolsTab).classList.remove("hidden");
      if(currentToolsTab==="stats") renderStatistics();
      if(currentToolsTab==="achv") renderAchievements();
      if(currentToolsTab==="notes") renderNotes();
    });
  });
}

function renderToolsPage(){
  document.querySelectorAll("#page-tools .tab-panel").forEach(p=>p.classList.add("hidden"));
  document.getElementById("tools-"+currentToolsTab).classList.remove("hidden");
  if(currentToolsTab==="stats") renderStatistics();
  if(currentToolsTab==="achv") renderAchievements();
  if(currentToolsTab==="notes") renderNotes();
}

/* ---- Calculators ---- */
function initCalculators(){
  const bind = (id, fn) => { const el = document.getElementById(id); if(el) el.addEventListener("input", fn); };

  function c1(){
    const target = parseFloat(document.getElementById("c1_target").value);
    const per = parseFloat(document.getElementById("c1_permonth").value);
    const el = document.getElementById("c1_result");
    if(target>0 && per>0) el.textContent = `Hasil: butuh ${Math.ceil(target/per)} bulan`;
    else el.textContent = "Hasil: -";
  }
  ["c1_target","c1_permonth"].forEach(id=>bind(id,c1));

  function c2(){
    const target = parseFloat(document.getElementById("c2_target").value);
    const days = parseFloat(document.getElementById("c2_days").value);
    const el = document.getElementById("c2_result");
    if(target>0 && days>0) el.textContent = `Hasil: nabung ${fmtRupiah(target/days)} / hari`;
    else el.textContent = "Hasil: -";
  }
  ["c2_target","c2_days"].forEach(id=>bind(id,c2));

  function c3(){
    const remain = parseFloat(document.getElementById("c3_remain").value);
    const perday = parseFloat(document.getElementById("c3_perday").value);
    const el = document.getElementById("c3_result");
    if(remain>0 && perday>0) el.textContent = `Hasil: ${Math.ceil(remain/perday)} hari lagi`;
    else el.textContent = "Hasil: -";
  }
  ["c3_remain","c3_perday"].forEach(id=>bind(id,c3));

  function c4(){
    const value = parseFloat(document.getElementById("c4_value").value);
    const total = parseFloat(document.getElementById("c4_total").value);
    const el = document.getElementById("c4_result");
    if(total>0) el.textContent = `Hasil: ${((value/total)*100).toFixed(2)}%`;
    else el.textContent = "Hasil: -";
  }
  ["c4_value","c4_total"].forEach(id=>bind(id,c4));

  function c5(){
    const income = parseFloat(document.getElementById("c5_income").value);
    const fixed = parseFloat(document.getElementById("c5_fixed").value);
    const el = document.getElementById("c5_result");
    if(income>0) el.textContent = `Hasil: sisa bisa dialokasikan ${fmtRupiah(income-fixed)}`;
    else el.textContent = "Hasil: -";
  }
  ["c5_income","c5_fixed"].forEach(id=>bind(id,c5));

  function c6(){
    const start = parseFloat(document.getElementById("c6_start").value);
    const now = parseFloat(document.getElementById("c6_now").value);
    const el = document.getElementById("c6_result");
    if(start>0){
      const pl = now-start;
      el.textContent = `Hasil: P/L ${fmtRupiah(pl)} (${((pl/start)*100).toFixed(2)}%)`;
    } else el.textContent = "Hasil: -";
  }
  ["c6_start","c6_now"].forEach(id=>bind(id,c6));

  function c7(){
    const principal = parseFloat(document.getElementById("c7_principal").value);
    const rate = parseFloat(document.getElementById("c7_rate").value);
    const years = parseFloat(document.getElementById("c7_years").value);
    const el = document.getElementById("c7_result");
    if(principal>0 && rate>=0 && years>0){
      const result = principal * Math.pow(1+rate/100, years);
      el.textContent = `Hasil: ${fmtRupiah(result)} setelah ${years} tahun`;
    } else el.textContent = "Hasil: -";
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
  canvas.width = rect.width*dpr; canvas.height=rect.height*dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const W=rect.width, H=rect.height;
  ctx.clearRect(0,0,W,H);

  const bucket = days<=7?7:(days<=30?10:12);
  const labels = [];
  const values = [];
  const now = new Date();
  const stepDays = Math.ceil(days/bucket);
  for(let i=bucket-1;i>=0;i--){
    let sum=0;
    for(let d=0; d<stepDays; d++){
      const dt = new Date(now); dt.setDate(dt.getDate()-(i*stepDays+d));
      const iso = dt.toISOString().slice(0,10);
      sum += byDay[iso]||0;
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
  if(currentPage==="tools" && currentToolsTab==="achv") renderAchievements();
}

function renderAchievements(){
  const box = document.getElementById("achvGrid");
  box.innerHTML = ACHIEVEMENTS.map(a=>{
    const unlocked = state.achievements.includes(a.id);
    return `<div class="achv-item ${unlocked?"unlocked":""}">
      <span class="achv-icon">${a.icon}</span>
      <span class="achv-name">${a.name}</span>
    </div>`;
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
document.addEventListener("DOMContentLoaded", ()=>{
  document.getElementById("addNoteBtn").addEventListener("click", ()=>openNoteModal());
  document.getElementById("noteSearch").addEventListener("input", renderNotes);
});

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
      state.account.loggedIn = true;
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
    <p style="font-size:13px;margin-bottom:14px">Tindakan ini akan menghapus seluruh data (transaksi, target, catatan, paper trading) secara permanen dan tidak dapat dibatalkan.</p>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" data-close>BATAL</button>
      <button class="btn btn-danger btn-block" id="confirmResetBtn">HAPUS SEMUA</button>
    </div>
  `;
  openModal(body);
  document.getElementById("confirmResetBtn").addEventListener("click", ()=>{
    const account = state.account;
    state = defaultState();
    state.account = account;
    initMarket();
    save();
    closeModal();
    toast("Semua data telah direset");
    renderAll();
  });
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
document.addEventListener("DOMContentLoaded", ()=>{
  document.getElementById("modalOverlay").addEventListener("click",(e)=>{
    if(e.target.id==="modalOverlay") closeModal();
  });
});

/* ============================================================
   RENDER ALL / BOOT
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
  initTradeTabs();
  initToolsTabs();
  initCalculators();
  initStatsFilter();
  initDataActions();
  lastStreak = computeStreak().current;
  goToPage("home");
  renderNotifBadge();
  setInterval(tickMarket, 3000);
  window.addEventListener("resize", ()=>{
    if(currentPage==="trade"){
      if(currentTradeTab==="panel") renderChart();
      if(currentTradeTab==="portfolio") renderPortfolioTab();
    }
    if(currentPage==="tools" && currentToolsTab==="stats") renderStatistics();
  });
}

document.addEventListener("DOMContentLoaded", ()=>{
  load();
  initLogin();
});

})();
