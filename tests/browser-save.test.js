const assert = require("node:assert/strict");
const { chromium } = require("playwright");

(async () => {
  const baseUrl = process.env.TEST_BASE_URL || "http://127.0.0.1:4173";
  const executablePath = process.env.BROWSER_EXECUTABLE;
  const browser = await chromium.launch({ headless:true, ...(executablePath ? { executablePath } : {}) });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error));
  await page.goto(baseUrl, { waitUntil:"domcontentloaded" });

  const fallbackResult = await page.evaluate(async () => {
    session = { sessionToken:"test-session" };
    const calls = [];
    sheetPost = async () => { calls.push("post"); throw new Error("post unavailable"); };
    sheetJsonp = async (action, payload) => {
      calls.push("jsonp");
      return { ok:true, saved:[{ siteId:payload.row.siteId }] };
    };
    const result = await syncUpsert({ id:"site-fallback", phone:"010-1111-2222", models:[] });
    return { calls, saved:result.saved[0].siteId };
  });
  assert.deepEqual(fallbackResult.calls, ["jsonp"], "일반 상담은 POST 대기 없이 한 번의 JSONP 요청으로 저장해야 한다");
  assert.equal(fallbackResult.saved, "site-fallback");

  const rejectsUnconfirmedSave = await page.evaluate(async () => {
    sheetPost = async () => ({ ok:true, updated:1 });
    sheetJsonp = async () => ({ ok:true, updated:1 });
    try {
      await syncUpsert({ id:"site-unconfirmed", phone:"010-1111-3333", models:[] });
      return false;
    } catch (error) {
      return error.message.includes("저장을 확인하지 못했습니다");
    }
  });
  assert.equal(rejectsUnconfirmedSave, true, "서버 재조회 확인이 없는 응답을 성공으로 처리하면 안 된다");

  await page.evaluate(() => {
    leads = [];
    activeTab = "customers";
    syncUpsert = async row => ({ ok:true, saved:[{ siteId:row.id }] });
    render();
    openLeadForm();
  });
  await page.locator('input[name="phone"]').fill("01012345678");
  await page.locator("#saveLead").click();
  await page.waitForFunction(() => !document.querySelector("dialog.lead-modal"));
  const successState = await page.evaluate(async () => ({ leadCount:leads.length, pending:(await listPendingSaves()).length }));
  assert.equal(successState.leadCount, 1);
  assert.equal(successState.pending, 0, "확인된 저장은 안전 저장소에서 정리되어야 한다");

  await page.evaluate(() => {
    syncUpsert = async () => { throw new Error("테스트 저장 확인 실패"); };
    openLeadForm();
  });
  await page.locator('input[name="phone"]').fill("01087654321");
  const alertMessage = new Promise(resolve => page.once("dialog", async dialog => {
    resolve(dialog.message());
    await dialog.dismiss();
  }));
  await page.locator("#saveLead").click();
  assert.equal(await alertMessage, "테스트 저장 확인 실패");
  assert.equal(await page.locator("dialog.lead-modal").isVisible(), true, "저장 확인 실패 시 입력 창을 닫으면 안 된다");
  const failedState = await page.evaluate(async () => ({ leadCount:leads.length, pending:(await listPendingSaves()).length }));
  assert.equal(failedState.leadCount, 1, "미확인 기록을 화면 DB에 성공처럼 추가하면 안 된다");
  assert.equal(failedState.pending, 1, "미확인 기록은 재시도를 위해 안전 저장소에 남아야 한다");

  assert.deepEqual(pageErrors, []);
  await browser.close();
  console.log("browser save reliability tests: ok");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
