# 班級寵物 3D 素材

本組素材為專案原創程序建模，使用 Blender 5.2.1 LTS、Blender MCP（protocol 5）及 EEVEE 渲染。未下載外部模型或貼圖。

- 30 種：小貓、小狗、小兔、熊貓、狐狸、小熊、企鵝、貓頭鷹、烏龜、小龍、水豚、六角恐龍、獅子、老虎、大象、長頸鹿、斑馬、猴子、無尾熊、小熊貓、浣熊、水獺、刺蝟、松鼠、綿羊、小豬、青蛙、海豹、小鹿、獨角獸。
- 每種幼年、成長、成熟各有 3 種表情，共 270 張；另有 4 張共用蛋（0–2 安靜孵育、3–5 出現裂紋、6–8 裂縫擴大、9 即將破殼）。10 成長值才揭曉種類，不提前透露。舊版 13 張蛋資產保留相容。
- `build-pets.py`：完整可重製建模腳本。
- `source/*.blend`：各種類成熟造型與四段蛋的可編輯 Blender 場景。
- `pet-lineup.jpg`：30 種造型總覽；`egg-progress.jpg` 為四段蛋造型。
- 網站載入 `assets/pets/rendered/*.webp`，320×360 透明背景，延遲載入。

網站使用 **3D 預先渲染圖片**，不是 WebGL 即時旋轉模型。種類於首次達到 10 成長值時以瀏覽器加密亂數等機率抽出；前端不提供完整圖鑑，孵化前不展示種類，不能手動挑選或重抽。抽出後固定保存。表情由老師選擇，孵化升級回饋使用開心樣態；不另加經濟或成長規則。

## 重製

1. 已安裝 Blender MCP addon 的 Blender 執行 `scripts/start-pets-blender-mcp.py`，建立專用 localhost:18765 連線。此埠避開本機 Windows 保留的 9876，不修改全域 MCP 設定。
2. 在已安裝 Python MCP SDK 的環境執行 `scripts/render-pets-mcp.py --server <已安裝的 blender-mcp 可執行檔> --batch --prompt <使用者原始要求>`。安全模式保持開啟，遙測保持停用。渲染只清理專用 `ClassPetsStudio` 場景。
3. 執行 `scripts/pack-pet-renders.py`（需要 Pillow），將原始 PNG 打包為 WebP。
4. 執行 `node scripts/test-class-pets.cjs`，驗證 30 種隨機抽選、蛋進度門檻、表情、路徑白名單與既有金幣帳本。

商品、金幣、成長資料不在 Blender 場景中。`students.classPet`、`students.classPetRevealed` 與 `students.classPetMood` 隨既有班級同步與備份儲存。

增量渲染可用 `--kinds monkey,mystery --force` 指定重製；打包只更新有異動的 PNG。

2026-09-22：共用蛋改為較大的繽紛漸層蛋殼。Blender MCP 製作四段靜態 3D 渲染，前端以輕微縮放／旋轉呈現呼吸晃動；遵守 reduced-motion。
