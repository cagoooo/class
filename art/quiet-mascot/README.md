# 安靜挑戰小幫手 3D 素材

v3.69.0（2026-11-19）：安靜挑戰的 5 隻小幫手（🦉 噓噓、🐱 喵喵、🐻 嚕嚕、🐰 跳跳、🐼 圓圓）從向量圖改成 Blender 3D 渲染。
專案原創程序建模，使用 **Blender 5.3.0**、Blender MCP（protocol 5、安全模式、遙測停用）與 EEVEE 渲染，未下載外部模型或貼圖。

- 8 種心情 × 每種 2～4 格動作，共 24 格／隻、120 張渲染（400×430 透明背景）。
  - off：揮手打招呼＋眨眼；calm：抱肚子眨眼、瞇眼笑；sleep：歪頭打呼、鼻涕泡泡一大一小
  - doze：點頭打瞌睡又驚醒；warn：手指放嘴邊「噓～」左看右看、驚嘆號與汗滴
  - loud：摀耳朵左右晃；storm：摀耳朵大叫、生氣符號；party：舉手歡呼、閃閃發亮
- `build-mascot.py`：建模、表情、姿勢與燈光（只清理專用 `QuietMascotStudio` 場景）。
- `source/*.blend`：每隻小幫手 calm 第一格的可編輯 Blender 場景。
- 網站載入 `assets/quiet-mascot/<動物>-<心情>.webp`：同一心情的格子排成一條，前端依 `SPRITE_PLAN` 時間表輪播；
  整體晃動、跳躍仍用原本的 CSS 動畫，兩者疊加。開啟「減少動態」時只顯示第一格。動作圖載入失敗時退回原本的向量圖。

## 重製

1. 用 OpenGL 啟動專用 Blender（5.3 預設 Vulkan，這台電腦的 Intel 顯示卡驅動 igvk64.dll 會閃退）：
   `"C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" --factory-startup --gpu-backend opengl --python scripts/start-pets-blender-mcp.py`
   外掛會自動在 9876 埠啟動（Blender 5.3 的外掛放在 `%APPDATA%\Blender Foundation\Blender\5.3\scripts\addons\blender_mcp.py`，複製自 blender-mcp 原始碼的 `addon.py`）。
2. `python scripts/render-mascot-mcp.py --server <blender-mcp 執行檔> --port 9876 --prompt <使用者原始要求> [--force]`
   可用 `--only owl:calm:0,cat:party:1` 只重渲指定格、`--animals`／`--moods` 篩選。
3. `python scripts/pack-mascot-renders.py`（需要 Pillow）：全部格子用同一個裁切框，打包成 40 條 WebP。
4. 換了圖要把 `js/quiet-challenge.js` 的 `SPRITE_REV` 加一（圖片是快取優先，不換網址老師會一直看到舊圖）。
5. `node scripts/test-quiet-challenge.cjs`。

## Blender 5.3 踩雷

- 安全模式不允許 `lambda`，要寫成一般 `def`。
- Blender 介面跟著系統語言時，新材質／世界的預設節點名稱會變中文（例如不叫 `Principled BSDF`），
  用 `nodes.get('Principled BSDF')` 會找不到、整隻變灰；改用 `bl_idname` 找節點。
