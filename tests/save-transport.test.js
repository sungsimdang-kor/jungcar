const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const code = fs.readFileSync(require.resolve("../app.js"), "utf8");
const functionSource = code.slice(code.indexOf("async function syncUpsert("), code.indexOf("async function flushPendingSaves("));
const row = { id:"test-id", conditionRaw:"테스트" };
const ack = { ok:true, saved:[{siteId:row.id}] };
async function scenario(jsonp, post) {
  const calls = [];
  const context = vm.createContext({
    getSettings:() => ({endpoint:"test"}), session:{sessionToken:"test"},
    rowForSheet:r => ({...r,siteId:r.id}),
    sheetJsonp:async (action, payload) => { calls.push(["jsonp",action,payload.row.siteId]); return jsonp(action); },
    sheetPost:async (action, payload) => { calls.push(["post",action,payload.row.siteId]); return post(action); },
  });
  vm.runInContext(functionSource, context);
  return { calls, save:r => context.syncUpsert(r) };
}
(async () => {
  const normal = await scenario(() => ack, () => { throw Error("POST must not run"); });
  assert.equal((await normal.save(row)).ok, true);
  assert.deepEqual(normal.calls, [["jsonp","upsert",row.id]], "정상 저장은 요청 한 번으로 끝나야 한다");
  const lost = await scenario(action => { if(action === "upsert") throw Error("response lost"); return ack; });
  assert.equal((await lost.save(row)).ok, true);
  assert.deepEqual(lost.calls.map(c => c[1]), ["upsert","verify"], "응답 유실 후 두 번째 쓰기를 하면 안 된다");
  const rejected = await scenario(() => { throw Object.assign(Error("연락처 확인 불일치"), {serverResponse:true}); });
  await assert.rejects(rejected.save(row), /연락처 확인 불일치/);
  assert.equal(rejected.calls.length, 1, "서버 오류를 다른 오류로 덮거나 즉시 재전송하면 안 된다");
  const missing = await scenario(() => ({ok:true,updated:1}));
  await assert.rejects(missing.save(row), /확인하지 못했습니다/);
  const wrongId = await scenario(() => ({ok:true,saved:[{siteId:"different"}]}));
  await assert.rejects(wrongId.save(row), /확인하지 못했습니다/);
  const long = await scenario(() => { throw Error("JSONP must not run"); }, () => ack);
  await long.save({...row,conditionRaw:"가".repeat(1000)});
  assert.deepEqual(long.calls.map(c=>c[0]), ["post"], "긴 메모는 GET URL 제한을 피해야 한다");
  console.log("save transport tests: ok");
})().catch(error => { console.error(error); process.exitCode=1; });
