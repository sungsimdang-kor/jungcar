
const SHEET_HEADERS = ["사이트ID","문의 날짜","연락처","문의 타입","문의 종류","희망 차량_1","희망 차량_2","희망 차량_3","최소 예산","최대 예산","구매 예정일","할부 여부","방문 여부","담당자","문의 주제","유입 경로","상담 결과","후속 연락일","희망 조건","수정일시"];
const FIXED_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzLkvPc0LutnFOszyKJd0VYlaU13IAz21PBbWISynrKO7UGfbcY5bp4ClU5lphabAx4/exec";
const SETTINGS_KEY = "jungcar-sheet-sync";
const SESSION_KEY = "jungcar-session";
let leads = [];
let activeTab = "overview";
let selectedCustomer = null;
let session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const fmt = (n) => Number(n || 0).toLocaleString("ko-KR");
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const uniq = (arr) => [...new Set(arr.filter(Boolean))];
const count = (arr) => arr.reduce((acc, item) => { const key = item || "미입력"; acc[key] = (acc[key] || 0) + 1; return acc; }, {});
const topEntries = (obj, limit=8) => Object.entries(obj).sort((a,b) => b[1] - a[1]).slice(0, limit);
const phoneKey = (phone) => (phone || "").replace(/\D/g, "");
const validPhone = (phone) => /^010\d{8}$/.test(phoneKey(phone));
const normalizePhone = (phone) => validPhone(phone) ? `${phoneKey(phone).slice(0,3)}-${phoneKey(phone).slice(3,7)}-${phoneKey(phone).slice(7)}` : (phone || "").trim();
const parseDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? new Date(`${value}T00:00:00+09:00`) : null;
const dateKey = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(date);
const monthKey = (date) => dateKey(date).slice(0, 7);
const monthLabel = (ym) => ym ? `${ym.slice(0,4)}년 ${ym.slice(5,7)}월` : "-";
const addDays = (date, days) => { const next = new Date(date); next.setDate(next.getDate() + days); return next; };
const addMonths = (date, months) => { const next = new Date(date); next.setMonth(next.getMonth() + months); return next; };
const budgetLabel = (row) => {
  const min = row.budgetMin ? `${fmt(row.budgetMin)}만원` : "";
  const max = row.budgetMax ? `${fmt(row.budgetMax)}만원` : "";
  if (min && max) return `${min}~${max}`;
  return min || max || row.budgetRaw || row.budgetBucket || "미기재";
};
const topicsFromText = (conditionRaw = "", inquiryType = "", financeStatus = "") => {
  const raw = `${conditionRaw} ${inquiryType} ${financeStatus}`.toLowerCase();
  const rules = [
    ["할부·신용", ["할부", "신용", "한도"]],
    ["방문·예약", ["방문", "예약", "내방", "상담/방문"]],
    ["가격·부대비용", ["예산", "만원", "가격", "선", "부대비", "비용"]],
    ["사고·차량상태", ["사고", "무사고", "1인", "신조", "상태"]],
    ["옵션·색상", ["옵션", "색상", "통풍", "네비", "후방", "크루즈", "화이트", "블랙"]],
    ["연식·주행거리", ["년식", "연식", "km", "키로", "주행"]],
    ["판매·매입·대차", ["판매", "매입", "대차"]],
  ];
  return rules.filter(([, words]) => words.some(word => raw.includes(word.toLowerCase()))).map(([label]) => label);
};
const getSettings = () => ({ autoPush: true, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"), endpoint: FIXED_APPS_SCRIPT_URL });
const saveSettings = (settings) => localStorage.setItem(SETTINGS_KEY, JSON.stringify({ endpoint: FIXED_APPS_SCRIPT_URL, autoPush: settings.autoPush !== false }));
const isLoggedIn = () => Boolean(session?.sessionToken && getSettings().endpoint);

function duplicateKey(row) {
  return [row.inquiryDate || "", normalizePhone(row.phone || ""), (row.models || []).slice().sort().join(","), (row.conditionRaw || "").slice(0, 80)].join("|").toLowerCase();
}

function rowForSheet(row) {
  const models = row.models || [];
  return {
    siteId: row.id || `local-${Date.now()}`,
    inquiryDate: row.inquiryDate || "",
    phone: normalizePhone(row.phone || ""),
    inquiryChannel: row.inquiryChannel || "전화",
    inquiryType: row.inquiryType || "구매",
    model1: models[0] || "",
    model2: models[1] || "",
    model3: models[2] || "",
    budgetMin: row.budgetMin ?? "",
    budgetMax: row.budgetMax ?? "",
    purchaseTiming: row.purchaseTiming || "",
    financeStatus: row.financeStatus || "미확인",
    visitStatus: row.visitStatus || "미확인",
    staffName: row.staffName || "",
    topics: (row.topics || []).join(", "),
    leadSource: row.leadSource || "대표번호",
    callOutcome: row.callOutcome || "상담완료",
    followUpDate: row.followUpDate || "",
    conditionRaw: row.conditionRaw || "",
  };
}

function saveLocal() {
  // 고객 데이터는 GitHub Pages/localStorage에 남기지 않고 메모리와 구글시트에만 둡니다.
}

async function loadData() {
  if (isLoggedIn()) {
    try {
      leads = await sheetList(false);
    } catch {
      session = null;
      localStorage.removeItem(SESSION_KEY);
      leads = [];
    }
  }
  render();
}

function buildCustomers(rows = leads) {
  const groups = new Map();
  rows.forEach(row => {
    const key = validPhone(row.phone) ? phoneKey(row.phone) : `unknown-${row.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return [...groups.entries()].map(([id, items]) => {
    const sorted = items.slice().sort((a,b) => (b.inquiryDate || "").localeCompare(a.inquiryDate || ""));
    const latest = sorted[0];
    const dates = sorted.map(r => r.inquiryDate).filter(Boolean).sort();
    return {
      id,
      phone: normalizePhone(latest.phone || "번호없음"),
      firstInquiryDate: dates[0] || "",
      lastInquiryDate: dates.at(-1) || "",
      inquiryTypes: uniq(items.map(r => r.inquiryType)),
      models: uniq(items.flatMap(r => r.models || [])),
      budgetLabel: budgetLabel(latest),
      visitStatus: items.some(r => r.visitStatus === "예") ? "예" : latest.visitStatus || "미확인",
      staffNames: uniq(items.map(r => r.staffName)),
      latestCondition: latest.conditionRaw || "",
      inquiries: sorted,
    };
  }).sort((a,b) => (b.lastInquiryDate || "").localeCompare(a.lastInquiryDate || ""));
}

function render() {
  if (!isLoggedIn()) {
    renderLogin();
    return;
  }
  $$(".nav button").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === activeTab));
  if ($(".total-count")) $(".total-count").textContent = `${fmt(leads.length)}건`;
  $(".page-title").textContent = activeTab === "overview" ? "고객 문의 현황" : activeTab === "customers" ? "전체 고객" : activeTab === "analysis" ? "고객 문의 분석" : "구글시트 연동";
  selectedCustomer = selectedCustomer && buildCustomers().find(c => c.id === selectedCustomer.id) || null;
  if (activeTab === "overview") renderOverview();
  if (activeTab === "customers") renderCustomers();
  if (activeTab === "analysis") renderAnalysis();
  if (activeTab === "sync") renderSync();
}

function renderLogin(message = "") {
  $(".page-title").textContent = "로그인";
  if ($(".total-count")) $(".total-count").textContent = "보호됨";
  $$(".nav button").forEach(btn => btn.classList.remove("active"));
  app.innerHTML = `
    <section class="login-card">
      <div>
        <span>SECURE JUNGCAR CRM</span>
        <h2>로그인</h2>
      </div>
      <form id="loginForm">
        <label>아이디<input name="username" autocomplete="username" required></label>
        <label>비밀번호<input name="password" type="password" autocomplete="current-password" required></label>
        <label class="check"><input name="autoPush" type="checkbox" checked> 고객 저장 시 구글시트 자동 반영</label>
        <button type="submit">로그인</button>
        <p class="status">${escapeHtml(message)}</p>
      </form>
    </section>`;
  $("#loginForm").onsubmit = login;
}

async function login(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  saveSettings({ autoPush: form.get("autoPush") === "on" });
  try {
    const result = await sheetJsonp("login", {
      username: String(form.get("username") || ""),
      password: String(form.get("password") || ""),
    });
    session = { sessionToken: result.sessionToken, loggedInAt: Date.now() };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    leads = await sheetList(false);
    activeTab = "overview";
    render();
  } catch (err) {
    session = null;
    localStorage.removeItem(SESSION_KEY);
    renderLogin(err.message || "로그인하지 못했습니다.");
  }
}

function logout() {
  session = null;
  leads = [];
  localStorage.removeItem(SESSION_KEY);
  renderLogin("로그아웃되었습니다.");
}

function renderOverview() {
  const dated = leads.filter(r => r.inquiryDate);
  const dates = uniq(dated.map(r => r.inquiryDate));
  const byDate = count(dated.map(r => r.inquiryDate));
  const byMonth = count(dated.map(r => (r.inquiryDate || "").slice(0,7)));
  const byType = count(leads.map(r => r.inquiryType));
  const byModel = count(leads.flatMap(r => r.models || []));
  const byTopic = count(leads.flatMap(r => (r.topics && r.topics.length ? r.topics : topicsFromText(r.conditionRaw, r.inquiryType, r.financeStatus))));
  const latestDate = dated.map(r => parseDate(r.inquiryDate)).filter(Boolean).sort((a,b) => b - a)[0] || parseDate(today());
  const latestKey = dateKey(latestDate);
  const currentMonth = monthKey(latestDate);
  const currentMonthRows = dated.filter(r => (r.inquiryDate || "").startsWith(currentMonth));
  const previousMonthDate = addMonths(latestDate, -1);
  const previousMonth = monthKey(previousMonthDate);
  const previousMonthSamePeriodRows = dated.filter(r => {
    if (!(r.inquiryDate || "").startsWith(previousMonth)) return false;
    const day = Number(r.inquiryDate.slice(8,10));
    return day <= Number(latestKey.slice(8,10));
  });
  const previousCount = previousMonthSamePeriodRows.length;
  const growth = previousCount ? ((currentMonthRows.length - previousCount) / previousCount * 100).toFixed(1) : null;
  const recentStartKey = dateKey(addDays(latestDate, -30));
  const recent31Rows = dated.filter(r => r.inquiryDate >= recentStartKey && r.inquiryDate <= latestKey);
  const recentByModel = count(recent31Rows.flatMap(r => r.models || []));
  const recentTopModel = topEntries(recentByModel, 1)[0];
  app.innerHTML = `
    <section class="kpis">
      ${kpi(`${monthLabel(currentMonth)} 상담수`, `${fmt(currentMonthRows.length)}건`, `${latestKey} 기준`)}
      ${kpi("일평균 응대수", `${(dated.length / Math.max(dates.length, 1)).toFixed(1)}건`, `전체 DB ${fmt(dates.length)}일 기준`)}
      ${kpi("최근 한달 인기 문의 차종", recentTopModel?.[0] || "-", `최근 31일 · ${recentTopModel?.[1] || 0}건`)}
      ${kpi(`${monthLabel(currentMonth)} 동기간 증가율`, growth === null ? "신규" : `${growth}%`, `전월 동기간 ${fmt(previousCount)}건 대비`)}
    </section>
    <section class="grid">
      ${card("일별 문의 현황", "문의 날짜 기준 상담 건수", verticalBars(Object.entries(byDate).sort()), "wide")}
      ${card("문의 종류", "구매·판매·할부 등", donut(topEntries(byType,7)), "chart")}
      ${card("주요 문의 내용", "희망조건 기반 태그", donut(topEntries(byTopic,8)), "chart")}
      ${card("인기 차종 TOP 10", "전체 DB 기준 · 복수 차종은 각각 집계", rankedBars(topEntries(byModel,10)))}
      ${card("월별 문의 현황", "월별 총 상담량", verticalBars(Object.entries(byMonth).sort()), "wide")}
    </section>`;
}

function renderCustomers() {
  if (selectedCustomer) {
    app.innerHTML = customerDetail(selectedCustomer);
    bindDetail();
    return;
  }
  const customers = buildCustomers();
  app.innerHTML = `
    <section class="kpis">
      ${kpi("전체 고객", `${fmt(customers.length)}명`, "전화번호 기준")}
      ${kpi("복수 차종 문의", `${fmt(customers.filter(c => c.models.length > 1).length)}명`, "2개 이상 희망 차종")}
      ${kpi("방문·예약 고객", `${fmt(customers.filter(c => c.visitStatus === "예").length)}명`, "방문 여부 예")}
      ${kpi("최근 고객", customers[0]?.phone || "-", customers[0]?.lastInquiryDate || "최근 상담일 없음")}
    </section>
    <section class="toolbar">
      <input id="customerSearch" placeholder="전화번호·차종·직원·희망 조건 검색">
      <button id="addLead">+ 고객 추가</button>
      <button id="exportCsv">CSV 백업</button>
    </section>
    <section class="panel"><div id="customerTable">${customerTable(customers)}</div></section>`;
  $("#customerSearch").addEventListener("input", e => {
    const term = e.target.value.toLowerCase();
    const filtered = customers.filter(c => `${c.phone} ${c.models.join(" ")} ${c.inquiryTypes.join(" ")} ${c.staffNames.join(" ")} ${c.latestCondition}`.toLowerCase().includes(term));
    $("#customerTable").innerHTML = customerTable(filtered);
    bindCustomerRows();
  });
  $("#addLead").onclick = () => openLeadForm();
  $("#exportCsv").onclick = exportCsv;
  bindCustomerRows();
}

function renderAnalysis() {
  const byType = count(leads.map(r => r.inquiryType));
  const byModel = count(leads.flatMap(r => r.models || []));
  const byBudget = count(leads.map(r => r.budgetBucket));
  const byStaff = count(leads.map(r => r.staffName || "미입력"));
  app.innerHTML = `
    <section class="grid">
      ${card("문의 종류", "상담 유형 분포", bars(topEntries(byType,10)))}
      ${card("인기 차종", "차량 수요", bars(topEntries(byModel,12)))}
      ${card("예산 분포", "예산대 분석", donut(topEntries(byBudget,8)))}
      ${card("응대 직원별 상담", "담당자 입력 기준", bars(topEntries(byStaff,8)))}
      ${card("전체 상담 목록", "상위 200건", inquiryTable(leads.slice(0,200)), "wide")}
    </section>`;
}

function renderSync() {
  const settings = getSettings();
  app.innerHTML = `
    <section class="sync-hero">
      <div><span>GOOGLE SHEETS SYNC</span><h2>GitHub Pages ↔ Google Sheets</h2><p>로그인 후 발급된 세션으로 구글시트와 양방향 동기화합니다. 아이디와 비밀번호는 HTML/GitHub/스프레드시트에 저장되지 않습니다.</p></div>
      <ol><li>구글시트에서 확장 프로그램 → Apps Script</li><li><a href="apps-script.js" target="_blank">apps-script.js</a> 내용을 붙여넣기</li><li>Apps Script의 스크립트 속성에 아이디와 비밀번호 해시 저장</li><li>사이트는 고정된 연동 주소로 자동 접속</li></ol>
    </section>
    <section class="panel sync-panel">
      <label class="check"><input id="syncAuto" type="checkbox" ${settings.autoPush ? "checked" : ""}> 고객 저장 시 구글시트 자동 반영</label>
      <div class="sync-buttons"><button id="saveSync">설정 저장</button><button id="testSync">연결 테스트</button><button id="pullSheet">시트 → 사이트 새로고침</button><button id="pushSheet">현재 사이트 → 시트 반영</button><button id="logout">로그아웃</button></div>
      <p id="syncStatus" class="status"></p>
    </section>`;
  $("#saveSync").onclick = saveSyncForm;
  $("#testSync").onclick = async () => { saveSyncForm(); await sheetList(true); };
  $("#pullSheet").onclick = async () => { saveSyncForm(); await pullFromSheet(); };
  $("#pushSheet").onclick = async () => { saveSyncForm(); await pushAllToSheet(); };
  $("#logout").onclick = logout;
}

function saveSyncForm() {
  saveSettings({ autoPush: $("#syncAuto").checked });
  $("#syncStatus").textContent = "연동 설정을 저장했습니다.";
}

function sheetJsonp(action, payload = {}) {
  const settings = getSettings();
  if (!settings.endpoint) return Promise.reject(new Error("Apps Script URL을 먼저 입력하세요."));
  if (action !== "login" && !session?.sessionToken) return Promise.reject(new Error("로그인 후 이용하세요."));
  return new Promise((resolve, reject) => {
    const callback = `jungcar_cb_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const url = new URL(settings.endpoint);
    url.searchParams.set("action", action);
    url.searchParams.set("callback", callback);
    if (action === "login") {
      url.searchParams.set("username", payload.username || "");
      url.searchParams.set("password", payload.password || "");
    } else {
      url.searchParams.set("sessionToken", session.sessionToken);
    }
    if (payload.row) url.searchParams.set("row", JSON.stringify(payload.row));
    if (payload.siteId) url.searchParams.set("siteId", payload.siteId);
    const script = document.createElement("script");
    const timeout = setTimeout(() => { cleanup(); reject(new Error("구글시트 응답 시간이 초과되었습니다.")); }, 20000);
    function cleanup() { clearTimeout(timeout); delete window[callback]; script.remove(); }
    window[callback] = (data) => { cleanup(); data?.ok === false ? reject(new Error(data.error || "구글시트 요청 실패")) : resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error("Apps Script URL을 불러오지 못했습니다.")); };
    script.src = url.toString();
    document.body.appendChild(script);
  });
}

async function sheetPost(action, payload = {}) {
  const settings = getSettings();
  if (!session?.sessionToken) throw new Error("로그인 후 이용하세요.");
  const res = await fetch(settings.endpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ sessionToken: session.sessionToken, action, ...payload }) });
  const data = await res.json();
  if (!res.ok || data.ok === false) throw new Error(data.error || "구글시트 POST 요청 실패");
  return data;
}

