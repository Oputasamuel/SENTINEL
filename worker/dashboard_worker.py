"""Persistent SENTINEL dashboard audit worker."""
import base64
import http.client
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from bugmind.pashov import PashovReviewer
from bugmind.providers import BYOKReviewer
from bugmind.settings import read_config, secret
from worker.core import Memory, ReviewError, get_json, load_environment, review

ROOT = Path(__file__).resolve().parents[1]

def api(method, path, body=None):
    base = os.environ['SENTINEL_DASHBOARD'].rstrip('/')
    token = os.environ['SENTINEL_WORKER_TOKEN']
    data = json.dumps(body).encode() if body is not None else None
    for attempt in range(3):
        request = urllib.request.Request(base + path, data=data, method=method,
            headers={'authorization': 'Bearer ' + token, 'content-type': 'application/json', 'user-agent': 'SENTINEL-worker/1'})
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code not in {408, 500, 502, 503, 504} or attempt == 2:
                raise
        except (urllib.error.URLError, TimeoutError, ConnectionError, http.client.RemoteDisconnected):
            # Retrying a lost GET response could strand a job that was already claimed.
            if method == 'GET' or attempt == 2:
                raise
        time.sleep(2 ** attempt)

def load_project(job):
    repository = job['repository'].removeprefix('https://github.com/').strip('/')
    branch = urllib.parse.quote(job['branch'], safe='')
    head = get_json(f'https://api.github.com/repos/{repository}/commits/{branch}')
    tree = get_json(f'https://api.github.com/repos/{repository}/git/trees/{head["sha"]}?recursive=1')
    entries = {item['path']: item for item in tree.get('tree', []) if item.get('type') == 'blob'}
    files, total = [], 0
    for path in job['contracts']:
        entry = entries.get(path)
        if not entry or not path.endswith('.sol'):
            raise ReviewError(f'Selected contract is missing: {path}')
        blob = get_json(f'https://api.github.com/repos/{repository}/git/blobs/{entry["sha"]}')
        content = base64.b64decode(blob['content']).decode('utf-8')
        total += len(content.encode())
        if len(files) >= 20 or total > 120_000:
            raise ReviewError('Selected contracts exceed the 20 file / 120 KB worker limit.')
        files.append({'path': path, 'content': content})
    return {'repo': repository.lower(), 'commit': head['sha'], 'files': files, 'source': 'github',
        'scope': {'strategy':'user-selected contracts','selected_files':len(files),'selected_bytes':total,
                  'eligible_files':len(files),'excluded_files':0,'is_complete_repository_review':False,
                  'changed_files_selected':0,'limits':{'files':20,'bytes':120000},'paths':[f['path'] for f in files]}}

def remember_open(memory, repo, findings, files, commit):
    client = memory.client(repo)
    try:
        for finding in findings:
            body = {**finding, 'repo_id':repo, 'status':'open', 'commit':commit,
                    'source_hashes':{f['path']:__import__('worker.core',fromlist=['digest']).digest(f['content']) for f in files}}
            client.set_entity('review_outcome', finding['id'], body)
    finally:
        client._storage.close()

def run_once():
    response = api('GET', '/api/worker/jobs')
    job = response.get('job')
    if not job: return False
    try:
        project = load_project(job)
        memory = Memory(ROOT / '.bugmind' / 'workspaces' / job['id'] / 'memory.db')
        config = read_config()
        provider = BYOKReviewer('nvidia', os.getenv('NVIDIA_API_KEY') or secret('nvidia'),
            os.getenv('NVIDIA_MODEL') or config.get('models', {}).get('nvidia') or 'nvidia/nemotron-3.5-lightning-30b-a3b')
        all_findings = {}
        completed_contracts = 0
        for number, source_file in enumerate(project['files'], 1):
            print(f'Auditing contract {number}/{len(project["files"])}: {source_file["path"]}', flush=True)
            api('POST','/api/worker/jobs',{'id':job['id'],'status':'progress',
                'message':f'Reviewing contract {number} of {len(project["files"])}'})
            scoped = {**project, 'files':[source_file], 'scope':{**project['scope'], 'selected_files':1,
                'selected_bytes':len(source_file['content'].encode()), 'paths':[source_file['path']]}}
            auditor = PashovReviewer(provider, ROOT / '.bugmind' / 'workspaces' / job['id'] / 'pashov-runs', concurrency=1)
            try:
                result = review(scoped, memory, auditor)
            except ReviewError as error:
                print(f'Contract audit failed safely: {source_file["path"]}: {error}', flush=True)
                continue
            completed_contracts += 1
            remember_open(memory, project['repo'], result['findings'], scoped['files'], project['commit'])
            for finding in result['findings']: all_findings[finding['id']] = finding
            api('POST','/api/worker/jobs',{'id':job['id'],'status':'progress',
                'message':f'Finished contract {number} of {len(project["files"])}'})
        if not completed_contracts:
            raise ReviewError('Every selected contract audit failed; no findings were accepted.')
        findings = [{'id':f['id'],'title':f['title'],'file':f['file'],'severity':f['severity'],
                     'description':f['root_cause'] + '\n\nImpact: ' + f['impact']} for f in all_findings.values()]
        api('POST','/api/worker/jobs',{'id':job['id'],'status':'complete','findings':findings})
    except Exception as error:
        print(f'Workspace {job["id"]} failed: {error}', flush=True)
        api('POST','/api/worker/jobs',{'id':job['id'],'status':'failed'})
    return True

def main():
    load_environment()
    required = ['SENTINEL_DASHBOARD','SENTINEL_WORKER_TOKEN']
    missing = [name for name in required if not os.getenv(name)]
    if missing: raise SystemExit('Missing worker settings: ' + ', '.join(missing))
    print('SENTINEL audit worker ready.', flush=True)
    while True:
        try:
            if not run_once(): time.sleep(15)
        except KeyboardInterrupt: break
        except Exception as error:
            print(f'Worker connection error: {error}', flush=True); time.sleep(15)

if __name__ == '__main__': main()
