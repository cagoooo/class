// GitHub Pages 只發布網站需要的檔案（2026-11-24，全站檢測第 13 項）
//  - 不該公開的：雲端函式原始碼、測試腳本、說明文件、資料庫規則、部署設定、Blender 原始檔
//  - 一定要有的：頁面、Service Worker 預先快取清單、manifest 圖示所參考到的每一個檔案
// 做法：真的跑一次 scripts/build-site.cjs，檢查輸出的資料夾。
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { assertSafeOutput, buildSite, ROOT_FILES, SITE_DIRS, TEMP_PREFIX } = require('./build-site.cjs');

const ROOT = path.join(__dirname, '..');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
const { files } = buildSite(OUT);
const has = (rel) => fs.existsSync(path.join(OUT, rel));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
function test(name, fn) { fn(); console.log('PASS', name); passed++; }

/** 把頁面裡的本機路徑整理成相對於網站根目錄的路徑；外部網址、資料網址、錨點回傳 null。 */
function localPath(ref, fromDir = '') {
    const clean = String(ref).trim().split('#')[0].split('?')[0];
    if (!clean || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(clean) || clean.includes('${') || clean.includes('__')) return null;
    return path.posix.normalize(path.posix.join(fromDir, clean)).replace(/^\.\//, '');
}

try {
    test('不該公開的東西沒有被發布', () => {
        for (const rel of ['functions', 'scripts', '.github', 'art', 'tests', 'reports', '.agent', '.git',
            'CLAUDE.md', 'AGENTS.md', 'CHANGELOG.md', 'README.md', 'DATA-SAFETY.md', 'DEVELOPMENT_PROGRESS.md',
            'firestore.rules', 'firestore.indexes.json', 'firebase.json', '.firebaserc', 'package.json', '.gitignore', '.env']) {
            assert.ok(!has(rel), rel + ' 不應該出現在網站上');
        }
        const everything = fs.readdirSync(OUT, { recursive: true }).map(String);
        const leaked = everything.filter((p) => /\.(md|cjs|py|rules|blend|log|err|env)$/i.test(p));
        assert.deepEqual(leaked, [], '網站資料夾裡不應該有說明文件、腳本、規則或 Blender 檔');
        assert.deepEqual(fs.readdirSync(OUT).sort(), [...ROOT_FILES, ...SITE_DIRS].sort(), '根目錄只有清單上的檔案與資料夾');
    });

    test('三個頁面的 script／link／圖示參考到的本機檔案都有發布', () => {
        for (const page of ['index.html', 'classnew.html', 'pets.html']) {
            const html = read(page);
            const refs = [...html.matchAll(/<(?:script|link|img|source)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
            assert.ok(refs.length > 3, page + ' 應該有參考到檔案');
            for (const ref of refs) {
                const rel = localPath(ref);
                if (rel) assert.ok(has(rel), `${page} 參考的 ${ref} 沒有被發布`);
            }
        }
    });

    test('Service Worker 預先快取清單裡的每個檔案都有發布', () => {
        const sw = read('sw.js');
        const block = sw.slice(sw.indexOf('STATIC_ASSETS'), sw.indexOf('];', sw.indexOf('STATIC_ASSETS')));
        const entries = [...block.matchAll(/['"](\.\/[^'"]*)['"]/g)].map((m) => m[1]);
        assert.ok(entries.length > 20, '應該讀得到預先快取清單（實際 ' + entries.length + ' 筆）');
        for (const entry of entries) {
            const rel = localPath(entry) || 'index.html';
            assert.ok(has(rel === '.' ? 'index.html' : rel), 'sw.js 預先快取的 ' + entry + ' 沒有被發布');
        }
    });

    test('manifest 的圖示、起始頁，以及 js 動態載入的 js 檔都有發布', () => {
        const manifest = JSON.parse(read('manifest.json'));
        for (const icon of manifest.icons || []) {
            const rel = localPath(icon.src);
            if (rel) assert.ok(has(rel), 'manifest 圖示 ' + icon.src + ' 沒有被發布');
        }
        const start = localPath(manifest.start_url || './');
        assert.ok(has(!start || start === '.' ? 'index.html' : start), 'manifest 的起始頁沒有被發布');
        // 程式裡寫死的 'js/xxx.js'（延後載入的模組）
        for (const file of fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js'))) {
            const src = read('js/' + file);
            for (const m of src.matchAll(/['"`](?:\.\/)?(js\/[A-Za-z0-9_./-]+\.js)(?:\?[^'"`]*)?['"`]/g)) {
                assert.ok(has(m[1]), `js/${file} 會載入的 ${m[1]} 沒有被發布`);
            }
        }
    });

    test('整個 js、css、assets、icons 資料夾原樣發布，檔案內容相同', () => {
        const count = (dir) => fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).length;
        for (const dir of SITE_DIRS) assert.equal(count(path.join(OUT, dir)), count(path.join(ROOT, dir)), dir + ' 的檔案數要相同');
        for (const rel of ['classnew.html', 'sw.js', 'js/firebase-config.js', 'js/class-aware-storage.js', 'css/rwd-breakpoints.css']) {
            assert.ok(fs.readFileSync(path.join(OUT, rel)).equals(fs.readFileSync(path.join(ROOT, rel))), rel + ' 內容要相同');
        }
        assert.ok(files > 700, '發布的檔案數看起來太少：' + files);
    });

    test('部署流程：先注入金鑰、再整理網站資料夾、只上傳那個資料夾', () => {
        const yml = read('.github/workflows/deploy.yml');
        const inject = yml.indexOf('inject.py'), build = yml.indexOf('scripts/build-site.cjs'), upload = yml.indexOf('upload-pages-artifact');
        assert.ok(inject > 0 && build > inject, '整理網站資料夾要排在注入金鑰之後（否則發布出去的是沒有金鑰的佔位符）');
        assert.ok(upload > build, '上傳要排在整理之後');
        assert.match(yml, /path:\s*['"]?_site['"]?/, '只上傳 _site');
        assert.doesNotMatch(yml, /path:\s*['"]\.['"]/, '不可以再上傳整個 repo');
        assert.match(read('.gitignore'), /^_site\/$/m, '_site 不入庫');
    });

    // ⚠️ 這裡只測「檢查位置」的函式，絕對不要把危險路徑交給 buildSite（它會先清空輸出資料夾）。
    test('輸出資料夾只接受 repo 底下的 _site 與暫存資料夾裡的 class-site-*，其他一律拒絕', () => {
        const refuse = (p) => assert.throws(() => assertSafeOutput(p), /輸出資料夾只能是/, '應該拒絕：' + p);
        refuse(ROOT);                                   // repo 本身
        refuse(path.join(ROOT, '..'));                  // repo 的上層（磁碟機根目錄）
        refuse(path.parse(ROOT).root);                  // 磁碟機根目錄
        refuse(path.join(ROOT, 'js'));                  // repo 裡的其他資料夾
        refuse(path.join(ROOT, 'out', '_site'));        // 不是直接在 repo 底下
        refuse(path.join(ROOT, '..', '_site'));         // 別的地方的 _site
        refuse(os.tmpdir());                            // 暫存資料夾本身
        refuse(path.join(os.tmpdir(), 'other-folder')); // 暫存資料夾裡名稱不對的
        refuse(path.join(os.tmpdir(), TEMP_PREFIX));    // 只有前綴、沒有名稱
        refuse(os.homedir());
        assert.equal(assertSafeOutput(path.join(ROOT, '_site')), path.join(ROOT, '_site'));
        assert.equal(assertSafeOutput(OUT), path.resolve(OUT));
        // buildSite 一開始就呼叫這個檢查（在任何刪除之前）
        const src = fs.readFileSync(path.join(__dirname, 'build-site.cjs'), 'utf8');
        const body = src.slice(src.indexOf('function buildSite('));
        assert.ok(body.indexOf('assertSafeOutput(') > 0 && body.indexOf('assertSafeOutput(') < body.indexOf('fs.rmSync('), '檢查要排在清空之前');
        assert.equal(src.split('fs.rmSync(').length - 1, 1, '整支腳本只有一個地方會刪除');
    });
} finally {
    fs.rmSync(OUT, { recursive: true, force: true });
}

console.log(passed + ' site-publish-scope checks passed');
