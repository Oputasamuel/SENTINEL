import json
import re
import subprocess
import uuid
from pathlib import Path

from worker.core import ReviewError, digest


def git_value(root, *args):
    try:
        result = subprocess.run(['git', '-C', str(root), *args], capture_output=True, text=True, timeout=10, check=True)
        return result.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return None


def initialize(root):
    root = Path(root).resolve()
    path = root / '.bugmind' / 'project.json'
    if path.exists():
        return root, json.loads(path.read_text())
    path.parent.mkdir(parents=True, exist_ok=True)
    value = {'id': str(uuid.uuid4()), 'name': root.name}
    path.write_text(json.dumps(value, indent=2), encoding='utf-8')
    return root, value


def find_project(start):
    start = Path(start).resolve()
    for root in [start, *start.parents]:
        path = root / '.bugmind' / 'project.json'
        if path.exists():
            return root, json.loads(path.read_text())
    raise ReviewError('Run sentinel init in the repository root first.')


def load_files(root, project, requested):
    root = Path(root).resolve()
    queue, selected = [], []
    for value in requested:
        path = Path(value).resolve()
        if not path.is_relative_to(root) or path.suffix != '.sol' or not path.is_file():
            raise ReviewError('Review targets must be existing .sol files inside the initialized repository.')
        if path not in queue:
            queue.append(path)
            selected.append(path.relative_to(root).as_posix())
    files, missing, seen, total = [], [], set(), 0
    while queue:
        path = queue.pop(0)
        if path in seen:
            continue
        seen.add(path)
        content = path.read_text(encoding='utf-8')
        size = len(content.encode())
        if len(files) >= 20 or total + size > 120000:
            if path.relative_to(root).as_posix() in selected:
                raise ReviewError('Selected files exceed the 120 KB / 20-file budget. Review fewer files at a time.')
            missing.append(path.relative_to(root).as_posix() + ' (context budget)')
            continue
        total += size
        files.append({'path': path.relative_to(root).as_posix(), 'content': content})
        for imported in re.findall(r'\bimport\s+(?:[^;]*?\s+from\s+)?[\"\']([^\"\']+)[\"\']\s*;', content):
            dependency = (path.parent / imported).resolve() if imported.startswith('.') else (root / imported).resolve()
            if dependency.is_relative_to(root) and dependency.is_file() and dependency.suffix == '.sol':
                queue.append(dependency)
            else:
                missing.append(imported)
    return {'repo': project['id'], 'name': project['name'], 'commit': git_value(root, 'rev-parse', 'HEAD') or 'uncommitted',
            'source_digest': digest(files), 'source': 'local', 'files': files,
            'scope': {'selected': selected, 'included_dependencies': [f['path'] for f in files if f['path'] not in selected],
                      'missing_imports': sorted(set(missing)), 'bytes': total}}
