// 把「網站真正需要的檔案」複製到一個資料夾，GitHub Pages 只發布那個資料夾。
//
// 以前部署是把整個 repo 原封不動發布（deploy.yml 的 path: '.'），所以雲端函式原始碼、
// 測試腳本、說明文件（裡面有部署帳號與兩個網站的架構）、資料庫規則、Blender 原始檔
// 全部都能從網站網址直接讀到（2026-11-23 全站檢測第 13 項）。
//
// 新增一個網站會用到的「根目錄檔案」或「資料夾」時，要加進下面的清單；
// scripts/test-site-publish-scope.cjs 會檢查頁面與 Service Worker 參考到的檔案都有被發布。
//
// 用法：node scripts/build-site.cjs [輸出資料夾，預設 _site]
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');

// 網站根目錄的檔案
const ROOT_FILES = [
    'index.html', 'classnew.html', 'pets.html',
    'sw.js', 'manifest.json', 'critical-update.json',
    'favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'og-preview.png',
];
// 整個資料夾都是網站內容
const SITE_DIRS = ['js', 'css', 'assets', 'icons'];

const REPO_ROOT = path.join(__dirname, '..');
const TEMP_PREFIX = 'class-site-';

/**
 * 輸出資料夾會先被清空，所以只接受兩種位置，其他一律拒絕（寧可不能用，也不能刪錯地方）：
 *   1. repo 底下、名稱就叫 _site 的資料夾（部署流程用的）
 *   2. 系統暫存資料夾底下、名稱以 class-site- 開頭的資料夾（測試用的）
 * 2026-11-24 第一版只擋「等於 repo 或是 repo 的上層」，而且判斷寫錯，測試把磁碟機根目錄傳進來時
 * 竟然通過檢查、真的去刪（幸好系統拒絕，沒有東西被刪）。所以改成「只准這兩種」。
 */
function assertSafeOutput(outDir, rootDir = REPO_ROOT) {
    const out = path.resolve(outDir);
    const root = path.resolve(rootDir);
    const same = (a, b) => path.relative(a, b) === '';
    const inRepo = same(path.dirname(out), root) && path.basename(out) === '_site';
    const tmp = fs.realpathSync(os.tmpdir());
    const outParent = fs.existsSync(path.dirname(out)) ? fs.realpathSync(path.dirname(out)) : path.dirname(out);
    const inTemp = same(outParent, tmp) && path.basename(out).startsWith(TEMP_PREFIX) && path.basename(out).length > TEMP_PREFIX.length;
    if (!inRepo && !inTemp) {
        throw new Error('輸出資料夾只能是 repo 底下的 _site，或系統暫存資料夾底下以 ' + TEMP_PREFIX + ' 開頭的資料夾：' + out);
    }
    return out;
}

function buildSite(outDir, rootDir = REPO_ROOT) {
    const root = path.resolve(rootDir);
    const out = assertSafeOutput(outDir, root);
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });
    let files = 0;
    for (const name of ROOT_FILES) {
        const from = path.join(root, name);
        if (!fs.existsSync(from)) throw new Error('找不到要發布的檔案：' + name);
        fs.copyFileSync(from, path.join(out, name));
        files++;
    }
    for (const dir of SITE_DIRS) {
        const from = path.join(root, dir);
        if (!fs.existsSync(from)) throw new Error('找不到要發布的資料夾：' + dir);
        fs.cpSync(from, path.join(out, dir), { recursive: true });
        files += fs.readdirSync(path.join(out, dir), { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).length;
    }
    return { out, files };
}

module.exports = { ROOT_FILES, SITE_DIRS, TEMP_PREFIX, assertSafeOutput, buildSite };

if (require.main === module) {
    const { out, files } = buildSite(process.argv[2] || path.join(REPO_ROOT, '_site'));
    console.log(`已整理出要發布的網站：${files} 個檔案 → ${out}`);
}
