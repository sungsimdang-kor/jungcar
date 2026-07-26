
const SHEET_HEADERS = ["사이트ID","문의 날짜","연락처","문의 타입","문의 종류","희망 차량_1","희망 차량_2","희망 차량_3","최소 예산","최대 예산","구매 예정일","할부 여부","방문 여부","담당자","문의 주제","유입 경로","상담 결과","후속 연락일","희망 조건","수정일시"];
const FIXED_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzLkvPc0LutnFOszyKJd0VYlaU13IAz21PBbWISynrKO7UGfbcY5bp4ClU5lphabAx4/exec";
const SETTINGS_KEY = "jungcar-sheet-sync";
const SESSION_KEY = "jungcar-session";
let leads = [];
let activeTab = "overview";
let selectedCustomer = null;
let session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
let analysisFilters = {};

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
const formatPhoneInput = (value = "") => {
  const digits = String(value).replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0,3)}-${digits.slice(3)}`;
  return `${digits.slice(0,3)}-${digits.slice(3,7)}-${digits.slice(7)}`;
};
const formatThousands = (value = "") => {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? Number(digits).toLocaleString("ko-KR") : "";
};
const parseFormattedNumber = (value = "") => Number(String(value).replace(/\D/g, "")) || null;
const parseDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? new Date(`${value}T00:00:00+09:00`) : null;
const dateKey = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(date);
const monthKey = (date) => dateKey(date).slice(0, 7);
const monthLabel = (ym) => ym ? `${ym.slice(0,4)}년 ${ym.slice(5,7)}월` : "-";
const addDays = (date, days) => { const next = new Date(date); next.setDate(next.getDate() + days); return next; };
const addMonths = (date, months) => { const next = new Date(date); next.setMonth(next.getMonth() + months); return next; };
const weekdayLabels = ["일요일","월요일","화요일","수요일","목요일","금요일","토요일"];
const selected = (value, expected) => value === expected ? "selected" : "";
// 중카TV 국산차·수입차 검색의 제조사별 '모델' 단계 기준. 세부모델·등급은 제외합니다.
const MODEL_CATALOG = {
  "현대":["그랜저","쏘나타","아반떼","스타렉스","싼타페","투싼","팰리세이드","스타리아","코나","제네시스","i30","i40","넥쏘","맥스크루즈","베뉴","베라쿠르즈","벨로스터","솔라티","아슬란","아이오닉 5","아이오닉 6","아이오닉 9","아이오닉","에쿠스","엑센트","캐스퍼","갤로퍼","그레이스","다이너스티","라비타","마르샤","베르나","아토스","엘란트라","싼타모","스텔라","스쿠프","엑셀","클릭","테라칸","투스카니","트라제XG","티뷰론","포니","리베로","프레스토","블루온"],
  "제네시스":["EQ900","G70","G80","G90","GV60","GV70","GV80"],
  "기아":["K3","K5","K7","K8","K9","카니발","쏘렌토","모하비","모닝","레이","셀토스","스포티지","EV3","EV4","EV5","EV6","EV9","PV5","니로","로체","스토닉","스팅어","쏘울","오피러스","카렌스","포르테","프라이드","봉고3미니버스","레토나","리오","록스타","베스타","복사","비스토","세피아","슈마","스펙트라","쎄라토","아벨라","엑스트렉","엔터프라이즈","엘란","옵티마","카스타","캐피탈","콩코드","크레도스","타스만","타우너","타이탄","토픽","파크타운","포텐샤","프레지오"],
  "르노코리아(삼성)":["세닉","QM3","QM5","QM6","SM3","SM5","SM6","SM7","XM3","그랑 콜레오스","마스터","아르카나","조에","캡처","클리오","트위지","필랑트"],
  "KG모빌리티(쌍용)":["코란도","티볼리","렉스턴","토레스","액티언","체어맨","무쏘","카이런","로디우스","이스타나","카리스타"],
  "쉐보레":["스파크","말리부","크루즈","올란도","트랙스","캡티바","볼트","아베오","임팔라","이쿼녹스","트래버스","트레일블레이저","카마로","콜로라도","콜벳","타호"],
  "대우":["마티즈","라세티","윈스톰","다마스","알페온","G2X","누비라","넥시아","라노스","르망","레간자","레조","매그너스","베리타스","브로엄","씨에로","스테이츠맨","아카디아","에스페로","젠트라","칼로스","토스카","티코","프린스","슈퍼살롱"],
  "기타제조사":["이비온","쎄보모빌리티","SMART","MASTA","비바모빌리티","대창모터스","디피코","마이브(KST 일렉트릭)","어울림모터스","AD모터스","제이스 모빌리티"],
};
const FOREIGN_MODEL_CATALOG = {"벤츠":["A 클래스","B 클래스 (MY B)","C 클래스","CL 클래스","CLA 클래스","CLE 클래스","CLK 클래스","CLS 클래스","E 클래스","EQA","EQB","EQC","EQE","EQS","G 클래스(G 바겐)","GL 클래스","GLA 클래스","GLB 클래스","GLC 클래스","GLE 클래스","GLK 클래스","GLS 클래스","M 클래스","R 클래스","S 클래스","SL 클래스","SLC 클래스","SLK 클래스","SLR","SLS AMG","AMG GT","V 클래스","스프린터","유니목","벤츠(구형)"],"BMW":["1시리즈","2시리즈","3시리즈","4시리즈","5시리즈","6시리즈","7시리즈","8시리즈","그란투리스모","X1","X2","X3","X4","X5","X6","X7","X3M","X4M","X5M","X6M","XM","Z3","Z4","Z8","i3","i4","i5","i7","i8","iX1","iX2","iX3","iX","M 쿠페"],"아우디":["A1","A3","A4","A5","A6","A7","A8","Q2","Q3","Q4","Q5","Q6","Q7","Q8","R8","RS3","RS4","RS5","RS6","RS7","RSQ8","S3","S4","S5","S6","S7","S8","SQ5","SQ6","SQ7","SQ8","TT","TTRS","TTS","e-트론","e-트론 GT","RS e-트론 GT","올로드콰트로"],"폭스바겐":["골프","티구안","CC","ID.4","ID.5","제타","아테온","파사트","비틀","페이튼","폴로","투아렉","사란","시로코","티록","EOS","보라","아틀라스","루탄","벤토","마이크로버스","캘리포니아","멀티밴","업"],"미니":["쿠퍼","쿠퍼 컨버터블","컨트리맨","에이스맨","클럽맨","쿠페","로드스터","페이스맨","로버 미니"],"볼보":["C30","C40 리차지","C70","EX30","EX40","EX90","S40","S60","S70","S80","S90","V40","V50","V60","V70","V90","XC40","XC60","XC70","XC90","740","760","850","940","960"],"랜드로버":["디스커버리","디스커버리 스포츠","디펜더","레인지로버","레인지로버 이보크","레인지로버 스포츠","레인지로버 벨라","프리랜더"],"닛산":["로그","로렐","리프","마치","맥시마","모코","무라노","버사","베르사","블루버드","세드릭","세피로","센트라","스카이라인","시마","실비아","알마다","알티마","엑스테라","엘그란드","윙로드","쥬크","캐시카이","퀘스트","큐브","타이탄","타아나","패스파인더","푸가","프레리","프레지던트","프론티어","휘가로","SX","Z","GT-R","NV","엑스트레일"],"다이하쓰":["코펜","웨이크","마테리아","미라","무브","분","테리오스","에쎄","탄토","캐스트"],"다찌":["니트로","다코타","듀랑고","램밴","램픽업","매그넘","바이퍼","밴","어벤저","차저","챌린저","캐러밴","캘리버"],"동풍소콘":["K01","C31","C32","C35","SX6","펜곤 ix5","마사다 EV"],"람보르기니":["가야르도","디아블로","레벤톤","무르시엘라고","시안","아벤타도르","우라칸","우루스","레부엘토"],"렉서스":["CT","ES","GS","GX","IS","LC","LM","LS","LX","NX","RC","RX","RZ","SC","UX"],"로버":["미니","MGF","75"],"로터스":["2-Eleven","에미라","에보라","에스프리","엑시지","엘레트라","엘리스","유로파"],"롤스로이스":["스펙터","고스트","팬텀","컬리넌","레이스","던","코니쉬","실버스퍼","실버 셰라프"],"르노":["조에","캡처","라구나","메간","세닉","클리오","트윙고","에스빠스","벨사티스","모뒤스","탈리스만"],"링컨":["MKC","MKS","MKT","MKX","MKZ","LS","네비게이터","에비에이터","컨티넨탈","타운카","노틸러스","코세어"],"마세라티":["그란스포츠","그란투리스모","그란카브리오","그레칼레","기블리","르반떼","스파이더","콰트로포르테","쿠페","MC12","MC20","3200 GT","4200 GT"],"마이바흐":["57","62"],"마쯔다":["MX","RX","MAZDA 3","MAZDA 5","MAZDA 6","유노스","데미오","CX-3","CX-5","CX-7","CX-9","베리사","MPV","비안테"],"맥라렌":["540C","570GT","570S","600LT","650S","675LT","720S","750S","765LT","GT","MP4-12C","아투라","세나"],"미쯔비시":["이클립스","3000GT","FTO","GTO","RVR","랜서","랜서에볼루션","갤랑","아웃랜더","파제로","아이"],"미쯔오카":["가류","누에라","라세드","뷰트","오로치","히미코"],"벤틀리":["컨티넨탈","플라잉스퍼","벤테이가","뮬산","아르나지","아주르","에이트","브룩랜즈"],"부가티":["EB110","베이론","시론","디보","센토디에치"],"북기은상":["CK미니트럭","CK미니밴","켄보"],"뷰익":["르사블","리갈","리비에라","엔클레이브","테라자","파크애비뉴"],"사브":["9-3","9-5","터보-X","900","9000","9-4X"],"사이언":["xA","xB","xD","tC"],"선롱버스":["두에고"],"스마트":["포투","포포","로드스터"],"스바루":["레거시","아웃백","포레스터","임프레자","R1","BRZ"],"스즈키":["그랜드 비타라","사이드킥","스위프트","알토라팡","알토","짐니","허슬러","스페시아","웨건R","이그니스"],"시보레":["타호","루미나","벤처","블레이저","서버밴","실버라도","아발란치","아스트로밴","익스프레스밴","에퀴녹스","체비밴","카마로","콜벳","콜로라도","HHR","SSR","S-10","트랙스","트랙커","트럭밴","픽업트럭"],"시트로엥":["C2","C3","C4","C5","C6","DS3","DS4","DS5","DS7","XM","잔티아"],"알파로메오":["147","156","159","164","166","GT","GTV","미토","브레라","스파이더","줄리아","줄리에타","4C","8C"],"애스턴마틴":["DB","DBS","DBX","밴티지","뱅퀴시","라피드"],"어큐라":["MDX","RSX","TL","TSX","인테그라","CL","NSX","RDX","RL","ILX"],"오펠":["벡트라","비타","스피드스터","아스트라","코르사","티그라"],"올즈모빌":["브라바다","실루엣","알레로","오로라","커트라스"],"이네오스":["그레나디어"],"이베코":["뉴데일리"],"이스즈":["로데오","비크로스","트루퍼","엘프"],"인피니티":["Q","QX","G","M","I","FX","EX","JX"],"재규어":["E-PACE","F-PACE","F-TYPE","I-PACE","S-TYPE","X-TYPE","XE","XF","XJ","XK","다임러","소버린"],"지리":["쎄아"],"지프":["글래디에이터","랭글러","레니게이드","리버티","어벤저","체로키","컴패스","커맨더","패트리어트"],"쯔더우":["D2","D2C","D2P"],"캐딜락":["에스컬레이드","비스틱","ATS","ATS-V","BLS","CT4","CT5","CT6","CT6-V","CTS","CTS-V","DTS","SRX","STS","XLR","XT4","XT5","XT6","XTS","드빌","리릭","스빌","컨코어"],"크라이슬러":["200","300C","300M","LHS","PT크루저","네온","뉴요커","보이저","비전","세브링","스트라투스","시러스","이글탈론","프라울러","퍼시피카","캐러밴","콩코드","크로스파이어","타운앤컨트리"],"테슬라":["모델 3","모델 S","모델 X","모델 Y","사이버트럭"],"토요타":["4Runner","86","FJ크루져","MR","WiLL","bB","iQ","가이아","노아","라브4","랜드크루저","마크X","매트릭스","벤자","벨파이어","세콰이어","셀리카","소아라","솔라라","수프라","시에나","시엔타","아발론","아이고","아이시스","알테자","알파드","야리스(비츠)","에스티마","에스콰이어","위시","체이서","칼디나","캠리","코롤라","크라운","타코마","툰드라","파쏘","포르테","프리비아","프리우스","하이랜더","하이에이스","해리어"],"페라리":["12칠린드리","아말피","296","348","360","456","458","488","512 TR","550","575M","599","612","812","F12","F355","F40","F430","F50","F8","FF","GTC4 루쏘","SF90","라페라리","로마","엔초페라리","캘리포니아","포르토피노","푸로산게"],"포드":["이스케이프","익스플로러","익스플로러 스포츠트랙","토러스","포커스","F-Series","GT","S-MAX","레인저","머스탱","몬데오","브롱코","썬더버드","윈드스타","이코노라인","익스피디션","컨투어","쿠가","파이브 헌드레드","프로브","프리스타일","퓨전","트랜짓","E-Series","KA","피에스타","플렉스"],"포르쉐":["718","911","928","944","968","마칸","박스터","카이맨","카이엔","타이칸","파나메라"],"포톤":["툰렌드"],"폰티악":["그랑프리","그랜드 앰","보네빌","선파이어","솔스티스","파이어버드","피에로","트랜스포트","토렌트"],"폴스타":["폴스타4","폴스타2"],"푸조":["107","1007","205","206","207","208","2008","306","307","308","3008","405","406","407","408","508","5008","607","807","RCZ","익스퍼트"],"피아트":["124","500","500X","란치아","멀티피아","바르게타","쿠페","크로마","푼토","프리몬트","두카토"],"허머":["허머 EV","H1","H2","H3"],"혼다":["CR-V","CR-Z","Fit Aria","Fit","HR-V","N-BOX","N-ONE","S2000","S660","댓츠","델솔","라이프","레전드","리지라인","비트","스텝웨건","스트림","시빅","어코드","엘리먼트","오딧세이","인사이트","인스파이어","인테그라","크로스로드","크로스투어","파일럿","패스포트","프렐류드","프리드"],"BYD":["돌핀","아토3","T4K","SEAL","씨라이언 7"],"GMC":["벤츄라","사바나","사파리","소노마","시에라","아카디아","엔보이","유콘","지미","캐니언","터레인"],"LEVC":["Tx"],"동펑":["테라밴"]};
const CAR_MODELS = Object.entries({...MODEL_CATALOG, ...FOREIGN_MODEL_CATALOG}).flatMap(([maker, models]) => models.map(name => ({ maker, name })));
const budgetLabel = (row) => {
  const min = row.budgetMin ? `${fmt(row.budgetMin)}만원` : "";
  const max = row.budgetMax ? `${fmt(row.budgetMax)}만원` : "";
  if (min && max) return `${min}~${max}`;
  return min || max || row.budgetRaw || row.budgetBucket || "미기재";
};
const budgetRangeFromCondition = (value = "") => {
  const text = String(value).replaceAll(",", "").replace(/\s+/g, " ");
  let match = text.match(/(\d{3,5})\s*(?:만(?:원)?)?\s*(초반|중반|후반)/);
  let base;
  let band;
  if (match) {
    base = Math.floor(Number(match[1]) / 1000) * 1000;
    band = match[2];
  } else {
    match = text.match(/(\d*)\s*천\s*(초반|중반|후반)/);
    if (!match) return null;
    base = Number(match[1] || 1) * 1000;
    band = match[2];
  }
  if (!base) return null;
  const offsets = { 초반:[0,300], 중반:[400,600], 후반:[700,900] };
  return { min:base + offsets[band][0], max:base + offsets[band][1], band };
};
const includesAncillaryCost = (row) => (row.topics || []).includes("부대비용 포함");
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
  $(".top").classList.remove("login-top");
  $$("[data-tab]").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === activeTab));
  if ($(".total-count")) $(".total-count").textContent = `${fmt(leads.length)}건`;
  $(".page-title").textContent = activeTab === "overview" ? "고객 문의 현황" : activeTab === "customers" ? "전체 고객" : activeTab === "analysis" ? "고객 문의 분석" : "설정";
  selectedCustomer = selectedCustomer && buildCustomers().find(c => c.id === selectedCustomer.id) || null;
  if (activeTab === "overview") renderOverview();
  if (activeTab === "customers") renderCustomers();
  if (activeTab === "analysis") renderAnalysis();
  if (activeTab === "settings") renderSettings();
}

function renderLogin(message = "") {
  $(".top").classList.add("login-top");
  $(".page-title").textContent = "";
  if ($(".total-count")) $(".total-count").textContent = "보호됨";
  $$("[data-tab]").forEach(btn => btn.classList.remove("active"));
  app.innerHTML = `
    <section class="login-card">
      <div class="login-brand">
        <img class="login-logo" src="https://xn--tv-9z9j31p.com/assets/admin/images/logo/171/logo.png" alt="중카TV">
      </div>
      <form id="loginForm">
        <label>아이디<input name="username" autocomplete="username" required></label>
        <label>비밀번호<input name="password" type="password" autocomplete="current-password" required></label>
        <button type="submit">로그인</button>
        <p class="status">${escapeHtml(message)}</p>
      </form>
    </section>`;
  $("#loginForm").onsubmit = login;
}

async function login(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
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
  const byType = count(leads.map(r => r.inquiryType));
  const byModel = count(leads.flatMap(r => r.models || []));
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
      ${card("문의 종류", "구매·판매·할부 등", donut(topEntries(byType,7), true), "chart overview-card")}
      ${card("인기 차종 TOP 10", "전체 DB 기준 · 복수 차종은 각각 집계", rankedCounts(topEntries(byModel,10)), "chart overview-card")}
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
    </section>
    <section class="panel"><div id="customerTable" class="table">${customerTable(customers)}</div></section>`;
  $("#customerSearch").addEventListener("input", e => {
    const term = e.target.value.toLowerCase();
    const filtered = customers.filter(c => `${c.phone} ${c.models.join(" ")} ${c.inquiryTypes.join(" ")} ${c.staffNames.join(" ")} ${c.latestCondition}`.toLowerCase().includes(term));
    $("#customerTable").innerHTML = customerTable(filtered);
    bindCustomerRows();
  });
  $("#addLead").onclick = () => openLeadForm();
  bindCustomerRows();
}

