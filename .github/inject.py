import os
import sys

# 解決 Windows 終端機編碼問題
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        # 舊版本 Python 相容性
        import codecs
        sys.stdout = codecs.getwriter("utf-8")(sys.stdout.detach())

def inject_secrets():
    # 定義要掃描的檔案路徑
    target_files = [
        'js/firebase-config.js',
        'index.html',
        'classnew.html'
    ]
    
    # 定義要替換的變數與其對應的環境變數名稱
    secrets_map = {
        '__FIREBASE_API_KEY__': 'VITE_FIREBASE_API_KEY',
        '__FIREBASE_AUTH_DOMAIN__': 'VITE_FIREBASE_AUTH_DOMAIN',
        '__FIREBASE_PROJECT_ID__': 'VITE_FIREBASE_PROJECT_ID',
        '__FIREBASE_STORAGE_BUCKET__': 'VITE_FIREBASE_STORAGE_BUCKET',
        '__FIREBASE_MESSAGING_SENDER_ID__': 'VITE_FIREBASE_MESSAGING_SENDER_ID',
        '__FIREBASE_APP_ID__': 'VITE_FIREBASE_APP_ID'
    }

    is_ci = os.environ.get('GITHUB_ACTIONS') == 'true'
    
    print("=" * 50)
    print(f"🚀 開始執行秘密注入流程 (環境: {'GitHub CI' if is_ci else 'Local'})")
    print("=" * 50)

    # 預檢環境變數
    missing_vars = []
    for placeholder, env_var in secrets_map.items():
        val = os.environ.get(env_var)
        if not val or not val.strip():
            missing_vars.append(env_var)
        else:
            # 遮罩顯示以確認存在但保護隠私
            masked = f"{val[:6]}...{val[-4:]}" if len(val) > 10 else "***"
            print(f"✅ 發現環境變數: {env_var} = {masked}")

    if missing_vars:
        print("\n⚠️  警告: 以下環境變數缺失或為空:")
        for v in missing_vars:
            print(f"  - {v}")
        print("這將導致對應的佔位符不會被替換。\n")

    for file_path in target_files:
        if not os.path.exists(file_path):
            print(f"ℹ️  略過不存在的檔案: {file_path}")
            continue
            
        print(f"\n📄 正在處理: {file_path}")
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception as e:
            print(f"❌ 讀取失敗: {file_path} - {str(e)}")
            continue

        original_content = content
        replaced_count = 0
        
        for placeholder, env_var in secrets_map.items():
            value = os.environ.get(env_var)
            if value and value.strip():
                if placeholder in content:
                    content = content.replace(placeholder, value)
                    replaced_count += 1
                    print(f"   ✨ 已替換 {placeholder}")
            else:
                if placeholder in content:
                    print(f"   ❌ [跳過] 變數 {env_var} 為空，無法替換 {placeholder}")

        if content != original_content:
            try:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                print(f"✅ {file_path} 注入成功 (共 {replaced_count} 處變動)")
            except Exception as e:
                print(f"❌ 寫入失敗: {file_path} - {str(e)}")
        else:
            print(f"ℹ️  {file_path} 未發現可替換的佔位符或變數皆為空。")

    print("\n" + "=" * 50)
    print("🏁 秘密注入流程結束")
    print("=" * 50)

if __name__ == "__main__":
    inject_secrets()
