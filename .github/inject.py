import os
import re

def inject_secrets():
    # 定義要掃描的檔案路徑
    target_files = [
        'js/firebase-config.js',
        'index.html',
        'classnew.html'
    ]
    
    # 定義要替換的變數與其對應的環境變數名稱
    secrets = {
        '__FIREBASE_API_KEY__': 'VITE_FIREBASE_API_KEY',
        '__FIREBASE_AUTH_DOMAIN__': 'VITE_FIREBASE_AUTH_DOMAIN',
        '__FIREBASE_PROJECT_ID__': 'VITE_FIREBASE_PROJECT_ID',
        '__FIREBASE_STORAGE_BUCKET__': 'VITE_FIREBASE_STORAGE_BUCKET',
        '__FIREBASE_MESSAGING_SENDER_ID__': 'VITE_FIREBASE_MESSAGING_SENDER_ID',
        '__FIREBASE_APP_ID__': 'VITE_FIREBASE_APP_ID'
    }

    for file_path in target_files:
        if not os.path.exists(file_path):
            continue
            
        print(f"💉 正在向 {file_path} 注入秘密...")
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        original_content = content
        for placeholder, env_var in secrets.items():
            value = os.environ.get(env_var)
            if value:
                content = content.replace(placeholder, value)
            else:
                print(f"⚠️ 警告: 找不到環境變數 {env_var}")

        if content != original_content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"✅ {file_path} 注入成功。")
        else:
            print(f"ℹ️ {file_path} 未發現佔位符，略過。")

if __name__ == "__main__":
    inject_secrets()
