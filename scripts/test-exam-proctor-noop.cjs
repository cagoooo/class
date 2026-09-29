const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const values = new Map(Object.entries({
    examDayPresets: JSON.stringify({ currentDay: 1, days: { '1': [] } }),
    examSubjects: '[]',
    examReminders: JSON.stringify({ exam: [], break: [] }),
    examAttendance: JSON.stringify({ expected: 20, present: 20, absentNote: '' }),
    examAbsenceRecords: '[]',
    examLightMode: 'false',
    examAnalogClock: 'false',
}));
const writes = [];
const modal = { classList: { add() {}, remove() {}, toggle() {} } };
const noteInput = { value: '' };
const lightButton = { textContent: '', title: '' };
const context = {
    console: { log() {}, warn() {}, error() {} },
    localStorage: {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => { writes.push(key); values.set(key, String(value)); },
    },
    document: {
        readyState: 'loading',
        addEventListener() {},
        getElementById: id => ({ examFullscreenModal: modal, examAbsentNote: noteInput, examLightModeBtn: lightButton })[id] || null,
        body: { style: {} },
    },
    clearInterval() {},
    setInterval() { return 1; },
    setTimeout() { return 1; },
    clearTimeout() {},
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/exam-proctor.js', 'utf8'), context);

context.closeExamFullscreen();
assert.deepEqual(writes, [], '單純開啟後關閉監考畫面不應寫入任何班級資料');

noteInput.value = '家長已聯絡';
context.closeExamFullscreen();
assert.deepEqual(writes, ['examAttendance'], '只有缺考備註真的改變時才保存該筆資料');
assert.equal(JSON.parse(values.get('examAttendance')).absentNote, '家長已聯絡');

writes.length = 0;
context.toggleExamLightMode();
assert.deepEqual(writes, ['examLightMode'], '切換監考畫面明暗只保存介面偏好');

console.log('3 exam proctor no-op sync checks passed');
