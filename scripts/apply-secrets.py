import os
import subprocess
import sys

# 解決 Windows 終端機編碼問題
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

def apply_local_secrets():
    env_path = '.env'
    if not os.path.exists(env_path):
        print(f"[Error] 錯誤: 找不到 {env_path} 檔案。")
        return

    print("[Key] 正在讀取 .env 變數...")
    env_vars = {}
    with open(env_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if '=' in line:
                key, value = line.split('=', 1)
                # 移除引號
                value = value.strip('"').strip("'")
                env_vars[key.strip()] = value

    # 設定環境變數並執行 inject.py
    os.environ.update(env_vars)
    
    print("[Inject] 執行注入腳本...")
    try:
        # 確保在根目錄執行
        result = subprocess.run(['python', '.github/inject.py'], capture_output=True, text=True)
        print(result.stdout)
        if result.stderr:
            print(f"[Warning] 錯誤輸出: {result.stderr}")
        print("[Success] 本地金鑰注入完成。請記得在 Commit 前還原。")
    except Exception as e:
        print(f"[Error] 執行失敗: {e}")

if __name__ == "__main__":
    apply_local_secrets()