function renderAnalysis() {
  const option = (label, key, values) => `<label>${label}<select name="${key}"><option value="">전체</option>${uniq(values).sort().map(v => `<option value="${escapeHtml(v)}" ${selected(analysisFilters[key] || "", v)}>${escapeHtml(v)}</option>`).join("")}</select></label>`;
  app.innerHTML = `
    <section class="analysis-filter panel">
      <div class="filter-heading"><div><h2>분석 조건</h2><p>검색어나 조건을 바꾸면 아래 모든 지표와 차트가 함께 변경됩니다.</p></div><button type="button" id="resetAnalysis">초기화</button></div>
      <form id="analysisForm" class="filter-grid">
        <label class="filter-search">통합 검색<input name="search" value="${escapeHtml(analysisFilters.search || "")}" placeholder="전화번호·차종·조건·담당자·문의 내용 검색"></label>
        <label>시작일<input name="dateFrom" type="date" value="${escapeHtml(analysisFilters.dateFrom || "")}"></label>
        <label>종료일<input name="dateTo" type="date" value="${escapeHtml(analysisFilters.dateTo || "")}"></label>
        ${option("문의 종류", "inquiryType", leads.map(r => r.inquiryType))}
        ${option("문의 채널", "inquiryChannel", leads.map(r => r.inquiryChannel))}
        ${option("희망 차종", "model", leads.flatMap(r => r.models || []))}
        ${option("담당자", "staffName", leads.map(r => r.staffName || "미입력"))}
        ${option("할부 여부", "financeStatus", leads.map(r => r.financeStatus || "미확인"))}
        ${option("방문 여부", "visitStatus", leads.map(r => r.visitStatus || "미확인"))}
        ${option("유입 경로", "leadSource", leads.map(r => r.leadSource || "미입력"))}
        ${option("상담 결과", "callOutcome", leads.map(r => r.callOutcome || "미입력"))}
        <label>최소 예산(만원)<input name="budgetMin" type="number" min="0" step="100" value="${escapeHtml(analysisFilters.budgetMin || "")}" placeholder="예: 1000"></label>
        <label>최대 예산(만원)<input name="budgetMax" type="number" min="0" step="100" value="${escapeHtml(analysisFilters.budgetMax || "")}" placeholder="예: 3000"></label>
      </form>
    </section>
    <div id="analysisResults"></div>`;
  $("#analysisForm").addEventListener("input", () => {
    analysisFilters = Object.fromEntries(new FormData($("#analysisForm")).entries());
    renderAnalysisResults();
  });
  $("#resetAnalysis").onclick = () => { analysisFilters = {}; renderAnalysis(); };
  renderAnalysisResults();
}

