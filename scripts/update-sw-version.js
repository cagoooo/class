/**
 * update-sw-version.js
 * Q14：Service Worker 版本號自動同步腳本
 *
 * 用法：node scripts/update-sw-version.js
 * 或透過 package.json "preversion" 自動執行
 *
 * 功能：從 manifest.json 讀取 version，自動更新：
 *   - sw.js 中的 CACHE_NAME、STATIC_CACHE、DYNAMIC_CACHE 與 @version 標籤
 *   - classnew.html 中的 <title>、window.APP_VERSION、版本徽章 v3.x.x
 *   確保每次升版不會漏改。
 */

const fs = require('fs');
const path = require('path');

// 路徑設定（相對於專案根目錄）
const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'manifest.json');
const SW_PATH = path.join(ROOT, 'sw.js');
const HTML_PATH = path.join(ROOT, 'classnew.html');

// 讀取 manifest.json 取得版本號
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const version = manifest.version;

if (!version) {
    console.error('❌ 找不到 manifest.json 中的 version 欄位！');
    process.exit(1);
}

console.log(`📦 讀取版本號：v${version}`);

// ─────────────── 更新 sw.js ───────────────
let sw = fs.readFileSync(SW_PATH, 'utf8');
const prevMatch = sw.match(/CACHE_NAME = 'class-manager-v([\d.]+)'/);
const prevVersion = prevMatch ? prevMatch[1] : '???';

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
sw = sw.replace(
    /\* @version [\d.]+/g,
    `* @version ${version}`
);

fs.writeFileSync(SW_PATH, sw, 'utf8');
console.log(`✅ sw.js 已從 v${prevVersion} 更新至 v${version}`);

// ─────────────── 更新 classnew.html ───────────────
let html = fs.readFileSync(HTML_PATH, 'utf8');
let htmlChanged = false;
const htmlChanges = [];

// 1. <title>班級小管家 v3.x.x</title>
const titleBefore = html;
html = html.replace(
    /<title>班級小管家(?:\s+v[\d.]+)?<\/title>/,
    `<title>班級小管家 v${version}</title>`
);
if (html !== titleBefore) { htmlChanged = true; htmlChanges.push(`<title> → 班級小管家 v${version}`); }

// 2. window.APP_VERSION = '3.x.x';
const appVerBefore = html;
html = html.replace(
    /window\.APP_VERSION\s*=\s*'[\d.]+'\s*;/,
    `window.APP_VERSION = '${version}';`
);
if (html !== appVerBefore) { htmlChanged = true; htmlChanges.push(`window.APP_VERSION → '${version}'`); }

// 3. 版本徽章內容：id="app-version-badge" 的 <span> 內容
//    匹配「>  v3.1.4  <」這種形式（含可能的空白與換行）
const badgeBefore = html;
html = html.replace(
    /(id="app-version-badge"[\s\S]*?>)\s*v[\d.]+\s*(<\/span>)/,
    `$1\n                                v${version}\n                            $2`
);
if (html !== badgeBefore) { htmlChanged = true; htmlChanges.push(`版本徽章 → v${version}`); }

// 4. 統一所有「本地 js/css」的 cache-bust 查詢字串（?v=）為當前版本。
//    根治「改了 js/css 卻因瀏覽器 / SW cacheFirst 快取看到舊版、要手動補 ?v=」的長年痛點：
//    發版時所有資源 URL 都會變 → 強制繞過所有快取層抓最新（外部 CDN / 絕對網址不受影響）。
const assetBefore = html;
// (a) 已有 ?v=x.x.x → 換成新版本
html = html.replace(
    /((?:\.\/)?(?:js|css)\/[\w.\-]+\.(?:js|css))\?v=[\d.]+/g,
    `$1?v=${version}`
);
// (b) 還沒有 ?v= 的本地 js/css → 補上（副檔名後須緊接引號才匹配，避免對已帶 ?v 的重複加）
html = html.replace(
    /(src="|href=")((?:\.\/)?(?:js|css)\/[\w.\-]+\.(?:js|css))(")/g,
    `$1$2?v=${version}$3`
);
if (html !== assetBefore) { htmlChanged = true; htmlChanges.push(`所有本地 js/css ?v= → ${version}`); }

if (htmlChanged) {
    fs.writeFileSync(HTML_PATH, html, 'utf8');
    console.log(`✅ classnew.html 已更新：`);
    htmlChanges.forEach(c => console.log(`   - ${c}`));
} else {
    console.log(`ℹ️  classnew.html 無需更新（已是 v${version}）`);
}

console.log(`\n🎯 總結：`);
console.log(`   - CACHE_NAME / STATIC_CACHE / DYNAMIC_CACHE = 'class-manager-v${version}'`);
console.log(`   - <title> / window.APP_VERSION / 版本徽章 = v${version}`);
