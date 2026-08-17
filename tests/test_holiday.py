"""Health check for the NSE holiday API endpoint used by pivot_boss."""
import requests


def test_nse_holiday_endpoint():
    """Fetches NSE trading holidays — fails if the endpoint is unreachable."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
    }
    session = requests.Session()
    session.get("https://www.nseindia.com", headers=headers, timeout=15)

    response = session.get(
        "https://www.nseindia.com/api/holiday-master?type=trading",
        headers=headers,
        timeout=15,
    )
    assert response.status_code == 200, f"NSE holiday API returned {response.status_code}"
    data = response.json()
    # Keys typically include 'CM' (Capital Market/Equities), 'FO' (Futures & Options)
    assert isinstance(data, dict)
    assert len(data) > 0, "Holiday data dict is empty"
    print("NSE Holiday API OK — keys:", list(data.keys())[:3])


if __name__ == "__main__":
    test_nse_holiday_endpoint()
    print("All checks passed.")
