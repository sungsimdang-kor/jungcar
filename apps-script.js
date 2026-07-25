// Jungcar CRM Google Apps Script template
// 실제 인증값은 코드/스프레드시트가 아니라 Apps Script의 "스크립트 속성"에 저장하세요.
// 필요한 속성:
// AUTH_USERNAME = admin
// AUTH_PASSWORD_SHA256 = 비밀번호의 SHA-256 해시

const SHEET_NAME = "고객DB";
const SESSION_TTL_SECONDS = 21600;
const HEADERS = ["사이트ID","문의 날짜","연락처","문의 타입","문의 종류","희망 차량_1","희망 차량_2","희망 차량_3","최소 예산","최대 예산","구매 예정일","할부 여부","방문 여부","담당자","문의 주제","유입 경로","상담 결과","후속 연락일","희망 조건","수정일시"];

function doGet(e) {
  const p = e.parameter || {};
  const result = handle({
    action: p.action,
    username: p.username,
    password: p.password,
    sessionToken: p.sessionToken,
    row: p.row ? JSON.parse(p.row) : null,
    siteId: p.siteId,
  });
  const callback = p.callback || "callback";
  return ContentService
    .createTextOutput(callback + "(" + JSON.stringify(result) + ")")
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function doPost(e) {
  return json(handle(JSON.parse(e.postData.contents || "{}")));
}

function handle(body) {
  if (body.action === "login") return login(body.username, body.password);
  if (!validateSession(body.sessionToken)) return { ok: false, error: "로그인이 필요합니다." };

  const sheet = getSheet();
  if (body.action === "list") return readRows(sheet);
  if (body.action === "upsert") return upsertRows(sheet, [body.row]);
  if (body.action === "replaceAll") return replaceAll(sheet, body.rows || []);
  if (body.action === "delete") return deleteBySiteId(sheet, body.siteId);
  return { ok: false, error: "지원하지 않는 요청입니다." };
}

function login(username, password) {
  const props = PropertiesService.getScriptProperties();
  const storedUsername = props.getProperty("AUTH_USERNAME");
  const storedPasswordHash = props.getProperty("AUTH_PASSWORD_SHA256");
  if (!storedUsername || !storedPasswordHash) {
    return { ok: false, error: "Apps Script 인증 설정이 아직 없습니다." };
  }
  if (username !== storedUsername || sha256(password || "") !== storedPasswordHash) {
    return { ok: false, error: "아이디 또는 비밀번호가 올바르지 않습니다." };
  }
  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put("session:" + token, "1", SESSION_TTL_SECONDS);
  return { ok: true, sessionToken: token, expiresIn: SESSION_TTL_SECONDS };
}

function validateSession(token) {
  return Boolean(token && CacheService.getScriptCache().get("session:" + token));
}

function sha256(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
  return bytes.map(function(byte) {
    const normalized = byte < 0 ? byte + 256 : byte;
    return ("0" + normalized.toString(16)).slice(-2);
  }).join("");
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  const first = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  if (first.join("") === "") sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  return sheet;
}

function readRows(sheet) {
  const values = sheet.getDataRange().getValues();
  const headers = values.shift() || HEADERS;
  const rows = values.filter(row => row.some(Boolean)).map((row, index) => toObject(headers, row, index + 2));
  return { ok: true, headers, totalRows: rows.length, rows };
}

function upsertRows(sheet, rows) {
  const idMap = siteIdMap(sheet);
  rows.filter(Boolean).forEach(row => {
    const values = toValues(row);
    const target = row.siteId && idMap[row.siteId] ? idMap[row.siteId] : sheet.getLastRow() + 1;
    sheet.getRange(target, 1, 1, HEADERS.length).setValues([values]);
  });
  return { ok: true, updated: rows.length };
}

function replaceAll(sheet, rows) {
  sheet.clearContents();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  if (rows.length) sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows.map(toValues));
  return { ok: true, updated: rows.length };
}

function deleteBySiteId(sheet, siteId) {
  const idMap = siteIdMap(sheet);
  if (siteId && idMap[siteId]) sheet.deleteRow(idMap[siteId]);
  return { ok: true, deleted: Boolean(siteId && idMap[siteId]) };
}

function siteIdMap(sheet) {
  const values = sheet.getDataRange().getValues();
  const map = {};
  for (let row = 2; row <= values.length; row++) {
    const id = values[row - 1][0];
    if (id) map[String(id)] = row;
  }
  return map;
}

function toValues(row) {
  return [row.siteId || "", row.inquiryDate || "", row.phone || "", row.inquiryChannel || "전화", row.inquiryType || "구매", row.model1 || "", row.model2 || "", row.model3 || "", row.budgetMin || "", row.budgetMax || "", row.purchaseTiming || "", row.financeStatus || "미확인", row.visitStatus || "미확인", row.staffName || "", row.topics || "", row.leadSource || "대표번호", row.callOutcome || "상담완료", row.followUpDate || "", row.conditionRaw || "", new Date()];
}

function toObject(headers, row, sourceRow) {
  const get = name => row[headers.indexOf(name)] || "";
  return {
    id: get("사이트ID"),
    sourceRow,
    inquiryDate: formatDate(get("문의 날짜")),
    phone: get("연락처"),
    inquiryChannel: get("문의 타입") || "전화",
    inquiryType: get("문의 종류") || "구매",
    models: [get("희망 차량_1"), get("희망 차량_2"), get("희망 차량_3")].filter(Boolean),
    budgetMin: Number(get("최소 예산")) || null,
    budgetMax: Number(get("최대 예산")) || null,
    budgetRaw: [get("최소 예산"), get("최대 예산")].filter(Boolean).join("~"),
    purchaseTiming: get("구매 예정일"),
    financeStatus: get("할부 여부") || "미확인",
    visitStatus: get("방문 여부") || "미확인",
    staffName: get("담당자"),
    topics: String(get("문의 주제")).split(",").map(s => s.trim()).filter(Boolean),
    leadSource: get("유입 경로") || "대표번호",
    callOutcome: get("상담 결과") || "상담완료",
    followUpDate: formatDate(get("후속 연락일")),
    conditionRaw: get("희망 조건"),
    source: "google-sheets",
  };
}

function formatDate(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value)) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return String(value || "");
}

function json(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
