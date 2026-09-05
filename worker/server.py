"""Loopback-only HTTP bridge for the local dashboard; never run repository scripts."""
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from worker.core import DATA, Gemini, Memory, ReviewError, fixture, intake, load_environment, review

load_environment()
LOCK = threading.Lock()
ALLOWED_ORIGINS = {'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000', 'http://127.0.0.1:3000'}


def read_scan(scan_id):
    import uuid
    try:
        scan_id = str(uuid.UUID(scan_id))
    except (ValueError, TypeError):
        raise ReviewError('Invalid scan identifier.') from None
    path = DATA / 'scans' / f'{scan_id}.json'
    if not path.exists():
        raise ReviewError('This scan is no longer available.')
    return json.loads(path.read_text(encoding='utf-8'))


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # Do not log repository contents, prompts, or credentials.

    def send_json(self, status, data):
        payload = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def allowed(self):
        return self.headers.get('Host') in {'127.0.0.1:8766', 'localhost:8766'} and (
            not self.headers.get('Origin') or self.headers['Origin'] in ALLOWED_ORIGINS)

    def do_GET(self):
        if not self.allowed():
            return self.send_json(403, {'error': 'Untrusted origin.'})
        if self.path != '/status':
            return self.send_json(404, {'error': 'Not found.'})
        try:
            count = len(Memory().recall('bugmind/vault-fixture'))
            memory_status = 'ready'
        except Exception:
            count, memory_status = 0, 'unavailable'
        self.send_json(200, {'worker': 'ready', 'sibyl': memory_status, 'fixture_memories': count,
                             'gemini': 'ready' if os.getenv('GEMINI_API_KEY') and os.getenv('GEMINI_FREE_TIER_CONFIRMED') == 'true' else 'needs_setup',
                             'model': os.getenv('GEMINI_MODEL', 'gemini-3.6-flash'), 'pashov': 'not_connected',
                             'virtuals': 'not_connected', 'base': 'not_connected'})

    def do_POST(self):
        if not self.allowed() or self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            return self.send_json(403, {'error': 'Only local JSON requests are accepted.'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 8000:
                raise ReviewError('Invalid request size.')
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict):
                raise ReviewError('Request must be an object.')
            if self.path == '/scan':
                if not LOCK.acquire(blocking=False):
                    return self.send_json(409, {'error': 'A review is already running. Please wait.'})
                try:
                    project = fixture(body['revision']) if body.get('source') == 'fixture' else intake(body.get('url', ''))
                    if body.get('use_memory') is False:
                        raise ReviewError('Sibyl memory is mandatory and cannot be disabled.')
                    result = review(project, Memory(), Gemini())
                    directory = DATA / 'scans'
                    directory.mkdir(parents=True, exist_ok=True)
                    (directory / f'{result["id"]}.json').write_text(json.dumps(result), encoding='utf-8')
                finally:
                    LOCK.release()
                return self.send_json(200, result)
            if self.path == '/feedback':
                with LOCK:
                    scan = read_scan(body.get('scan_id'))
                    finding = next((f for f in scan['findings'] if f['id'] == body.get('finding_id')), None)
                    if not finding:
                        raise ReviewError('Finding not present in the saved scan.')
                    project = scan['project']
                    memory = Memory().remember(project['repo'], finding, body.get('status'), body.get('reason'), project['files'], project['commit'])
                return self.send_json(200, memory)
            if self.path == '/memories':
                repo = body.get('repo', 'bugmind/vault-fixture')
                if not isinstance(repo, str) or len(repo) > 150:
                    raise ReviewError('Invalid repository identity.')
                return self.send_json(200, {'memories': Memory().recall(repo)})
            return self.send_json(404, {'error': 'Not found.'})
        except ReviewError as error:
            return self.send_json(400, {'error': str(error)})
        except (ValueError, KeyError, TypeError):
            return self.send_json(400, {'error': 'Invalid request or provider response.'})
        except Exception:
            return self.send_json(503, {'error': 'The review service is unavailable. Check connectivity and the local setup; no success was recorded.'})


if __name__ == '__main__':
    port = int(os.getenv('BUGMIND_PORT', '8766'))
    if port != 8766:
        raise SystemExit('BUGMIND_PORT must remain 8766 in this prototype.')
    # Refuse to start if the required Sibyl store cannot initialize and read.
    Memory().recall('bugmind/startup-health')
    print(f'BugMind worker: http://127.0.0.1:{port} (local only, Sibyl required)', flush=True)
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
