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
            if (['petCarryXp', 'petCarryCoins'].some(k => s[k] != null && !Number.isSafeInteger(s[k]))) return false;
        }
        for (const r of data.pointsHistory) {
            if (['points', 'petXp', 'coinDelta'].some(k => r[k] != null && !Number.isFinite(r[k]))) return false;
        }
        if (data.petSettings != null && (typeof data.petSettings !== 'object' || Array.isArray(data.petSettings) || !Array.isArray(data.petSettings.rules))) return false;
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
