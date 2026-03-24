import os
import sys

# 解決 Windows 終端機編碼問題
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

def restore_placeholders():
    target_files = [
        'js/firebase-config.js',
        'index.html',
        'classnew.html'
    ]
    
    # 定義要還原的變數名稱與其佔位符
    # 這裡我們不使用正則，而是直接掃描常見的 API Key 格式或從 .env 反向替換
    # 但最保險的方法是使用 git checkout，或者直接定義佔位符清單。
    
    placeholders = {
        '__FIREBASE_API_KEY__': 'VITE_FIREBASE_API_KEY',
        '__FIREBASE_AUTH_DOMAIN__': 'VITE_FIREBASE_AUTH_DOMAIN',
        '__FIREBASE_PROJECT_ID__': 'VITE_FIREBASE_PROJECT_ID',
        '__FIREBASE_STORAGE_BUCKET__': 'VITE_FIREBASE_STORAGE_BUCKET',
        '__FIREBASE_MESSAGING_SENDER_ID__': 'VITE_FIREBASE_MESSAGING_SENDER_ID',
        '__FIREBASE_APP_ID__': 'VITE_FIREBASE_APP_ID'
    }

    # 讀取 .env 取得真實值，以便反向替換
    env_path = '.env'
    real_values = {}
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if '=' in line:
                    key, value = line.split('=', 1)
                    real_values[key.strip()] = value.strip('"').strip("'")

    for file_path in target_files:
        if not os.path.exists(file_path):
            continue
            
        print(f"[Clean] 正在還原 {file_path} 為佔位符...")
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        changed = False
        for placeholder, env_var in placeholders.items():
            real_val = real_values.get(env_var)
            if real_val and real_val in content:
                content = content.replace(real_val, placeholder)
                changed = True

        if changed:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"[Success] {file_path} 還原成功。")
        else:
            print(f"[Info] {file_path} 未發現可替換的真實值。")

if __name__ == "__main__":
    restore_placeholders()