function filteredAnalysisRows() {
  const f = analysisFilters;
  const term = String(f.search || "").trim().toLowerCase();
  return leads.filter(r => {
    const searchable = [
      r.inquiryDate, r.phone, r.inquiryChannel, r.inquiryType, ...(r.models || []),
      r.budgetMin, r.budgetMax, r.purchaseTiming, r.financeStatus, r.visitStatus,
      r.staffName, ...(r.topics || []), r.leadSource, r.callOutcome, r.followUpDate, r.conditionRaw,
    ].join(" ").toLowerCase();
    if (term && !searchable.includes(term)) return false;
    if (f.dateFrom && (r.inquiryDate || "") < f.dateFrom) return false;
    if (f.dateTo && (r.inquiryDate || "") > f.dateTo) return false;
    if (f.inquiryType && r.inquiryType !== f.inquiryType) return false;
    if (f.inquiryChannel && r.inquiryChannel !== f.inquiryChannel) return false;
    if (f.model && !(r.models || []).includes(f.model)) return false;
    if (f.staffName && (r.staffName || "미입력") !== f.staffName) return false;
    if (f.financeStatus && (r.financeStatus || "미확인") !== f.financeStatus) return false;
    if (f.visitStatus && (r.visitStatus || "미확인") !== f.visitStatus) return false;
    if (f.leadSource && (r.leadSource || "미입력") !== f.leadSource) return false;
    if (f.callOutcome && (r.callOutcome || "미입력") !== f.callOutcome) return false;
    if (f.budgetMin && Number(r.budgetMax || r.budgetMin || 0) < Number(f.budgetMin)) return false;
    if (f.budgetMax && Number(r.budgetMin || r.budgetMax || Infinity) > Number(f.budgetMax)) return false;
    return true;
  });
}

