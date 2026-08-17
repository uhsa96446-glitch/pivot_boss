#!/usr/bin/env python3
"""
Upstox Login Module — reusable OAuth authentication for any project.

Obtains an Upstox access token via the automated service login flow
(OTP -> TOTP -> PIN -> OAuth authorize) and falls back to manual browser
auth if automation fails or credentials are missing. Writes the new token
back into the config file on success.

Usage:
    from upstox_login import login
    token = login()                                   # reads upstox.json (module dir)
    token = login(config_path="path/to/upstox.json")  # explicit config
    token = login(mobile_number="...", pin="...",
                  totp_secret="...")                  # override config creds

Returns the access token string, or None on failure.
"""

import base64
import json
import logging
import random
import string
import urllib.parse
from pathlib import Path

import pyotp
import requests

logger = logging.getLogger(__name__)

# Default config path relative to this file
DEFAULT_CONFIG_PATH = Path(__file__).parent / "upstox.json"


def load_config(config_path=DEFAULT_CONFIG_PATH):
    """Read Upstox credentials from a config file (JSON under 'upstox' key)."""
    try:
        with open(config_path, 'r') as f:
            data = json.load(f).get('upstox', {})
        return {
            'api_key': data.get('api_key', ''),
            'api_secret': data.get('api_secret', ''),
            'redirect_uri': data.get('redirect_uri', 'http://localhost:8080'),
            'mobile_number': data.get('mobile_number', ''),
            'pin': data.get('pin', ''),
            'totp_secret': data.get('totp_secret', ''),
        }
    except Exception as e:
        logger.warning(f"Could not load config from {config_path}: {e}")
        return {}


def _auto_login(creds):
    """Automated service login (OTP -> TOTP -> PIN -> OAuth). Returns auth code or None."""
    auth_url = f"https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id={creds['api_key']}&redirect_uri={creds['redirect_uri']}"
    logger.info("Attempting automated login (Service Flow)...")
    try:
        session = requests.Session()
        request_id = "WPRO-" + "".join(random.choices(string.ascii_letters + string.digits, k=10))
        headers = {
            "accept": "application/json, text/plain, */*",
            "accept-language": "en-US,en;q=0.9",
            "content-type": "application/json",
            "x-request-id": request_id,
            "x-device-details": "platform=WEB|osName=Windows/10|osVersion=Chrome/120.0.0.0|appVersion=4.0.0|modelName=Chrome|manufacturer=Google|uuid=fixed_uuid_12345",
            "origin": "https://login.upstox.com",
            "referer": "https://login.upstox.com/",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        }
        session.headers.update(headers)
        res = session.get(auth_url, allow_redirects=True)
        if 'login.upstox.com' not in res.url:
            logger.error(f"Failed to reach login page. Current URL: {res.url}")
            return None

        parsed_init = urllib.parse.urlparse(res.url)
        params_init = urllib.parse.parse_qs(parsed_init.query)
        user_id = params_init.get('user_id', [None])[0]
        login_client_id = params_init.get('client_id', [None])[0]
        user_type = params_init.get('user_type', [None])[0]
        if not all([user_id, login_client_id, user_type]):
            logger.error(f"Login page params missing: {params_init}")
            return None

        otp_url = "https://service.upstox.com/login/open/v6/auth/1fa/otp/generate"
        otp_payload = {"data": {"mobileNumber": creds['mobile_number'], "userId": user_id}}
        res = session.post(otp_url, json=otp_payload)
        if res.status_code != 200:
            logger.error(f"OTP generation failed: {res.status_code} - {res.text}")
            return None
        validate_otp_token = res.json().get('data', {}).get('validateOTPToken')
        if not validate_otp_token:
            logger.error(f"validateOTPToken not found: {res.text}")
            return None

        totp_val = pyotp.TOTP(creds['totp_secret']).now()
        verify_url = "https://service.upstox.com/login/open/v4/auth/1fa/otp-totp/verify"
        verify_payload = {"data": {"otp": totp_val, "validateOtpToken": validate_otp_token}}
        res = session.post(verify_url, json=verify_payload)
        if res.status_code != 200:
            logger.error(f"TOTP verification failed: {res.status_code} - {res.text}")
            return None

        pin_encoded = base64.b64encode(str(creds['pin']).encode()).decode()
        pin_url = "https://service.upstox.com/login/open/v3/auth/2fa"
        internal_redirect = "https://api-v2.upstox.com/login/authorization/redirect"
        pin_params = {"client_id": login_client_id, "redirect_uri": internal_redirect}
        pin_payload = {"data": {"twoFAMethod": "SECRET_PIN", "inputText": pin_encoded}}
        res = session.post(pin_url, params=pin_params, json=pin_payload)
        if res.status_code != 200:
            logger.error(f"PIN submission failed: {res.status_code} - {res.text}")
            return None

        auth_final_url = "https://service.upstox.com/login/v2/oauth/authorize"
        auth_final_params = {
            "client_id": login_client_id,
            "redirect_uri": internal_redirect,
            "requestId": request_id,
            "response_type": "code"
        }
        auth_final_payload = {"data": {"userOAuthApproval": True}}
        res = session.post(auth_final_url, params=auth_final_params, json=auth_final_payload)
        if res.status_code != 200:
            logger.error(f"OAuth finalization failed: {res.status_code} - {res.text}")
            return None

        redirect_uri_final = res.json().get('data', {}).get('redirectUri')
        if not redirect_uri_final:
            logger.error(f"Redirect URI not found in final response: {res.text}")
            return None
        parsed_final = urllib.parse.urlparse(redirect_uri_final)
        auth_code = urllib.parse.parse_qs(parsed_final.query).get('code', [None])[0]
        if auth_code:
            logger.info("\033[92mAutomated login successful!\033[0m")
        else:
            logger.error(f"Code not found in final redirect: {redirect_uri_final}")
        return auth_code
    except Exception as e:
        logger.error(f"Automation failed: {e}")
        return None


