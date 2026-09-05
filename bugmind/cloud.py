import json
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser

from bugmind.settings import read_config, save_secret, secret, write_config
from worker.core import ReviewError


def dashboard_url(value):
    parsed = urllib.parse.urlparse(value)
    if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in {'', '/'}:
        raise ReviewError('Use the dashboard origin only, such as https://bugmind.example.')
    if parsed.scheme != 'https' and not (parsed.scheme == 'http' and parsed.hostname in {'localhost', '127.0.0.1'}):
        raise ReviewError('Dashboard connections require HTTPS, except local development.')
    return value.rstrip('/')


def call(path, body, authenticated=True, base=None):
    config = read_config()
    base = dashboard_url(base or config.get('dashboard', ''))
    headers = {'Content-Type': 'application/json', 'User-Agent': 'SENTINEL/0.2'}
    if authenticated:
        token = secret('dashboard-' + base)
        if not token:
            raise ReviewError('Run sentinel login to link this CLI to your dashboard.')
        headers['Authorization'] = 'Bearer ' + token
    request = urllib.request.Request(base + path, data=json.dumps(body).encode(), headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        if error.code == 401:
            raise ReviewError('Your dashboard session expired. Run sentinel login again.') from None
        raise ReviewError(f'Dashboard returned HTTP {error.code}. Your local review is preserved.') from None


def login(base):
    base = dashboard_url(base)
    device = call('/api/cli/device', {}, False, base)
    print('Open this page and approve the matching code:')
    print(base + '/connect?code=' + device['user_code'])
    print('Code:', device['user_code'])
    webbrowser.open(base + '/connect?code=' + device['user_code'])
    for _ in range(120):
        time.sleep(5)
        response = call('/api/cli/poll', {'device_code': device['device_code']}, False, base)
        if response.get('token'):
            save_secret('dashboard-' + base, response['token'])
            config = read_config()
            config['dashboard'] = base
            write_config(config)
            print('CLI linked. Your API keys remain on this device.')
            return
        if response.get('status') == 'expired':
            break
    raise ReviewError('Login expired. Run sentinel login again.')


def sync(scan):
    # No source, evidence excerpts, API keys, or raw memory payloads cross this boundary.
    summary = {'id': scan['id'], 'created_at': scan['created_at'], 'repository': scan['project'].get('name', scan['project']['repo']),
               'commit': scan['project']['commit'], 'source_digest': scan['project'].get('source_digest', ''),
               'files': [f['path'] for f in scan['project']['files']], 'mode': scan['mode'],
               'provider': scan.get('provider', ''), 'model': scan.get('model', ''),
               'memory_count': len(scan['memories']),
               'findings': [{k: f[k] for k in ('id', 'title', 'severity', 'file', 'line', 'status')} for f in scan['findings']]}
    return call('/api/reviews', summary)
