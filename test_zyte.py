import os
import requests
from dotenv import load_dotenv

# Load your API Key from the .env file
load_dotenv()
API_KEY = os.getenv("ZYTE_API_KEY")

if not API_KEY:
    print("❌ Error: ZYTE_API_KEY not found in .env file")
else:
    print(f"⏳ Testing Zyte connection with Key starting: {API_KEY[:4]}...")
    
    # We will ask Zyte to visit a simple test page (httpbin.org/ip)
    # This verifies that Zyte receives the request and sends it back.
    try:
        response = requests.post(
            "https://api.zyte.com/v1/extract",
            auth=(API_KEY, ""),
            json={
                "url": "https://httpbin.org/ip",
                "httpResponseBody": True
            }
        )

        if response.status_code == 200:
            print("✅ Zyte is working! Connection successful.")
            # Optional: Print the data Zyte found to prove it worked
            # print(response.json()) 
        else:
            print(f"❌ Zyte failed. Status Code: {response.status_code}")
            print(f"Error details: {response.text}")

    except Exception as e:
        print(f"❌ Python Error: {e}")