def _manual_login(creds):
    """Manual browser fallback. Returns auth code or None."""
    auth_url = f"https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id={creds['api_key']}&redirect_uri={creds['redirect_uri']}"
    logger.info("\nAutomated login failed or credentials missing. Falling back to manual.")
    logger.info("1. Open this URL in your browser and log in:")
    logger.info(f"\033[94m{auth_url}\033[0m")
    try:
        code = input("Paste the 'code' parameter from the URL here: ").strip()
    except EOFError:
        logger.error("No TTY available for manual login — set manual_fallback=False or provide credentials.")
        return None
    return code or None


def _exchange_code(creds, code):
    """Exchange the authorization code for an access token. Returns token or None."""
    url = 'https://api.upstox.com/v2/login/authorization/token'
    headers = {'accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded'}
    data = {
        'code': code,
        'client_id': creds['api_key'],
        'client_secret': creds['api_secret'],
        'redirect_uri': creds['redirect_uri'],
        'grant_type': 'authorization_code',
    }
    logger.info("Exchanging code for access token...")
    response = requests.post(url, headers=headers, data=data)
    if response.status_code == 200:
        token = response.json().get('access_token')
        if token:
            logger.info("\033[92mSuccess! New access token obtained.\033[0m")
            return token
    logger.error(f"Error: {response.status_code} - {response.text}")
    return None


def _save_token(config_path, token):
    """Persist the access token into the config file."""
    try:
        with open(config_path, 'r') as f:
            config_data = json.load(f)
        config_data.setdefault('upstox', {})['access_token'] = token
        with open(config_path, 'w') as f:
            json.dump(config_data, f, indent=4)
        logger.info(f"Config updated with new token: {config_path}")
        return True
    except Exception as e:
        logger.error(f"Failed to update config: {e}")
        return False


def login(config_path=None, api_key=None, api_secret=None, redirect_uri=None,
          mobile_number=None, pin=None, totp_secret=None, manual_fallback=True):
    """
    Get an Upstox access token. Reads credentials from the config file,
    then overrides any keys explicitly passed. Writes the new token back
    into the config on success.

    Auto-login is the default path: runs the full automated service flow
    (OTP -> TOTP -> PIN -> OAuth) whenever mobile_number + pin + totp_secret
    are available. If it fails and manual_fallback=True, prompts the user
    to paste the auth code. Set manual_fallback=False for pure automation
    (no blocking input() in headless/agent contexts) — returns None instead.

    Returns: access token string, or None on failure.
    """
    config_path = Path(config_path or DEFAULT_CONFIG_PATH)
    creds = load_config(config_path)

    # Explicit args override config values
    overrides = {
        'api_key': api_key, 'api_secret': api_secret, 'redirect_uri': redirect_uri,
        'mobile_number': mobile_number, 'pin': pin, 'totp_secret': totp_secret,
    }
    for k, v in overrides.items():
        if v is not None:
            creds[k] = v

    if not creds.get('api_key') or not creds.get('api_secret') or not creds.get('redirect_uri'):
        logger.error("Missing Upstox credentials (api_key/api_secret/redirect_uri).")
        return None

    auth_code = None
    if all([creds.get('mobile_number'), creds.get('pin'), creds.get('totp_secret')]):
        auth_code = _auto_login(creds)

    if not auth_code and manual_fallback:
        auth_code = _manual_login(creds)

    if not auth_code:
        logger.error("No code provided. Exiting.")
        return None

    token = _exchange_code(creds, auth_code)
    if token:
        _save_token(config_path, token)
    return token


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    token = login()
    if token:
        print(f"\nAccess token: {token[:20]}...")
    else:
        print("\nLogin failed.")
