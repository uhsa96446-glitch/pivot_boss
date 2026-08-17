import requests

# Set headers to mimic a real browser request
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
}

# Start a session to capture required cookies
session = requests.Session()
session.get("https://www.nseindia.com", headers=headers)

# Fetch the holiday JSON data
response = session.get(
    "https://www.nseindia.com/api/holiday-master?type=trading", headers=headers
)
if response.status_code == 200:
  holiday_data = response.json()
  # Keys typically include 'CM' (Capital Market/Equities), 'FO' (Futures & Options), etc.
  print(holiday_data.keys())
else:
  print("Failed to fetch data:", response.status_code)
