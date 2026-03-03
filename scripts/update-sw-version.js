/**
 * update-sw-version.js
 * Q14：Service Worker 版本號自動同步腳本
 *
 * 用法：node scripts/update-sw-version.js
 * 或透過 package.json "preversion" 自動執行
 *
 * 功能：從 manifest.json 讀取 version，
 * 自動更新 sw.js 中的 CACHE_NAME、STATIC_CACHE、DYNAMIC_CACHE
 * 以及 @version 標籤，確保每次升版不會漏改。
 */

const fs = require('fs');
const path = require('path');

// 路徑設定（相對於專案根目錄）
const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'manifest.json');
const SW_PATH = path.join(ROOT, 'sw.js');

// 讀取 manifest.json 取得版本號
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const version = manifest.version;

if (!version) {
    console.error('❌ 找不到 manifest.json 中的 version 欄位！');
    process.exit(1);
}

console.log(`📦 讀取版本號：v${version}`);

// 讀取 sw.js
let sw = fs.readFileSync(SW_PATH, 'utf8');

// 記錄替換前的版本
const prevMatch = sw.match(/CACHE_NAME = 'class-manager-v([\d.]+)'/);
const prevVersion = prevMatch ? prevMatch[1] : '???';

// 替換三個快取常數
sw = sw.replace(
    /const CACHE_NAME = 'class-manager-v[\d.]+'/g,
    `const CACHE_NAME = 'class-manager-v${version}'`
);
sw = sw.replace(
    /const STATIC_CACHE = 'class-manager-static-v[\d.]+'/g,
    `const STATIC_CACHE = 'class-manager-static-v${version}'`
);
sw = sw.replace(
    /const DYNAMIC_CACHE = 'class-manager-dynamic-v[\d.]+'/g,
    `const DYNAMIC_CACHE = 'class-manager-dynamic-v${version}'`
);

// 同步更新 @version JSDoc 標籤
sw = sw.replace(
    /\* @version [\d.]+/g,
    `* @version ${version}`
);

// 寫回 sw.js
fs.writeFileSync(SW_PATH, sw, 'utf8');
console.log(`✅ sw.js 已從 v${prevVersion} 更新至 v${version}`);
console.log(`   - CACHE_NAME = 'class-manager-v${version}'`);
console.log(`   - STATIC_CACHE = 'class-manager-static-v${version}'`);
console.log(`   - DYNAMIC_CACHE = 'class-manager-dynamic-v${version}'`);