async function sheetList(showStatus=false) {
  const data = await sheetJsonp("list");
  if (showStatus) $("#syncStatus").textContent = `연결 성공 · 시트 ${fmt(data.rows?.length || 0)}건`;
  return data.rows || [];
}

async function pullFromSheet() {
  const status = $("#syncStatus");
  status.textContent = "시트에서 새로고침 중...";
  try {
    const rows = await sheetList();
    leads = rows;
    status.textContent = `시트에서 ${fmt(rows.length)}건을 새로 불러왔습니다.`;
  } catch (err) {
    status.textContent = err.message;
  }
}

async function pushAllToSheet() {
  const status = $("#syncStatus");
  status.textContent = "현재 데이터를 시트에 반영하는 중...";
  try {
    await sheetPost("replaceAll", { rows: leads.map(rowForSheet) });
    status.textContent = `현재 사이트 데이터 ${fmt(leads.length)}건을 시트에 반영했습니다.`;
  } catch (err) {
    status.textContent = `${err.message} · 브라우저 CORS가 막히면 Apps Script 배포 권한을 '모든 사용자'로 확인하세요.`;
  }
}

async function syncUpsert(row) {
  const settings = getSettings();
  if (!settings.autoPush || !settings.endpoint || !session?.sessionToken) return;
  try { await sheetJsonp("upsert", { row: rowForSheet(row) }); } catch (err) { console.warn(err); }
}

