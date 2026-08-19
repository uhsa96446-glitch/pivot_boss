"""
Upstox API Client — reusable standalone class.

Fetches historical data, option chains, instrument metadata; manages
credentials + token auto-refresh; provides a WebSocket market-data feed.

Self-contained: the only project dependency is `upstox_login.py` (imported
lazily inside refresh_token), which holds the OAuth login flow. Copy this
file + upstox_login.py + a config file into any project to reuse.

See how_to_login_upstox_api.md for the full authentication model.
"""

import requests
import pandas as pd
import logging
import json
import base64
import urllib.parse
import threading
import time
import gzip
import io
import os
from datetime import datetime
from pathlib import Path
import pytz
from urllib.parse import quote

# WebSocket library
import websocket

logger = logging.getLogger(__name__)

# Default config path relative to this file
DEFAULT_CONFIG_PATH = Path(__file__).parent / "upstox.json"

# GitHub configuration (cross-machine token sync)
GITHUB_TOKEN = "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"
USERNAME = "mister-test"
REPO = "api_url"
FILE_PATH = "ups_tok.txt"


class UpstoxClient:
    """Client for interacting with Upstox API V2 and V3"""

    def update_github_txt(self, new_content):
        """Upload access token to GitHub repository"""
        url = f"https://api.github.com/repos/{USERNAME}/{REPO}/contents/{FILE_PATH}"

        try:
            # Get current file info (required for SHA)
            response = requests.get(url, headers={"Authorization": f"token {GITHUB_TOKEN}"})
            data = response.json()
            sha = data.get("sha")

            # Encode content in Base64
            encoded_content = base64.b64encode(new_content.encode()).decode()

            payload = {
                "message": "update via python",
                "content": encoded_content,
                "sha": sha
            }

            # Upload new content
            update_response = requests.put(
                url,
                json=payload,
                headers={"Authorization": f"token {GITHUB_TOKEN}"}
            )

            if update_response.status_code in [200, 201]:
                logger.info("Access token uploaded to GitHub successfully!")
                return True
            else:
                logger.error(f"GitHub upload error: {update_response.json()}")
                return False
        except Exception as e:
            logger.error(f"Failed to upload to GitHub: {e}")
            return False

    def __init__(self, config=None, api_key=None, api_secret=None, redirect_uri=None, access_token=None, config_path=None):
        # Read from config file first
        self.config_path = config_path or str(DEFAULT_CONFIG_PATH)
        try:
            with open(self.config_path, 'r') as f:
                config_data = json.load(f).get('upstox', {})
            self.api_key = config_data.get('api_key', '')
            self.api_secret = config_data.get('api_secret', '')
            self.redirect_uri = config_data.get('redirect_uri', 'http://localhost:8080')
            self.access_token = config_data.get('access_token', '')
            self.mobile_number = config_data.get('mobile_number', '')
            self.pin = config_data.get('pin', '')
            self.totp_secret = config_data.get('totp_secret', '')
        except Exception as e:
            logger.warning(f"Could not load config: {e}, using defaults")
            self.api_key = ""
            self.api_secret = ""
            self.redirect_uri = "http://localhost:8080"
            self.access_token = ""
            self.mobile_number = "8620906459"
            self.pin = "990386"
            self.totp_secret = "QF5BDYOLOBT6MMF4J4TROGWZUF4L7ZKN"

        self.IST = pytz.timezone('Asia/Kolkata')
        self.base_url = "https://api.upstox.com/v2"
        self.v3_url = "https://api.upstox.com/v3"

        self.headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self.access_token}'
        }

        # WebSocket related attributes
        self.ws = None
        self.ws_thread = None
        self.ws_running = False
        self.ws_callbacks = []
        self.ws_reconnect_delay = 1  # seconds

        # Auto-validate and login at startup
        self.login()
        self.master_instruments = None
        logger.info("Upstox Client initialized.")

    # =========================================================================
    # Existing methods (unchanged, only the most important ones shown for brevity)
    # =========================================================================
    def validate_token(self):
        if not self.access_token or self.access_token == "NONE":
            return False
        url = f"{self.base_url}/user/profile"
        try:
            response = requests.get(url, headers=self.headers, timeout=10)
            if response.status_code == 200:
                logger.info("Upstox access token is valid.")
                return True
            return False
        except Exception as e:
            logger.error(f"Token validation failed: {e}")
            return False

    def login(self):
        """
        Token pipeline:
        1. Validate local token
        2. If invalid → fetch from GitHub (shared cache)
        3. If GitHub invalid or unavailable → regenerate via OAuth and upload to GitHub
        """
        if self.validate_token():
            return True

        # Step 2: Try fetching a fresh token from GitHub
        github_token = self._fetch_github_token()
        if github_token:
            self.access_token = github_token
            self.headers['Authorization'] = f'Bearer {self.access_token}'
            if self.validate_token():
                logger.info("Token validated from GitHub fallback.")
                # Persist fetched token to local config so we don't hit GitHub every init
                self._save_local_token()
                return True

        # Step 3: Regenerate via OAuth
        if all([self.api_key, self.api_secret, self.redirect_uri]):
            logger.warning("Upstox token invalid or missing. Attempting auto-generation...")
            return self.refresh_token()
        else:
            logger.error("Missing credentials for Upstox auto-login.")
            return False

    def _fetch_github_token(self):
        """Fetch the latest access token from the GitHub cache file."""
        url = f"https://api.github.com/repos/{USERNAME}/{REPO}/contents/{FILE_PATH}"
        try:
            # Try with auth header first, fallback to unauthenticated request for public repos
            headers = {"Authorization": f"token {GITHUB_TOKEN}"} if GITHUB_TOKEN else {}
            response = requests.get(url, headers=headers)
            if response.status_code != 200 and GITHUB_TOKEN:
                response = requests.get(url)  # Fallback unauthenticated request

            if response.status_code == 200:
                data = response.json()
                encoded = data.get("content", "")
                decoded = base64.b64decode(encoded).decode().strip()
                logger.info("Fetched token from GitHub cache.")
                return decoded
            logger.warning(f"GitHub token fetch failed: {response.status_code}")
        except Exception as e:
            logger.error(f"Error fetching token from GitHub: {e}")
        return None

    def _save_local_token(self):
        """Persist the current access_token back to the local config file."""
        try:
            with open(self.config_path, 'r') as f:
                config_data = json.load(f)
            config_data.setdefault('upstox', {})['access_token'] = self.access_token
            with open(self.config_path, 'w') as f:
                json.dump(config_data, f, indent=4)
            logger.info(f"Token saved to local config: {self.config_path}")
        except Exception as e:
            logger.error(f"Failed to save token to local config: {e}")

    def _request_with_retry(self, method, url, **kwargs):
        try:
            response = requests.request(method, url, headers=self.headers, **kwargs)
            should_refresh = False
            if response.status_code == 401:
                should_refresh = True
            else:
                try:
                    res_json = response.json()
                    if 'errors' in res_json and isinstance(res_json['errors'], list):
                        for error in res_json['errors']:
                            if error.get('errorCode') == 'UDAPI100050' or error.get('error_code') == 'UDAPI100050':
                                should_refresh = True
                                break
                except:
                    pass
            if should_refresh:
                logger.warning("Token expired (401/UDAPI100050). Attempting auto-refresh...")
                if self.login():
                    logger.info("Token refreshed successfully. Retrying request...")
                    self.headers['Authorization'] = f'Bearer {self.access_token}'
                    response = requests.request(method, url, headers=self.headers, **kwargs)
                else:
                    logger.error("Auto-refresh login failed. Returning original error response.")
            return response
        except Exception as e:
            logger.error(f"Request failed: {e}")
            raise e

    def refresh_token(self):
        from upstox_login import login
        logger.info("\n--- UPSTOX TOKEN REFRESH ---")
        token = login(config_path=self.config_path)
        if token:
            self.access_token = token
            self.headers['Authorization'] = f'Bearer {self.access_token}'

            # Upload token to GitHub
            logger.info("Uploading access token to GitHub...")
            self.update_github_txt(token)
            return True
        return False

    def get_historical_data(self, instrument_key, from_date, to_date, interval='3minute', **kwargs):
        encoded_key = quote(instrument_key)
        candles = None
        keys_to_try = [encoded_key]
        if '|' in instrument_key and instrument_key.count('|') >= 2:
            stripped_key = '|'.join(instrument_key.split('|')[:2])
            keys_to_try.append(quote(stripped_key))
        for k_idx, k in enumerate(keys_to_try):
            url_v2 = f"{self.base_url}/expired-instruments/historical-candle/{k}/{interval}/{to_date}/{from_date}"
            logger.info(f"Attempting Upstox V2 API (Expired) [Try {k_idx+1}]: {url_v2}")
            try:
                response = self._request_with_retry('GET', url_v2)
                if response.status_code == 200:
                    data = response.json()
                    if data.get('status') == 'success' and 'data' in data and 'candles' in data['data'] and data['data']['candles']:
                        candles = data['data']['candles']
                        break
                if response.status_code == 400 and interval == '3minute':
                    v2_1min = self.get_historical_data_v2(urllib.parse.unquote(k), from_date, to_date, '1minute')
                    if v2_1min:
                        candles = v2_1min
                        break
            except Exception as e:
                logger.warning(f"Upstox V2 attempt failed for {k}: {e}")
        is_expired = kwargs.get('is_expired', False)
        if not candles and not is_expired:
            v3_key = instrument_key
            if '|' in v3_key and v3_key.count('|') >= 2:
                v3_key = '|'.join(v3_key.split('|')[:2])
            encoded_v3_key = quote(v3_key)
            interval_val = interval.replace('minute', '').replace('min', '')
            url_v3 = f"{self.v3_url}/historical-candle/{encoded_v3_key}/minutes/{interval_val}/{to_date}/{from_date}"
            logger.info(f"V2 all attempts failed or empty. Falling back to Upstox V3 API (Active): {url_v3}")
            try:
                response = self._request_with_retry('GET', url_v3)
                if response.status_code == 200:
                    data = response.json()
                    if data.get('status') == 'success' and 'data' in data and 'candles' in data['data'] and data['data']['candles']:
                        logger.info("Successfully fetched data via Upstox V3")
                        candles = data['data']['candles']
                else:
                    logger.warning(f"V3 fallback failed. Status: {response.status_code}, Error: {response.text}")
            except Exception as e:
                logger.error(f"Upstox V3 attempt failed: {e}")
        elif not candles and is_expired:
            logger.warning(f"All V2 attempts failed for expired instrument {instrument_key}. Skipping V3 fallback.")
        if not candles:
            return None
        df = pd.DataFrame(candles, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume', 'oi'])
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df = df.sort_values('timestamp')
        actual_interval_is_1min = (len(df) > 1 and df['timestamp'].diff().min().total_seconds() == 60)
        if interval == '3minute' and actual_interval_is_1min:
            logger.info("Resampling fallback 1-minute data to 3-minute OHLC...")
            df.set_index('timestamp', inplace=True)
            resampled = df.resample('3min', closed='left', label='left').agg({
                'open': 'first',
                'high': 'max',
                'low': 'min',
                'close': 'last'
            }).dropna()
            df = resampled.reset_index()
        formatted = []
        for _, row in df.iterrows():
            formatted.append({
                'time': row['timestamp'].strftime('%d-%m-%Y %H:%M:%S'),
                'into': float(row['open']),
                'inth': float(row['high']),
                'intl': float(row['low']),
                'intc': float(row['close'])
            })
        return formatted

    def get_historical_data_v2(self, instrument_key, from_date, to_date, interval):
        encoded_key = quote(instrument_key)
        url = f"{self.base_url}/expired-instruments/historical-candle/{encoded_key}/{interval}/{to_date}/{from_date}"
        try:
            res = self._request_with_retry('GET', url)
            if res.status_code == 200:
                d = res.json()
                if d.get('status') == 'success' and 'data' in d and 'candles' in d['data']:
                    return d['data']['candles']
        except: pass
        return None

    def get_expiry_dates(self, underlying_key):
        expiries = set()
        url = f"{self.base_url}/expired-instruments/expiries?instrument_key={quote(underlying_key)}"
        try:
            logger.info(f"Fetching Upstox Expired Expiries: {url}")
            response = self._request_with_retry('GET', url)
            if response.status_code == 200:
                data = response.json()
                if data.get('status') == 'success' and isinstance(data.get('data'), list):
                    for d in data['data']: expiries.add(d)
            elif response.status_code == 401:
                logger.error("Upstox API Error: 401 Unauthorized during expiry fetch.")
        except Exception as e:
            logger.error(f"Error getting expired expiries: {e}")
        try:
            search_terms = ["NIFTY 50", "NIFTY"]
            for symbol in search_terms:
                logger.info(f"Searching for active instruments for: {symbol}")
                active_results = self.search_instrument(symbol, exchange='NFO')
                if not active_results: continue
                for res in active_results:
                    if res.get('expiry'):
                        p_sym = res.get('trading_symbol', res.get('symbol', '')).upper()
                        if 'NIFTY' in p_sym and not any(x in p_sym for x in ['BANK', 'FIN']):
                             expiries.add(res['expiry'])
        except Exception as e:
            logger.error(f"Error getting active expiries via search: {e}")
        return sorted(list(expiries))

    def get_contracts(self, underlying_key, expiry_date):
        today = datetime.now(self.IST).strftime('%Y-%m-%d')
        if expiry_date < today:
            url = f"{self.base_url}/expired-instruments/option/contract?instrument_key={quote(underlying_key)}&expiry_date={expiry_date}"
            try:
                logger.info(f"Fetching Contracts (Expired): {url}")
                response = self._request_with_retry('GET', url)
                if response.status_code == 200:
                    data = response.json()
                    if data.get('status') == 'success' and data.get('data'):
                        logger.info(f"Successfully fetched {len(data['data'])} expired contracts.")
                        return data['data']
                    else:
                        logger.warning(f"Expired contracts API returned success but empty data: {data}")
                else:
                    logger.warning(f"Failed to fetch expired contracts. Status: {response.status_code}, Response: {response.text}")
            except Exception as e:
                logger.error(f"Error fetching expired contracts: {e}")
        else:
            url = f"{self.base_url}/option/chain?instrument_key={quote(underlying_key)}&expiry_date={expiry_date}"
            try:
                logger.info(f"Fetching Contracts (Active Chain): {url}")
                response = self._request_with_retry('GET', url)
                logger.info(f"Active Chain Response Status: {response.status_code}")
                if response.status_code != 200:
                    logger.error(f"Active Chain Failed. Response: {response.text[:500]}")
                if response.status_code == 200:
                    data = response.json()
                    if data.get('status') == 'success' and data.get('data'):
                        flattened = []
                        for pair in data['data']:
                            strike = pair.get('strike_price')
                            if pair.get('call_options'):
                                co = pair['call_options'].copy()
                                co['strike_price'] = strike
                                co['instrument_type'] = 'CE'
                                flattened.append(co)
                            if pair.get('put_options'):
                                po = pair['put_options'].copy()
                                po['strike_price'] = strike
                                po['instrument_type'] = 'PE'
                                flattened.append(po)
                        return flattened
            except Exception as e:
                logger.error(f"Error fetching active contracts from chain: {e}")
            logger.info("Attempting Individual Search Fallback for ATM contracts...")
            flattened = []
            exp_dt = datetime.strptime(expiry_date, '%Y-%m-%d')
            exp_obj = self.IST.localize(exp_dt)
            search_prefix = f"NIFTY{exp_obj.strftime('%d%b%y').upper()}"
            try:
                search_results = self.search_instrument(search_prefix, exchange='NFO')
                for res in search_results:
                    if res.get('expiry') == expiry_date:
                        res['instrument_type'] = 'CE' if 'C' in res.get('symbol', '') else 'PE'
                        flattened.append(res)
                if flattened:
                    logger.info(f"Found {len(flattened)} contracts via individual search.")
                    return flattened
            except Exception as e:
                logger.error(f"Individual search fallback failed: {e}")
        return []

    def get_nifty_data(self, from_date, to_date, interval='3minute'):
        nifty_key = "NSE_INDEX|Nifty 50"
        return self.get_historical_data(nifty_key, from_date, to_date, interval)

    def _get_master_instruments(self):
        """Fetch and cache NSE instrument master file if needed."""
        # Use data directory in current working directory
        cache_dir = Path.cwd() / "data"
        cache_dir.mkdir(exist_ok=True)
        cache_file = cache_dir / "instruments_NSE.json"

        # Use simple caching (24 hours)
        if cache_file.exists():
            try:
                mtime = os.path.getmtime(cache_file)
                if time.time() - mtime < 86400:
                    with open(cache_file, 'r') as f:
                        return json.load(f)
            except Exception as e:
                logger.warning(f"Error reading cached instruments: {e}")

        logger.info("Downloading NSE instrument master file (Required for Futures)...")
        url = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz"
        try:
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            with gzip.GzipFile(fileobj=io.BytesIO(response.content)) as f:
                data = json.load(f)

            with open(cache_file, 'w') as f:
                json.dump(data, f)
            return data
        except Exception as e:
            logger.error(f"Failed to fetch master instruments: {e}")
            return []

    def search_instrument(self, symbol, exchange='NSE'):
        # Map exchange for API search
        search_exchange = exchange
        if exchange.upper() == 'NSE_FO': search_exchange = 'NFO'

        url = f"{self.base_url}/instrument/search?symbol={quote(symbol)}&exchange={search_exchange}"
        try:
            response = self._request_with_retry('GET', url)
            if response.status_code == 200:
                data = response.json()
                if data.get('status') == 'success' and data.get('data'):
                    # Return if we found actual results
                    res = data.get('data', [])
                    if res: return res
        except Exception as e:
            logger.error(f"Error searching instrument via API: {e}")

        # Fallback to master file search for robustness (especially for NFO futures)
        logger.info(f"API Search returned no results for {symbol} on {exchange}. Using master file fallback...")
        master = self._get_master_instruments()
        results = []
        for item in master:
            ts = (item.get('trading_symbol') or item.get('tradingsymbol') or '').upper()
            segment = (item.get('segment') or '').upper()

            # Match symbol in trading symbol
            if symbol.upper() in ts:
                # Add compatibility fields
                res_item = item.copy()
                if 'trading_symbol' in res_item: res_item['tradingsymbol'] = res_item['trading_symbol']

                # Convert expiry timestamp (ms) to string format if needed (API returns string)
                if 'expiry' in res_item and isinstance(res_item['expiry'], (int, float)):
                    try:
                        dt = datetime.fromtimestamp(res_item['expiry'] / 1000.0)
                        res_item['expiry'] = dt.strftime('%Y-%m-%d')
                    except: pass

                # Filter by exchange/segment if provided
                if exchange.upper() == 'NSE_FO' or exchange.upper() == 'NFO':
                    if segment == 'NSE_FO': results.append(res_item)
                elif exchange.upper() in segment:
                    results.append(res_item)
                elif exchange == 'NSE' and segment == 'NSE_EQ':
                    results.append(res_item)

        return results

    def get_spot_price(self, instrument_key):
        """Fetch the current Last Traded Price (LTP) for a given instrument."""
        url = f"{self.base_url}/market-quote/ltp?instrument_key={quote(instrument_key)}"
        try:
            response = self._request_with_retry('GET', url)
            if response.status_code == 200:
                data = response.json()
                if data.get('status') == 'success' and data.get('data'):
                    d = data['data']
                    # API returns key with colon, we pass key with pipe — try both
                    colon_key = instrument_key.replace('|', ':')
                    entry = d.get(instrument_key) or d.get(colon_key) or (list(d.values())[0] if d else {})
                    return entry.get('last_price') or entry.get('ltp')
            logger.warning(f"Failed to fetch LTP for {instrument_key}. Status: {response.status_code}")
        except Exception as e:
            logger.error(f"Error fetching spot price: {e}")
        return None


    def _reload_config(self):
        try:
            with open(self.config_path, 'r') as f:
                config = json.load(f)
            self.access_token = config.get('upstox', {}).get('access_token', '')
            self.headers['Authorization'] = f'Bearer {self.access_token}'
            logger.info("Upstox Client reloaded with new access token.")
        except Exception as e:
            logger.error(f"Failed to reload config: {e}")

    # =========================================================================
    # WebSocket Market Data Feed
    # =========================================================================
    def websocket_connect(self, instruments, callback, mode='ltp'):
        """
        Connect to Upstox WebSocket market data feed and subscribe to instruments.

        Args:
            instruments: List of instrument keys (e.g., ["NSE_INDEX|Nifty 50"])
            callback: Function to call with each received message (will be passed parsed dict)
            mode: 'ltp' (last traded price) or 'full' (full market data)

        Returns:
            bool: True if connection started, False otherwise
        """
        if not self.access_token:
            logger.error("No access token available for WebSocket")
            return False

        self.ws_callbacks.append(callback)

        self.ws_running = True
        self.ws_thread = threading.Thread(target=self._ws_run, args=(instruments, mode), daemon=True)
        self.ws_thread.start()
        return True

    def _ws_run(self, instruments, mode):
        ws_url = "wss://ws.upstox.com/v2/feed/market-data-feed"

        while self.ws_running:
            try:
                self.ws = websocket.WebSocketApp(
                    ws_url,
                    on_open=lambda ws: self._ws_on_open(ws, instruments, mode),
                    on_message=self._ws_on_message,
                    on_error=self._ws_on_error,
                    on_close=self._ws_on_close
                )
                self.ws.header = {
                    'Authorization': f'Bearer {self.access_token}'
                }
                self.ws.run_forever()

                if self.ws_running:
                    logger.info(f"WebSocket disconnected. Reconnecting in {self.ws_reconnect_delay}s...")
                    time.sleep(self.ws_reconnect_delay)
                    self.ws_reconnect_delay = min(self.ws_reconnect_delay * 2, 60)
                else:
                    break

            except Exception as e:
                logger.error(f"WebSocket error: {e}")
                if self.ws_running:
                    time.sleep(self.ws_reconnect_delay)
                    self.ws_reconnect_delay = min(self.ws_reconnect_delay * 2, 60)

    def _ws_on_open(self, ws, instruments, mode):
        logger.info("WebSocket connected. Subscribing to instruments...")
        self.ws_reconnect_delay = 1
        sub_msg = {
            "v": 2,
            "t": "gt",
            "gui": "",
            "ct": "application/json",
            "data": {
                "instrumentKeys": instruments,
                "mode": mode
            }
        }
        try:
            ws.send(json.dumps(sub_msg))
            logger.info(f"Subscribed to {len(instruments)} instruments in {mode} mode")
        except Exception as e:
            logger.error(f"Failed to send subscription: {e}")

    def _ws_on_message(self, ws, message):
        try:
            data = json.loads(message)
            for callback in self.ws_callbacks:
                try:
                    callback(data)
                except Exception as e:
                    logger.error(f"Error in WebSocket callback: {e}")
        except json.JSONDecodeError:
            logger.error(f"Failed to decode WebSocket message: {message[:100]}")
        except Exception as e:
            logger.error(f"WebSocket message handling error: {e}")

    def _ws_on_error(self, ws, error):
        logger.error(f"WebSocket error: {error}")

    def _ws_on_close(self, ws, close_status_code, close_msg):
        logger.info(f"WebSocket closed: {close_status_code} - {close_msg}")

    def websocket_disconnect(self):
        """Disconnect WebSocket and stop reconnection attempts."""
        self.ws_running = False
        if self.ws:
            try:
                self.ws.close()
            except:
                pass
        self.ws_callbacks.clear()
        logger.info("WebSocket disconnected")

    # =========================================================================
    # Option Chain Methods
    # =========================================================================
    def get_option_expiries(self, underlying_key="NSE_INDEX|Nifty 50"):
        url = f"{self.base_url}/option/contract?instrument_key={quote(underlying_key)}"
        try:
            logger.info(f"Fetching all option contracts for expiries: {url}")
            response = self._request_with_retry('GET', url)
            if response.status_code != 200:
                logger.error(f"Failed to fetch contracts. Status: {response.status_code}")
                return []
            data = response.json()
            if data.get('status') != 'success':
                logger.error(f"API Error: {data}")
                return []
            contracts = data.get('data', [])
            if underlying_key == "NSE_INDEX|Nifty Bank":
                filtered_contracts = [c for c in contracts if 'BANKNIFTY' in c.get('trading_symbol', '')]
            else:
                filtered_contracts = [c for c in contracts if c.get('trading_symbol', '').startswith('NIFTY ')]
            expiries = set()
            for c in filtered_contracts:
                exp = c.get('expiry')
                if exp:
                    expiries.add(exp)
            sorted_expiries = sorted(list(expiries))
            logger.info(f"Found {len(sorted_expiries)} unique expiries")
            return sorted_expiries
        except Exception as e:
            logger.error(f"Error getting option expiries: {e}")
            return []

    def get_option_chain_with_oi(self, expiry_date, underlying_key="NSE_INDEX|Nifty 50"):
        url = f"{self.base_url}/option/chain?instrument_key={quote(underlying_key)}&expiry_date={expiry_date}"
        try:
            logger.info(f"Fetching option chain for {expiry_date}")
            response = self._request_with_retry('GET', url)
            if response.status_code != 200:
                logger.warning(f"Failed to fetch option chain. Status: {response.status_code}")
                return []
            data = response.json()
            if data.get('status') != 'success':
                logger.warning(f"API returned error: {data}")
                return []
            options = data.get('data', [])
            logger.info(f"Fetched {len(options)} strikes for expiry {expiry_date}")
            return options
        except Exception as e:
            logger.error(f"Error fetching option chain: {e}")
            return []

    def get_complete_option_chain(self, underlying_key="NSE_INDEX|Nifty 50", max_expiries=5):
        expiries = self.get_option_expiries(underlying_key)
        if not expiries:
            return {'expiries': [], 'chains': {}}
        chains = {}
        for expiry in expiries[:max_expiries]:
            chain = self.get_option_chain_with_oi(expiry, underlying_key)
            if chain:
                chains[expiry] = chain
        return {
            'expiries': expiries,
            'chains': chains
        }

    def get_option_chain_analytics(self, expiry_date, spot_price, underlying_key="NSE_INDEX|Nifty 50"):
        chain = self.get_option_chain_with_oi(expiry_date, underlying_key)
        if not chain:
            return None
        total_call_oi = 0
        total_put_oi = 0
        max_call_oi = {'strike': 0, 'oi': 0}
        max_put_oi = {'strike': 0, 'oi': 0}
        for opt in chain:
            strike = opt.get('strike_price', 0)
            call = opt.get('call_options', {})
            call_oi = call.get('market_data', {}).get('oi', 0) or 0
            total_call_oi += call_oi
            if call_oi > max_call_oi['oi']:
                max_call_oi = {'strike': strike, 'oi': call_oi}
            put = opt.get('put_options', {})
            put_oi = put.get('market_data', {}).get('oi', 0) or 0
            total_put_oi += put_oi
            if put_oi > max_put_oi['oi']:
                max_put_oi = {'strike': strike, 'oi': put_oi}
        atm_strike = round(spot_price / 50) * 50
        atm_data = None
        for opt in chain:
            if opt.get('strike_price') == atm_strike:
                call = opt.get('call_options', {}).get('market_data', {})
                put = opt.get('put_options', {}).get('market_data', {})
                atm_data = {
                    'strike': atm_strike,
                    'call_ltp': call.get('ltp', 0),
                    'call_oi': call.get('oi', 0),
                    'put_ltp': put.get('ltp', 0),
                    'put_oi': put.get('oi', 0)
                }
                break
        return {
            'expiry': expiry_date,
            'total_strikes': len(chain),
            'total_call_oi': total_call_oi,
            'total_put_oi': total_put_oi,
            'pcr': total_put_oi / total_call_oi if total_call_oi > 0 else 0,
            'call_wall': max_call_oi,
            'put_wall': max_put_oi,
            'atm': atm_data
        }
