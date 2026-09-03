const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class FakeRange {
  constructor(sheet, row, column, rowCount, columnCount) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.rowCount = rowCount;
    this.columnCount = columnCount;
  }

  setValues(values) {
    for (let r = 0; r < this.rowCount; r += 1) {
      const target = this.row - 1 + r;
      while (this.sheet.rows.length <= target) this.sheet.rows.push([]);
      for (let c = 0; c < this.columnCount; c += 1) {
        this.sheet.rows[target][this.column - 1 + c] = values[r][c];
      }
    }
    return this;
  }

  getValues() {
    return Array.from({ length:this.rowCount }, (_, r) =>
      Array.from({ length:this.columnCount }, (_, c) =>
        this.sheet.rows[this.row - 1 + r]?.[this.column - 1 + c] ?? ""));
  }

  createTextFinder(query) {
    const range = this;
    return {
      matchEntireCell() { return this; },
      findNext() {
        for (let r = 0; r < range.rowCount; r += 1) {
          const value = range.sheet.rows[range.row - 1 + r]?.[range.column - 1];
          if (String(value ?? "") === String(query)) return { getRow:() => range.row + r };
        }
        return null;
      },
    };
  }
}

class FakeSheet {
  constructor() { this.rows = []; }
  getParent() { return { getSpreadsheetTimeZone:() => "America/Los_Angeles" }; }
  getLastRow() { return this.rows.length; }
  getRange(row, column, rowCount=1, columnCount=1) { return new FakeRange(this, row, column, rowCount, columnCount); }
  deleteRow(row) { this.rows.splice(row - 1, 1); }
}

const sheet = new FakeSheet();
let lockAvailable = true;
let releasedLocks = 0;
const context = vm.createContext({
  console,
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ({
      getSheetByName: () => sheet,
      insertSheet: () => sheet,
    }),
    flush() {},
  },
  LockService: {
    getScriptLock: () => ({
      tryLock: () => lockAvailable,
      releaseLock: () => { releasedLocks += 1; },
    }),
  },
  Utilities: {
    formatDate: (value, timeZone) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(value),
  },
  Session: { getScriptTimeZone: () => "Asia/Seoul" },
});

vm.runInContext(fs.readFileSync(require.resolve("../apps-script.js"), "utf8"), context);

const activeSheet = context.getSheet();
assert.equal(activeSheet.getLastRow(), 1, "빈 시트에 헤더를 한 번만 생성해야 한다");

const original = {
  siteId:"site-test-1",
  inquiryDate:"2026-09-03",
  phone:"010-1234-5678",
  inquiryType:"구매",
  model1:"쏘나타",
  budgetMax:2500,
  conditionRaw:"무사고",
};
const inserted = context.upsertRows(activeSheet, [original]);
assert.equal(inserted.ok, true);
assert.deepEqual(JSON.parse(JSON.stringify(inserted.saved)), [{ siteId:"site-test-1", row:2, created:true }]);
assert.equal(activeSheet.getLastRow(), 2);
assert.equal(activeSheet.rows[1][2], "010-1234-5678");

const updated = context.upsertRows(activeSheet, [{ ...original, phone:"010-9999-8888", budgetMax:3300 }]);
assert.equal(updated.ok, true);
assert.equal(updated.saved[0].created, false, "같은 ID 재시도는 새 행을 만들지 않아야 한다");
assert.equal(activeSheet.getLastRow(), 2, "같은 ID를 다시 저장해도 중복 행이 생기면 안 된다");
assert.equal(activeSheet.rows[1][2], "010-9999-8888");
assert.equal(activeSheet.rows[1][9], 3300);

const beforeVerify = JSON.stringify(activeSheet.rows);
const verified = context.verifyRowRequest(activeSheet, { ...original, phone:"010-9999-8888", budgetMax:3300 });
assert.equal(verified.saved[0].verified, true);
assert.equal(JSON.stringify(activeSheet.rows), beforeVerify, "응답 유실 확인은 시트를 수정하지 않아야 한다");
assert.equal(context.verifyRowRequest(activeSheet, { ...original, siteId:"absent" }).saved.length, 0);
assert.throws(() => context.verifyRowRequest(activeSheet, original), /연락처/, "불일치 항목 이름을 반환해야 한다");
// 시트 시간대의 날짜만 비교해야 하며 스크립트 시간대에 따라 날짜가 바뀌면 안 됩니다.
const originalStoredDate = activeSheet.rows[1][1];
activeSheet.rows[1][1] = new Date("2026-09-03T20:00:00Z");
context.verifyRowRequest(activeSheet, { ...original, phone:"010-9999-8888", budgetMax:3300 });
activeSheet.rows[1][1] = originalStoredDate;

lockAvailable = false;
const blocked = context.upsertRows(activeSheet, [{ ...original, siteId:"site-test-2" }]);
assert.equal(blocked.ok, false);
assert.equal(activeSheet.getLastRow(), 2, "잠금을 얻지 못한 요청은 시트를 바꾸면 안 된다");
lockAvailable = true;

const removed = context.deleteBySiteId(activeSheet, "site-test-1");
assert.equal(removed.ok, true);
assert.equal(removed.deleted, true);
assert.equal(activeSheet.getLastRow(), 1);

const repeatedDelete = context.deleteBySiteId(activeSheet, "site-test-1");
assert.equal(repeatedDelete.ok, true, "응답 유실 후 삭제 재시도도 성공으로 처리해야 한다");
assert.equal(repeatedDelete.deleted, false);
assert.ok(releasedLocks >= 4);

console.log("apps-script save reliability tests: ok");