async function syncDelete(siteId) {
  const settings = getSettings();
  if (!settings.autoPush || !settings.endpoint || !session?.sessionToken) return;
  try { await sheetJsonp("delete", { siteId }); } catch (err) { console.warn(err); }
}

function kpi(label, value, detail) { return `<article class="kpi"><span>${label}</span><strong>${value}</strong><small>${detail}</small></article>`; }
function card(title, subtitle, body, cls="") { return `<article class="card ${cls}"><header><h2>${title}</h2><p>${subtitle}</p></header>${body}</article>`; }
function bars(entries) { const max = Math.max(...entries.map(([,v]) => v), 1); return `<div class="bars">${entries.map(([k,v]) => `<div><span>${escapeHtml(k)}</span><b>${v}</b><i><em style="width:${v/max*100}%"></em></i></div>`).join("")}</div>`; }
function rankedBars(entries) { const max = Math.max(...entries.map(([,v]) => v), 1); return `<div class="bars ranked split-rank">${entries.map(([k,v],i) => `<div><span><em>${i+1}</em>${escapeHtml(k)}</span><b>${v}</b><i><em style="width:${v/max*100}%"></em></i></div>`).join("")}</div>`; }
function verticalBars(entries) { const max = Math.max(...entries.map(([,v]) => v), 1); return `<div class="vbars">${entries.map(([k,v]) => `<div><b>${v}</b><i style="height:${Math.max(v/max*100,3)}%"></i><span>${escapeHtml(String(k).slice(5).replace("-","/"))}</span></div>`).join("")}</div>`; }
function donut(entries) { const total = entries.reduce((s,[,v])=>s+v,0); let p=0; const colors=["#2f6fed","#16a085","#f59e0b","#8b5cf6","#ef5da8","#64748b","#0ea5e9","#f97316"]; const seg=entries.map(([,v],i)=>{const s=p; p+=total?v/total*100:0; return `${colors[i%colors.length]} ${s}% ${p}%`;}).join(","); return `<div class="donut-wrap"><div class="donut" style="background:conic-gradient(${seg || "#e2e8f0 0 100%"})"><div><strong>${fmt(total)}</strong><span>건</span></div></div><div class="legend">${entries.map(([k,v],i)=>`<span><i style="background:${colors[i%colors.length]}"></i>${escapeHtml(k)}<b>${fmt(v)}</b></span>`).join("")}</div></div>`; }
function topicCloud(entries) { return `<div class="topics">${entries.map(([k,v]) => `<span>${escapeHtml(k)}<b>${v}</b></span>`).join("")}</div>`; }
function inquiryTable(rows) { return `<div class="table"><table><thead><tr><th>문의일</th><th>전화번호</th><th>타입</th><th>문의 종류</th><th>차종</th><th>예산</th><th>할부</th><th>방문</th><th>담당자</th><th>희망 조건</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.inquiryDate||"-"}</td><td>${normalizePhone(r.phone||"")}</td><td>${r.inquiryChannel||"전화"}</td><td><span class="chip">${escapeHtml(r.inquiryType||"-")}</span></td><td><b>${escapeHtml((r.models||[]).join(", ")||"-")}</b></td><td>${escapeHtml(budgetLabel(r))}</td><td>${r.financeStatus||"미확인"}</td><td>${r.visitStatus||"미확인"}</td><td>${escapeHtml(r.staffName||"미입력")}</td><td>${escapeHtml(r.conditionRaw||"-")}</td></tr>`).join("")}</tbody></table></div>`; }
function customerTable(customers) { return `<table class="customers"><thead><tr><th>연락처</th><th>최근 상담일</th><th>최초 문의일</th><th>희망 차종</th><th>문의 종류</th><th>최근 예산</th><th>방문</th><th>응대 직원</th><th>최근 희망 조건</th></tr></thead><tbody>${customers.map(c => `<tr data-customer="${c.id}"><td><button class="link">${c.phone}</button></td><td>${c.lastInquiryDate||"-"}</td><td>${c.firstInquiryDate||"-"}</td><td><b>${escapeHtml(c.models.join(", ")||"-")}</b></td><td>${c.inquiryTypes.map(t=>`<span class="chip">${escapeHtml(t)}</span>`).join("")}</td><td>${escapeHtml(c.budgetLabel)}</td><td>${c.visitStatus}</td><td>${escapeHtml(c.staffNames.join(", ")||"미입력")}</td><td>${escapeHtml(c.latestCondition||"-")}</td></tr>`).join("")}</tbody></table>`; }
function bindCustomerRows() { $$("#customerTable tr[data-customer]").forEach(tr => tr.onclick = () => { selectedCustomer = buildCustomers().find(c => c.id === tr.dataset.customer); renderCustomers(); }); }
function customerDetail(c) { return `<section class="detail"><button id="back">← 고객 목록</button><h2>${c.phone}</h2><button id="addInquiry">+ 추가 문의</button><div class="history">${c.inquiries.map((r,i)=>`<article><strong>${r.inquiryDate||"날짜 없음"}</strong><span class="chip">${escapeHtml(r.inquiryType||"-")}</span><button data-edit="${r.id}">수정</button><button data-del="${r.id}">삭제</button><p>${escapeHtml((r.models||[]).join(", ")||"-")} · ${escapeHtml(budgetLabel(r))}</p><p>${escapeHtml(r.conditionRaw||"")}</p></article>`).join("")}</div></section>`; }
function bindDetail() { $("#back").onclick=()=>{selectedCustomer=null;renderCustomers();}; $("#addInquiry").onclick=()=>openLeadForm(selectedCustomer.phone); $$("[data-edit]").forEach(b=>b.onclick=()=>openLeadForm(null, leads.find(r=>r.id===b.dataset.edit))); $$("[data-del]").forEach(b=>b.onclick=async()=>{ const id=b.dataset.del; leads=leads.filter(r=>r.id!==id); saveLocal(); await syncDelete(id); selectedCustomer=null; renderCustomers(); }); }
function openLeadForm(initialPhone="", existing=null) { const r=existing||{}; const html=`<dialog open class="modal"><form method="dialog" id="leadForm"><h2>${existing?"상담 수정":"고객/상담 추가"}</h2><input name="inquiryDate" type="date" value="${r.inquiryDate||today()}"><input name="phone" placeholder="010-0000-0000" value="${initialPhone||r.phone||""}"><select name="inquiryChannel"><option>전화</option><option ${r.inquiryChannel==="문자"?"selected":""}>문자</option></select><input name="inquiryType" placeholder="문의 종류" value="${r.inquiryType||"구매"}"><input name="models" placeholder="희망 차종, 쉼표로 구분" value="${(r.models||[]).join(", ")}"><div class="split"><input name="budgetMin" type="number" min="0" step="100" placeholder="최소 예산(만원)" value="${r.budgetMin||""}"><input name="budgetMax" type="number" min="0" step="100" placeholder="최대 예산(만원)" value="${r.budgetMax||""}"></div><select name="financeStatus"><option>미확인</option><option ${r.financeStatus==="예"?"selected":""}>예</option><option ${r.financeStatus==="아니오"?"selected":""}>아니오</option></select><select name="visitStatus"><option>미확인</option><option ${r.visitStatus==="예"?"selected":""}>예</option><option ${r.visitStatus==="아니오"?"selected":""}>아니오</option></select><input name="staffName" placeholder="담당자" value="${r.staffName||""}"><textarea name="conditionRaw" placeholder="희망 조건">${r.conditionRaw||""}</textarea><menu><button value="cancel">취소</button><button id="saveLead" value="default">저장</button></menu></form></dialog>`; document.body.insertAdjacentHTML("beforeend", html); const dlg=$("dialog.modal"); $("#saveLead").onclick=async(e)=>{e.preventDefault(); const f=new FormData($("#leadForm")); const budgetMin=Number(f.get("budgetMin"))||null; const budgetMax=Number(f.get("budgetMax"))||null; const conditionRaw=f.get("conditionRaw"); const inquiryType=f.get("inquiryType"); const financeStatus=f.get("financeStatus"); const row={...r,id:r.id||`local-${Date.now()}`,source:"manual",inquiryDate:f.get("inquiryDate"),phone:normalizePhone(f.get("phone")),inquiryChannel:f.get("inquiryChannel"),inquiryType,models:String(f.get("models")||"").split(",").map(s=>s.trim()).filter(Boolean),budgetMin,budgetMax,budgetRaw:[budgetMin,budgetMax].filter(Boolean).join("~"),budgetBucket:"표현형",financeStatus,visitStatus:f.get("visitStatus"),staffName:f.get("staffName"),conditionRaw,topics:topicsFromText(conditionRaw, inquiryType, financeStatus)}; if(existing) leads=leads.map(x=>x.id===row.id?row:x); else leads=[row,...leads]; saveLocal(); await syncUpsert(row); dlg.remove(); selectedCustomer=null; render();}; dlg.addEventListener("close",()=>dlg.remove()); }
function exportCsv() { const csv=["문의 날짜,연락처,문의 타입,문의 종류,희망 차량,최소 예산,최대 예산,할부 여부,방문 여부,담당자,희망 조건",...leads.map(r=>[r.inquiryDate,r.phone,r.inquiryChannel,r.inquiryType,(r.models||[]).join("/"),r.budgetMin,r.budgetMax,r.financeStatus,r.visitStatus,r.staffName,r.conditionRaw].map(v=>`"${String(v||"").replaceAll('"','""')}"`).join(","))].join("\n"); const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})); a.download=`jungcar-db-${today()}.csv`; a.click(); }
function escapeHtml(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
$$(".nav button").forEach(btn => btn.onclick = () => { activeTab = btn.dataset.tab; selectedCustomer = null; render(); });
loadData();
