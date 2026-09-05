"""Local Sites simulated-auth integration check. Never run against production."""
import http.cookiejar
import json
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone

BASE = 'http://localhost:5173'
browser = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def post(path, value, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    request = urllib.request.Request(BASE + path, data=json.dumps(value).encode(), headers=headers)
    return json.load(urllib.request.urlopen(request, timeout=30))


def main():
    try:
        post('/api/reviews', {})
        raise AssertionError('Anonymous upload accepted')
    except urllib.error.HTTPError as error:
        assert error.code == 401
    device = post('/api/cli/device', {})
    assert post('/api/cli/poll', {'device_code': device['device_code']})['status'] == 'pending'
    browser.open(BASE + '/signin-with-chatgpt?return_to=/dashboard', timeout=30).read()
    form = urllib.parse.urlencode({'code': device['user_code']}).encode()
    request = urllib.request.Request(BASE + '/api/cli/authorize', data=form,
                                     headers={'Content-Type': 'application/x-www-form-urlencoded', 'Origin': BASE})
    browser.open(request, timeout=30).read()
    token = post('/api/cli/poll', {'device_code': device['device_code']})['token']
    assert post('/api/cli/poll', {'device_code': device['device_code']})['status'] == 'expired'
    review_id = str(uuid.uuid4())
    summary = {'id': review_id, 'created_at': datetime.now(timezone.utc).isoformat(), 'repository': 'integration-smoke-test',
               'commit': 'test-only', 'source_digest': '', 'provider': 'test', 'model': 'test',
               'mode': 'baseline', 'memory_count': 0, 'files': ['Test.sol'], 'findings': []}
    assert post('/api/reviews', summary, token)['saved']
    html = browser.open(BASE + '/dashboard', timeout=30).read().decode()
    assert 'integration-smoke-test' in html
    request = urllib.request.Request(BASE + '/api/cli/revoke', data=b'',
                                     headers={'Content-Type': 'application/x-www-form-urlencoded', 'Origin': BASE})
    browser.open(request, timeout=30).read()
    try:
        post('/api/reviews', summary, token)
        raise AssertionError('Revoked token accepted')
    except urllib.error.HTTPError as error:
        assert error.code == 401
    print('PASS: login, pending/one-time device flow, authenticated upload, history, revocation')
    print('CLEANUP_REVIEW', review_id)


if __name__ == '__main__':
    main()