function renderAnalysisResults() {
  const rows = filteredAnalysisRows();
  const dated = rows.filter(r => parseDate(r.inquiryDate));
  const byDate = count(dated.map(r => r.inquiryDate));
  const byType = count(rows.map(r => r.inquiryType));
  const byModel = count(rows.flatMap(r => r.models || []));
  const byBudget = count(rows.map(budgetBand));
  const byStaff = count(rows.map(r => r.staffName || "미입력"));
  const byChannel = count(rows.map(r => r.inquiryChannel || "미입력"));
  const byFinance = count(rows.map(r => r.financeStatus || "미확인"));
  const byVisit = count(rows.map(r => r.visitStatus || "미확인"));
  const bySource = count(rows.map(r => r.leadSource || "미입력"));
  const byOutcome = count(rows.map(r => r.callOutcome || "미입력"));
  const byTiming = count(rows.map(r => r.purchaseTiming || "미입력"));
  const byTopic = count(rows.flatMap(r => r.topics?.length ? r.topics : ["미입력"]));
  const byWeekday = count(dated.map(r => weekdayLabels[parseDate(r.inquiryDate).getDay()]));
  const orderedWeekdays = weekdayLabels.slice(1).concat(weekdayLabels[0]).map(day => [day, byWeekday[day] || 0]);
  const budgetRows = rows.filter(r => r.budgetMin || r.budgetMax);
  const averageBudget = budgetRows.length ? Math.round(budgetRows.reduce((sum, r) => sum + Number(r.budgetMax || r.budgetMin || 0), 0) / budgetRows.length) : 0;
  $("#analysisResults").innerHTML = `
    <section class="kpis analysis-kpis">
      ${kpi("필터 결과", `${fmt(rows.length)}건`, `전체 ${fmt(leads.length)}건 중`)}
      ${kpi("고객 수", `${fmt(buildCustomers(rows).length)}명`, "전화번호 기준")}
      ${kpi("가장 많은 문의 차종", topEntries(byModel,1)[0]?.[0] || "-", `${fmt(topEntries(byModel,1)[0]?.[1] || 0)}건`)}
      ${kpi("평균 최대 예산", averageBudget ? `${fmt(averageBudget)}만원` : "-", `예산 입력 ${fmt(budgetRows.length)}건 기준`)}
    </section>
    <section class="grid analysis-grid">
      ${card("기간별 상담 현황", "문의일 기준", verticalBars(Object.entries(byDate).sort()), "wide")}
      ${card("상담이 많은 요일", "월요일부터 일요일까지", bars(orderedWeekdays))}
      ${card("문의 종류", "상담 목적 분포", donut(topEntries(byType,10), true), "chart")}
      ${card("희망 차종", "복수 차종 각각 집계", bars(topEntries(byModel,12)))}
      ${card("예산 분포", "최대 예산 기준", bars(Object.entries(byBudget)))}
      ${card("응대 직원", "담당자별 상담 건수", bars(topEntries(byStaff,12)))}
      ${card("문의 채널", "전화·문자 등", donut(topEntries(byChannel,8), true), "chart")}
      ${card("할부 여부", "할부 문의 현황", bars(topEntries(byFinance,8)))}
      ${card("방문 여부", "방문·예약 현황", bars(topEntries(byVisit,8)))}
      ${card("구매 예정일", "구매 시점 분포", bars(topEntries(byTiming,10)))}
      ${card("유입 경로", "대표번호·광고 등", bars(topEntries(bySource,10)))}
      ${card("상담 결과", "상담 상태 분포", bars(topEntries(byOutcome,10)))}
      ${card("문의 주제", "입력된 문의 주제 태그", bars(topEntries(byTopic,12)), "wide")}
    </section>`;
}

