/** Shared backup codec: ordered chunks, corruption detection, strict core validation. */
(function () {
    'use strict';
    function checksum(text) {
        let crc = -1;
        for (let i = 0; i < text.length; i++) {
            // Hash both UTF-16 bytes, including emoji surrogate pairs.
            for (const byte of [text.charCodeAt(i) & 255, text.charCodeAt(i) >>> 8]) {
                crc ^= byte;
                for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
            }
        }
        return ((crc ^ -1) >>> 0).toString(16).padStart(8, '0');
    }
    function validateQuests(config) {
        if (config.quests == null && config.collectionEggs == null) return true;
        const quests = config.quests || [], eggs = config.collectionEggs || [];
        if (!Array.isArray(quests) || !Array.isArray(eggs) || quests.length > 200 || eggs.length > 200) return false;
        const date = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
        const day = v => v === '' || date(v) && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(v).toISOString().slice(0,10) === v;
        const ids = new Map();
        for (const q of quests) {
            if (!q || typeof q.id !== 'string' || !q.id || ids.has(q.id) || typeof q.name !== 'string' || !q.name.trim() || q.name.length > 40 || !Number.isSafeInteger(q.target) || q.target < 1 || q.target > 100 || !day(q.startDate) || !day(q.endDate) || q.startDate && q.endDate && q.startDate > q.endDate || !date(q.createdAt)) return false;
            if (q.claimedAt != null && !date(q.claimedAt) || q.archivedAt != null && !date(q.archivedAt) || q.claimedAt && q.archivedAt || !Array.isArray(q.events) || q.events.length > 1000) return false;
            const events = new Map(), reversed = new Set(); let total = 0;
            for (const e of q.events) {
                if (!e || typeof e.id !== 'string' || !e.id || events.has(e.id) || ![1,-1].includes(e.amount) || !date(e.at) || typeof e.note !== 'string' || e.note.length > 80) return false;
                if (e.amount === -1) {
                    if (events.get(e.reverses)?.amount !== 1 || reversed.has(e.reverses)) return false;
                    reversed.add(e.reverses);
                } else if (e.reverses != null) return false;
                total += e.amount; if (total < 0 || total > q.target) return false;
                events.set(e.id,e);
            }
            if (q.claimedAt && total !== q.target) return false;
            ids.set(q.id,q);
        }
        const eggIds = new Set(), kinds = new Set('cat dog rabbit panda fox bear penguin owl turtle dragon capybara axolotl lion tiger elephant giraffe zebra monkey koala redpanda raccoon otter hedgehog squirrel sheep pig frog seal deer unicorn'.split(' '));
        for (const e of eggs) {
            if (!e || !ids.get(e.id)?.claimedAt || eggIds.has(e.id) || typeof e.questName !== 'string' || !e.questName || e.questName.length > 40 || !date(e.earnedAt)) return false;
            if ((e.kind != null || e.openedAt != null) && (!kinds.has(e.kind) || !date(e.openedAt))) return false;
            eggIds.add(e.id);
        }
        return quests.every(q => !q.claimedAt || eggIds.has(q.id));
    }
    function validate(data) {
        if (!data || typeof data !== 'object' || Array.isArray(data) || !['1.0', '1.1', '1.2'].includes(String(data.version))) return false;
        for (const key of ['students', 'groups', 'pointsHistory']) {
            if (!Array.isArray(data[key])) return false;
            const seen = new Set();
            for (const item of data[key]) {
                if (!item || typeof item !== 'object' || item.id == null || !['string', 'number'].includes(typeof item.id) || !String(item.id) || seen.has(String(item.id))) return false;
                seen.add(String(item.id));
            }
        }
        for (const s of data.students) {
            if (typeof s.name !== 'string' || (s.points != null && !Number.isFinite(s.points))) return false;
            if (s.classPetRevealed != null && typeof s.classPetRevealed !== 'boolean') return false;
            if (s.petNickname != null && (typeof s.petNickname !== 'string' || s.petNickname.length > 20)) return false;
            if (s.petHatchedAt != null && (typeof s.petHatchedAt !== 'string' || !Number.isFinite(Date.parse(s.petHatchedAt)))) return false;
            if (s.petMaxLevel != null && (!Number.isSafeInteger(s.petMaxLevel) || s.petMaxLevel < 0)) return false;
            if (['petCarryXp', 'petCarryCoins'].some(k => s[k] != null && !Number.isSafeInteger(s[k]))) return false;
        }
        for (const r of data.pointsHistory) {
            if (['points', 'petXp', 'coinDelta'].some(k => r[k] != null && !Number.isFinite(r[k]))) return false;
        }
        if (data.petSettings != null && (typeof data.petSettings !== 'object' || Array.isArray(data.petSettings) || !Array.isArray(data.petSettings.rules))) return false;
        if (data.petSettings && !validateQuests(data.petSettings)) return false;
        return true;
    }
    function split(text, size) {
        const parts = [];
        for (let start = 0; start < text.length;) {
            let end = Math.min(start + size, text.length);
            const last = text.charCodeAt(end - 1);
            if (end < text.length && last >= 0xd800 && last <= 0xdbff) end--;
            parts.push(text.slice(start, end)); start = end;
        }
        return parts;
    }
    function encode(data) {
        if (!validate(data)) throw Error('備份資料格式不完整，未匯出');
        const json = JSON.stringify(data), parts = split(json, 28000);
        const rows = [['⚠️ 還原專用資料，請勿修改或刪除'], ['CHUNKS_V2', parts.length, json.length, checksum(json)]];
        parts.forEach((text, index) => rows.push(['DATA', text, index]));
        return rows;
    }
    function decode(rows) {
        const headers = rows.filter(r => r && ['CHUNKS', 'CHUNKS_V2'].includes(r[0]));
        const chunks = rows.filter(r => r && r[0] === 'DATA');
        if (headers.length !== 1 || !Number.isSafeInteger(headers[0][1]) || headers[0][1] < 1 || chunks.length !== headers[0][1] || chunks.some(r => typeof r[1] !== 'string')) throw Error('備份分段遺失或數量不符，未還原');
        const header = headers[0], json = chunks.map(r => r[1]).join('');
        if (header[0] === 'CHUNKS_V2' && (chunks.some((r, i) => r[2] !== i) || json.length !== header[2] || checksum(json) !== header[3])) throw Error('備份順序或完整性檢查失敗，未還原');
        const data = JSON.parse(json);
        if (!validate(data)) throw Error('備份資料格式不完整，未還原');
        return data;
    }
    window.BackupIntegrity = { checksum, validate, encode, decode, split };
})();
