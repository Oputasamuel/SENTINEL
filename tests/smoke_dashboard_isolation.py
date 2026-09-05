"""Local D1 account-isolation integration test; never targets a remote server."""
import hashlib
import http.cookiejar
import json
from pathlib import Path
import secrets
import sqlite3
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone

BASE = 'http://localhost:5173'
ROOT = Path(__file__).resolve().parents[1]


def main():
    databases = list((ROOT / 'dashboard/.wrangler/state/v3/d1').rglob('*.sqlite'))
    database = next(path for path in databases if path.name != 'metadata.sqlite')
    tokens = [secrets.token_hex(32) for _ in range(2)]
    hashes = [hashlib.sha256(token.encode()).hexdigest() for token in tokens]
    ids = [str(uuid.uuid4()), str(uuid.uuid4())]
    users = ['local_seedy', 'synthetic-isolation-' + ids[1]]
    def post(body, token):
        request = urllib.request.Request(BASE + '/api/reviews', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token})
        return json.load(urllib.request.urlopen(request, timeout=20))
    summaries = [{'id': ident, 'created_at': datetime.now(timezone.utc).isoformat(), 'repository': 'isolation-' + ident,
                  'commit': 'local-test', 'source_digest': '', 'provider': 'test', 'model': 'test', 'mode': 'baseline',
                  'memory_count': 0, 'files': ['Test.sol'], 'findings': []} for ident in ids]
    with sqlite3.connect(database) as db:
        try:
            now = int(time.time() * 1000)
            db.executemany('INSERT INTO cli_sessions (token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)', [(h,u,now,now+120000) for h,u in zip(hashes,users)])
            db.commit()
            for summary, token in zip(summaries, tokens):
                assert post(summary, token)['saved']
            try:
                post(summaries[0], tokens[1])
                raise AssertionError('Cross-account overwrite accepted')
            except urllib.error.HTTPError as error:
                assert error.code == 409
            browser = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
            browser.open(BASE + '/signin-with-chatgpt?return_to=/dashboard', timeout=20).read()
            html = browser.open(BASE + '/dashboard', timeout=20).read().decode()
            assert summaries[0]['repository'] in html
            assert summaries[1]['repository'] not in html
            print('PASS: two synthetic account tokens upload; cross-account overwrite blocked; dashboard shows only signed-in account records.')
        finally:
            db.executemany('DELETE FROM reviews WHERE id=?', [(i,) for i in ids])
            db.executemany('DELETE FROM cli_sessions WHERE token_hash=?', [(h,) for h in hashes])
            db.execute('DELETE FROM reviews WHERE id=?', ('6a6131c3-482d-4d97-87c8-e6b5d31bf3ac',))
            db.commit()


if __name__ == '__main__':
    main()