function renderSettings() {
  const settings = getSettings();
  app.innerHTML = `
    <section class="sync-hero">
      <div><span>JUNGCAR CRM SETTINGS</span><h2>설정 및 백업</h2><p>데이터 동기화, 연결 확인, 백업과 로그아웃을 한곳에서 관리합니다.</p></div>
      <div class="settings-summary"><b>Google Sheets</b><span>저장 시 자동 반영 ${settings.autoPush ? "사용 중" : "사용 안 함"}</span></div>
    </section>
    <section class="panel sync-panel">
      <h3>구글시트 연동</h3>
      <label class="check"><input id="syncAuto" type="checkbox" ${settings.autoPush ? "checked" : ""}> 고객 저장 시 구글시트 자동 반영</label>
      <div class="sync-buttons"><button id="saveSync">설정 저장</button><button id="testSync">연결 테스트</button><button id="pullSheet">시트 → 사이트 새로고침</button><button id="pushSheet">현재 사이트 → 시트 반영</button><button id="logout">로그아웃</button></div>
      <p id="syncStatus" class="status"></p>
      <hr>
      <h3>데이터 백업</h3>
      <p class="status">현재 구글시트에서 불러온 모든 상담 데이터를 CSV 파일로 저장합니다.</p>
      <div class="sync-buttons"><button id="settingsExportCsv">CSV 백업 다운로드</button></div>
    </section>`;
  $("#saveSync").onclick = saveSyncForm;
  $("#testSync").onclick = async () => { saveSyncForm(); await sheetList(true); };
  $("#pullSheet").onclick = async () => { saveSyncForm(); await pullFromSheet(); };
  $("#pushSheet").onclick = async () => { saveSyncForm(); await pushAllToSheet(); };
  $("#logout").onclick = logout;
  $("#settingsExportCsv").onclick = exportCsv;
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
function rankedCounts(entries) { return `<div class="ranked-counts">${entries.map(([k,v],i) => `<div><span><em>${i+1}</em>${escapeHtml(k)}</span><strong>${fmt(v)}<small>대</small></strong></div>`).join("") || `<p class="empty">표시할 차종 데이터가 없습니다.</p>`}</div>`; }
function verticalBars(entries) { const max = Math.max(...entries.map(([,v]) => v), 1); return `<div class="vbars">${entries.map(([k,v]) => `<div><b>${v}</b><i style="height:${Math.max(v/max*100,3)}%"></i><span>${escapeHtml(String(k).slice(5).replace("-","/"))}</span></div>`).join("")}</div>`; }
function donut(entries, chartRight=false) { const total = entries.reduce((s,[,v])=>s+v,0); let p=0; const colors=["#2f6fed","#16a085","#f59e0b","#8b5cf6","#ef5da8","#64748b","#0ea5e9","#f97316","#14b8a6","#eab308"]; const seg=entries.map(([,v],i)=>{const s=p; p+=total?v/total*100:0; return `${colors[i%colors.length]} ${s}% ${p}%`;}).join(","); const chart=`<div class="donut" style="background:conic-gradient(${seg || "#e2e8f0 0 100%"})"><div><strong>${fmt(total)}</strong><span>건</span></div></div>`; const legend=`<div class="legend">${entries.map(([k,v],i)=>`<span><i style="background:${colors[i%colors.length]}"></i>${escapeHtml(k)}<b>${fmt(v)}</b></span>`).join("")}</div>`; return `<div class="donut-wrap ${chartRight ? "chart-right" : ""}">${chartRight ? legend + chart : chart + legend}</div>`; }
function budgetBand(row) { const value = Number(row.budgetMax || row.budgetMin || 0); if (!value) return "미입력"; if (value < 1000) return "1천만원 미만"; if (value < 2000) return "1천~2천만원"; if (value < 3000) return "2천~3천만원"; if (value < 4000) return "3천~4천만원"; if (value < 5000) return "4천~5천만원"; return "5천만원 이상"; }
function topicCloud(entries) { return `<div class="topics">${entries.map(([k,v]) => `<span>${escapeHtml(k)}<b>${v}</b></span>`).join("")}</div>`; }
function inquiryTable(rows) { return `<div class="table"><table><thead><tr><th>문의일</th><th>전화번호</th><th>타입</th><th>문의 종류</th><th>차종</th><th>예산</th><th>할부</th><th>방문</th><th>담당자</th><th>희망 조건</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.inquiryDate||"-"}</td><td>${normalizePhone(r.phone||"")}</td><td>${r.inquiryChannel||"전화"}</td><td><span class="chip">${escapeHtml(r.inquiryType||"-")}</span></td><td><b>${escapeHtml((r.models||[]).join(", ")||"-")}</b></td><td>${escapeHtml(budgetLabel(r))}</td><td>${r.financeStatus||"미확인"}</td><td>${r.visitStatus||"미확인"}</td><td>${escapeHtml(r.staffName||"미입력")}</td><td>${escapeHtml(r.conditionRaw||"-")}</td></tr>`).join("")}</tbody></table></div>`; }
function customerTable(customers) { return `<table class="customers"><thead><tr><th>연락처</th><th>최근 상담일</th><th>최초 문의일</th><th>희망 차종</th><th>문의 종류</th><th>최근 예산</th><th>방문</th><th>응대 직원</th><th>최근 희망 조건</th></tr></thead><tbody>${customers.map(c => `<tr data-customer="${c.id}"><td><button class="link">${c.phone}</button></td><td>${c.lastInquiryDate||"-"}</td><td>${c.firstInquiryDate||"-"}</td><td><b>${escapeHtml(c.models.join(", ")||"-")}</b></td><td>${c.inquiryTypes.map(t=>`<span class="chip">${escapeHtml(t)}</span>`).join("")}</td><td>${escapeHtml(c.budgetLabel)}</td><td>${c.visitStatus}</td><td>${escapeHtml(c.staffNames.join(", ")||"미입력")}</td><td>${escapeHtml(c.latestCondition||"-")}</td></tr>`).join("")}</tbody></table>`; }
function bindCustomerRows() { $$("#customerTable tr[data-customer]").forEach(tr => tr.onclick = () => { selectedCustomer = buildCustomers().find(c => c.id === tr.dataset.customer); renderCustomers(); }); }
function detailItem(label, value) { return `<div><span>${label}</span><b>${escapeHtml(value || "미입력")}</b></div>`; }
function customerDetail(c) {
  return `<section class="detail">
    <div class="detail-head">
      <button id="back" class="secondary">← 고객 목록</button>
      <div><span>고객 식별번호</span><h2>${escapeHtml(c.phone)}</h2><p>최초 문의 ${c.firstInquiryDate || "-"} · 최근 문의 ${c.lastInquiryDate || "-"}</p></div>
      <button id="addInquiry">+ 추가 상담 기록</button>
    </div>
    <section class="customer-summary">
      ${detailItem("전체 희망 차종", c.models.join(", "))}
      ${detailItem("문의 종류", c.inquiryTypes.join(", "))}
      ${detailItem("응대 직원", c.staffNames.join(", "))}
      ${detailItem("방문 여부", c.visitStatus)}
    </section>
    <div class="section-title"><div><h3>날짜별 상담 내역</h3><p>상담 한 건마다 모든 입력 정보가 구글시트의 한 행으로 저장됩니다.</p></div><b>${fmt(c.inquiries.length)}건</b></div>
    <div class="history">${c.inquiries.map(r => `<article>
      <header><div><strong>${r.inquiryDate || "날짜 없음"}</strong><span class="chip">${escapeHtml(r.inquiryChannel || "전화")}</span><span class="chip">${escapeHtml(r.inquiryType || "-")}</span></div><div class="history-actions"><button data-edit="${r.id}">수정</button><button class="danger" data-del="${r.id}">삭제</button></div></header>
      <div class="history-grid">
        ${detailItem("희망 차종", (r.models || []).join(", "))}
        ${detailItem("예산", budgetLabel(r))}
        ${detailItem("부대비용 포함", includesAncillaryCost(r) ? "예" : "아니오")}
        ${detailItem("구매 예정일", r.purchaseTiming)}
        ${detailItem("할부 여부", r.financeStatus)}
        ${detailItem("방문 여부", r.visitStatus)}
        ${detailItem("담당자", r.staffName)}
        ${detailItem("유입 경로", r.leadSource)}
        ${detailItem("상담 결과", r.callOutcome)}
        ${detailItem("후속 연락일", r.followUpDate)}
        ${detailItem("문의 주제", (r.topics || []).join(", "))}
      </div>
      <div class="condition"><span>희망 조건·상담 메모</span><p>${escapeHtml(r.conditionRaw || "미입력")}</p></div>
    </article>`).join("")}</div>
  </section>`;
}
function bindDetail() {
  $("#back").onclick=()=>{selectedCustomer=null;renderCustomers();};
  $("#addInquiry").onclick=()=>openLeadForm(selectedCustomer.phone);
  $$("[data-edit]").forEach(b=>b.onclick=()=>openLeadForm(null, leads.find(r=>r.id===b.dataset.edit)));
  $$("[data-del]").forEach(b=>b.onclick=async()=>{
    const row = leads.find(r => r.id === b.dataset.del);
    if (!row || !confirm(`${row.inquiryDate || "날짜 없음"} 상담 내역을 삭제하시겠습니까?`)) return;
    leads=leads.filter(r=>r.id!==row.id);
    await syncDelete(row.id);
    selectedCustomer=buildCustomers().find(c=>c.id===selectedCustomer?.id)||null;
    renderCustomers();
  });
}
function formField(label, control, cls="") { return `<label class="${cls}"><span>${label}</span>${control}</label>`; }
function modelControl(name, value="", placeholder="") {
  return `<div class="model-autocomplete"><input name="${name}" data-model-autocomplete autocomplete="off" aria-autocomplete="list" aria-expanded="false" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}"><div class="model-suggestions" role="listbox" hidden></div></div>`;
}
function bindModelAutocomplete(root) {
  root.querySelectorAll("[data-model-autocomplete]").forEach(input => {
    const menu = input.parentElement.querySelector(".model-suggestions");
    const closeMenu = () => {
      menu.hidden = true;
      menu.innerHTML = "";
      input.setAttribute("aria-expanded", "false");
    };
    const selectModel = (name) => {
      input.value = name;
      input.dispatchEvent(new Event("change", { bubbles:true }));
      closeMenu();
      input.focus();
    };
    const showMatches = () => {
      const query = input.value.trim().toLocaleLowerCase("ko-KR");
      if (!query) {
        closeMenu();
        return;
      }
      const matches = CAR_MODELS.filter(item => item.name.toLocaleLowerCase("ko-KR").includes(query)).slice(0, 15);
      if (!matches.length) {
        menu.innerHTML = `<p>일치하는 모델이 없습니다.</p>`;
      } else {
        menu.innerHTML = matches.map(item => `<button type="button" role="option" data-model-value="${escapeHtml(item.name)}"><span>${escapeHtml(item.name)}</span><small>${escapeHtml(item.maker)}</small></button>`).join("");
        menu.querySelectorAll("[data-model-value]").forEach(button => {
          button.addEventListener("pointerdown", event => {
            event.preventDefault();
            selectModel(button.dataset.modelValue);
          });
        });
      }
      menu.hidden = false;
      input.setAttribute("aria-expanded", "true");
    };
    input.addEventListener("input", showMatches);
    input.addEventListener("focus", showMatches);
    input.addEventListener("keydown", event => {
      if (event.key === "Escape") closeMenu();
    });
    input.addEventListener("blur", () => setTimeout(closeMenu, 120));
  });
}
function openLeadForm(initialPhone="", existing=null) {
  const r=existing||{};
  const models=(r.models||[]);
  const html=`<dialog class="modal lead-modal" aria-labelledby="leadModalTitle"><form method="dialog" id="leadForm">
    <div class="modal-head"><div><span>${existing ? "CONSULTATION EDIT" : "NEW CONSULTATION"}</span><h2 id="leadModalTitle">${existing?"상담 내역 수정":"고객·상담 추가"}</h2></div><button type="button" class="icon-button" data-close-modal aria-label="닫기">×</button></div>
    <section class="form-section"><h3>기본 정보</h3><div class="form-grid">
      ${formField("문의 날짜", `<input name="inquiryDate" type="date" value="${r.inquiryDate||today()}" required>`)}
      ${formField("연락처", `<input name="phone" inputmode="numeric" autocomplete="tel" maxlength="13" placeholder="010-0000-0000" value="${escapeHtml(formatPhoneInput(initialPhone||r.phone||""))}" required>`)}
      ${formField("문의 채널", `<select name="inquiryChannel"><option ${selected(r.inquiryChannel||"전화","전화")}>전화</option><option ${selected(r.inquiryChannel,"문자")}>문자</option></select>`)}
      ${formField("문의 종류", `<input name="inquiryType" list="inquiryTypes" value="${escapeHtml(r.inquiryType||"구매")}" required><datalist id="inquiryTypes"><option value="구매"><option value="판매"><option value="판매 후 구매"><option value="할부/한도"><option value="방문 일정"><option value="수리/보증"><option value="기타/문의"></datalist>`)}
    </div></section>
    <section class="form-section"><h3>희망 차량과 예산</h3><div class="form-grid">
      ${formField("희망 차종 1", modelControl("model1", models[0]||"", "예: 쏘나타"))}
      ${formField("희망 차종 2", modelControl("model2", models[1]||"", "복수 차종일 때 입력"))}
      ${formField("희망 차종 3", modelControl("model3", models[2]||"", "복수 차종일 때 입력"))}
      ${formField("구매 예정일", `<input name="purchaseTiming" value="${escapeHtml(r.purchaseTiming||"")}" placeholder="예: 즉시, 1개월 이내">`)}
      ${formField("최소 예산(만원)", `<input name="budgetMin" inputmode="numeric" data-budget-input value="${formatThousands(r.budgetMin||"")}" placeholder="예: 1,000">`)}
      ${formField("최대 예산(만원)", `<input name="budgetMax" inputmode="numeric" data-budget-input value="${formatThousands(r.budgetMax||"")}" placeholder="예: 2,000">`)}
      <div class="checkbox-field"><span>예산 포함 범위</span><label class="inline-check"><input name="ancillaryIncluded" type="checkbox" ${includesAncillaryCost(r) ? "checked" : ""}> 부대비용 포함</label></div>
      <p class="budget-hint">희망 조건에 ‘3000 초반’ 입력 시 최소 3,000만원·최대 3,300만원으로 자동 입력됩니다. 중반은 3,400~3,600만원, 후반은 3,700~3,900만원 기준입니다.</p>
    </div></section>
    <section class="form-section"><h3>상담 진행 정보</h3><div class="form-grid">
      ${formField("할부 여부", `<select name="financeStatus"><option ${selected(r.financeStatus||"미확인","미확인")}>미확인</option><option ${selected(r.financeStatus,"예")}>예</option><option ${selected(r.financeStatus,"아니오")}>아니오</option></select>`)}
      ${formField("방문 여부", `<select name="visitStatus"><option ${selected(r.visitStatus||"미확인","미확인")}>미확인</option><option ${selected(r.visitStatus,"예")}>예</option><option ${selected(r.visitStatus,"아니오")}>아니오</option></select>`)}
      ${formField("담당자", `<input name="staffName" value="${escapeHtml(r.staffName||"")}" placeholder="응대 직원">`)}
      ${formField("유입 경로", `<input name="leadSource" value="${escapeHtml(r.leadSource||"대표번호")}" placeholder="대표번호, 광고 등">`)}
      ${formField("상담 결과", `<input name="callOutcome" value="${escapeHtml(r.callOutcome||"상담완료")}" placeholder="상담완료, 보류 등">`)}
      ${formField("후속 연락일", `<input name="followUpDate" type="date" value="${escapeHtml(r.followUpDate||"")}">`)}
      ${formField("문의 주제", `<input name="topics" value="${escapeHtml((r.topics||[]).join(", "))}" placeholder="가격, 옵션, 방문 등 쉼표로 구분">`, "full")}
      ${formField("희망 조건·상담 메모", `<textarea name="conditionRaw" rows="4" placeholder="핵심 조건을 간략히 입력">${escapeHtml(r.conditionRaw||"")}</textarea>`, "full")}
    </div></section>
    <menu><button type="button" class="secondary" data-close-modal>취소</button><button id="saveLead" value="default">저장</button></menu>
  </form></dialog>`;
  document.body.insertAdjacentHTML("beforeend", html);
  const dlg=$("dialog.modal");
  document.body.classList.add("modal-open");
  dlg.showModal();
  dlg.querySelectorAll("[data-close-modal]").forEach(button => button.addEventListener("click", () => dlg.close()));
  const phoneInput=dlg.querySelector('[name="phone"]');
  phoneInput.addEventListener("input", () => {
    phoneInput.value=formatPhoneInput(phoneInput.value);
  });
  dlg.querySelectorAll("[data-budget-input]").forEach(input => input.addEventListener("input", () => {
    input.value=formatThousands(input.value);
  }));
  bindModelAutocomplete(dlg);
  requestAnimationFrame(() => dlg.querySelector('[name="phone"]')?.focus({ preventScroll:true }));
  const conditionInput=dlg.querySelector('[name="conditionRaw"]');
  conditionInput.addEventListener("input", () => {
    const inferred=budgetRangeFromCondition(conditionInput.value);
    if (inferred) {
      dlg.querySelector('[name="budgetMin"]').value=formatThousands(inferred.min);
      dlg.querySelector('[name="budgetMax"]').value=formatThousands(inferred.max);
    }
    if (conditionInput.value.includes("할부")) dlg.querySelector('[name="financeStatus"]').value="예";
  });
  $("#saveLead").onclick=async(e)=>{
    e.preventDefault();
    const f=new FormData($("#leadForm"));
    const phone=normalizePhone(f.get("phone"));
    if (!validPhone(phone)) { alert("연락처를 010-0000-0000 형식으로 입력해 주세요."); return; }
    const conditionRaw=String(f.get("conditionRaw")||"").trim();
    const inferredBudget=budgetRangeFromCondition(conditionRaw);
    let budgetMin=inferredBudget?.min || parseFormattedNumber(f.get("budgetMin"));
    let budgetMax=inferredBudget?.max || parseFormattedNumber(f.get("budgetMax"));
    if (budgetMin && budgetMax && budgetMin > budgetMax) { alert("최소 예산은 최대 예산보다 클 수 없습니다."); return; }
    const inquiryType=String(f.get("inquiryType")||"구매").trim();
    const financeStatus=conditionRaw.includes("할부") ? "예" : f.get("financeStatus");
    const ancillaryIncluded=f.get("ancillaryIncluded")==="on";
    const manualTopics=String(f.get("topics")||"").split(",").map(s=>s.trim()).filter(t=>t && t!=="부대비용 포함");
    const topics=uniq([...manualTopics,...topicsFromText(conditionRaw,inquiryType,financeStatus),...(ancillaryIncluded?["부대비용 포함"]:[])]);
    const row={...r,id:r.id||`local-${Date.now()}`,source:"manual",inquiryDate:f.get("inquiryDate"),phone,inquiryChannel:f.get("inquiryChannel"),inquiryType,models:[f.get("model1"),f.get("model2"),f.get("model3")].map(s=>String(s||"").trim()).filter(Boolean),budgetMin,budgetMax,budgetRaw:[budgetMin,budgetMax].filter(Boolean).join("~"),budgetBucket:"표현형",purchaseTiming:String(f.get("purchaseTiming")||"").trim(),financeStatus,visitStatus:f.get("visitStatus"),staffName:String(f.get("staffName")||"").trim(),leadSource:String(f.get("leadSource")||"대표번호").trim(),callOutcome:String(f.get("callOutcome")||"상담완료").trim(),followUpDate:f.get("followUpDate"),conditionRaw,topics};
    if(existing) leads=leads.map(x=>x.id===row.id?row:x); else leads=[row,...leads];
    await syncUpsert(row);
    dlg.close();
    selectedCustomer=buildCustomers().find(c=>c.id===phoneKey(row.phone))||null;
    activeTab="customers";
    render();
  };
  dlg.addEventListener("close",()=>{
    document.body.classList.remove("modal-open");
    dlg.remove();
  }, { once:true });
}
function exportCsv() { const csv=["문의 날짜,연락처,문의 타입,문의 종류,희망 차량 1,희망 차량 2,희망 차량 3,최소 예산,최대 예산,부대비용 포함,구매 예정일,할부 여부,방문 여부,담당자,문의 주제,유입 경로,상담 결과,후속 연락일,희망 조건",...leads.map(r=>[r.inquiryDate,r.phone,r.inquiryChannel,r.inquiryType,...[0,1,2].map(i=>(r.models||[])[i]||""),r.budgetMin,r.budgetMax,includesAncillaryCost(r)?"예":"아니오",r.purchaseTiming,r.financeStatus,r.visitStatus,r.staffName,(r.topics||[]).join(", "),r.leadSource,r.callOutcome,r.followUpDate,r.conditionRaw].map(v=>`"${String(v||"").replaceAll('"','""')}"`).join(","))].join("\n"); const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob(["\ufeff",csv],{type:"text/csv;charset=utf-8"})); a.download=`jungcar-db-${today()}.csv`; a.click(); URL.revokeObjectURL(a.href); }
function escapeHtml(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
$$("[data-tab]").forEach(btn => btn.onclick = () => { activeTab = btn.dataset.tab; selectedCustomer = null; render(); });
loadData();
