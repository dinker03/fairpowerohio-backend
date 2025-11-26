import os
import psycopg2
from dotenv import load_dotenv, find_dotenv

# 1. Print where Python is currently looking
print(f"📂 Current folder: {os.getcwd()}")

# 2. Try to find the .env file explicitly
env_file_path = find_dotenv()
print(f"🔎 Found .env file at: {env_file_path if env_file_path else 'NOT FOUND'}")

# 3. Load the file
load_dotenv(env_file_path)

# 4. Check if the variable exists now
db_url = os.getenv("DATABASE_URL")

if not db_url:
    print("❌ ERROR: DATABASE_URL is 'None'. The script found the file but couldn't read the variable.")
    print("👉 Check: Did you save the .env file? (Ctrl+S or Cmd+S)")
    print("👉 Check: Is the variable name exactly DATABASE_URL (no spaces around the = sign)?")
else:
    print(f"🔑 DATABASE_URL found (starts with): {db_url[:15]}...")
    
    # 5. Try connecting
    try:
        print("⏳ Attempting to connect to Neon...")
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        cur.execute("SELECT version();")
        db_version = cur.fetchone()
        print(f"✅ Success! Connected to: {db_version[0]}")
        cur.close()
        conn.close()
    except Exception as e:
        print(f"❌ Connection failed: {e}")