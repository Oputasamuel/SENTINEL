import argparse
import getpass
import json
import sys
import warnings
from pathlib import Path

from bugmind import __version__
from bugmind.base import save_prepared, verify_receipt
from bugmind.cloud import login, sync
from bugmind.project import find_project, initialize, load_files
from bugmind.providers import BYOKReviewer, PROVIDERS, list_models
from bugmind.pashov import PashovReviewer
from bugmind.settings import read_config, save_secret, secret, write_config
from worker.core import Memory, ReviewError, review


def main():
    parser = argparse.ArgumentParser(prog='sentinel', description='Track Solidity vulnerabilities across code changes with required Sibyl memory.')
    parser.add_argument('--version', action='version', version=__version__)
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('init')
    sign_in = commands.add_parser('login'); sign_in.add_argument('--dashboard', required=True)
    provider = commands.add_parser('provider'); provider.add_argument('action', choices=['add']); provider.add_argument('name', choices=PROVIDERS)
    select = commands.add_parser('select', help='Interactive setup')
    select.add_argument('target', choices=['provider'])
    models = commands.add_parser('models'); models.add_argument('--provider', choices=PROVIDERS)
    models.add_argument('--select', help='Set an exact model ID from the live catalog')
    scan = commands.add_parser('review'); scan.add_argument('files', nargs='+'); scan.add_argument('--model')
    scan.add_argument('--local-only', action='store_true', help='Save locally without syncing to the dashboard')
    scan.add_argument('--engine', choices=['pashov', 'basic'], default='pashov', help='Default: Pashov 12-specialist workflow (14 provider calls); basic: one call')
    scan.add_argument('--concurrency', type=int, choices=range(1, 13), default=1, help='Concurrent Pashov specialist calls (default 1)')
    scan.add_argument('--resume', help='Resume a Pashov run ID with unchanged source, memory, and model')
    commands.add_parser('memory')
    upload = commands.add_parser('sync'); upload.add_argument('review_id')
    receipt = commands.add_parser('receipt'); receipt.add_argument('action', choices=['prepare', 'verify']); receipt.add_argument('review_id')
    receipt.add_argument('--file', help='Receipt JSON path (default: .bugmind/receipts/REVIEW_ID.json)')
    for command in ['confirm', 'reject', 'fixed']:
        feedback = commands.add_parser(command); feedback.add_argument('review_id'); feedback.add_argument('finding_id'); feedback.add_argument('--reason', required=True)
    args = parser.parse_args()
    try:
        execute(args)
    except (KeyboardInterrupt, EOFError):
        print('\nSetup cancelled.')
        raise SystemExit(130)
    except (ReviewError, OSError, ValueError) as error:
        print(f'SENTINEL: {error}', file=sys.stderr)
        raise SystemExit(1)


def saved_review(root, review_id):
    import uuid
    review_id = str(uuid.UUID(review_id))
    path = root / '.bugmind' / 'reviews' / f'{review_id}.json'
    return path, json.loads(path.read_text())


def choose(title, values, labels=None):
    print(f'\n{title}')
    for number, label in enumerate(labels or values, 1):
        print(f'  {number}. {label}')
    while True:
        answer = input('Enter a number or exact ID (q to cancel): ').strip()
        if answer.lower() == 'q':
            raise KeyboardInterrupt
        if answer in values:
            return answer
        if answer.isascii() and answer.isdigit() and len(answer) <= 6 and 1 <= int(answer) <= len(values):
            return values[int(answer) - 1]
        print('Please choose an entry from the list.')


def configure_provider(config, name=None):
    if name is None:
        labels = {'gemini': 'Google Gemini', 'openai': 'OpenAI',
                  'openrouter': 'OpenRouter', 'anthropic': 'Anthropic (Claude)',
                  'agentrouter': 'AgentRouter', 'nvidia': 'NVIDIA NIM'}
        name = choose('Step 1 of 3: Select provider', list(PROVIDERS), [labels[p] for p in PROVIDERS])
    print(f'\nStep 2 of 3: Enter your {name} API key. Input is hidden. Ctrl+C cancels.')
    # getpass normally falls back to echoed input when no secure terminal exists.
    with warnings.catch_warnings():
        warnings.simplefilter('error', getpass.GetPassWarning)
        try:
            key = getpass.getpass('API key: ').strip()
        except getpass.GetPassWarning:
            raise ReviewError('Hidden key entry is unavailable. Run setup in an interactive terminal.') from None
    if not key:
        raise ReviewError('API key cannot be empty. Settings were not changed.')
    print('Fetching available models...')
    available = list_models(name, key)
    if not available:
        raise ReviewError('This key returned no available models. Settings were not changed.')
    model = choose('Step 3 of 3: Select model', available)
    save_secret(name, key)
    config.update(provider=name, model=model)
    write_config(config)
    print(f'\nSelected {name} / {model}. Your key is stored in the OS credential store.')
    print('Usage and model availability depend on your provider account.')


def execute(args):
    config = read_config()
    if args.command == 'login':
        return login(args.dashboard)
    if args.command == 'select':
        return configure_provider(config)
    if args.command == 'provider':
        return configure_provider(config, args.name)
    if args.command == 'models':
        provider = args.provider or config.get('provider')
        if provider not in PROVIDERS or not secret(provider):
            raise ReviewError('Run sentinel select provider first.')
        available = list_models(provider, secret(provider))
        if args.select:
            if args.select not in available:
                raise ReviewError('Model not found in the live catalog.')
            config.update(provider=provider, model=args.select)
            write_config(config)
            print('Selected', args.select)
        else:
            print('\n'.join(available))
            print('\nCatalog access does not guarantee JSON/chat compatibility or free usage.')
        return
    if args.command == 'init':
        root, project = initialize(Path.cwd())
        print(f'Initialized {project["name"]}. Add .bugmind/ to your repository .gitignore.')
        return
    root, project = find_project(Path.cwd())
    memory = Memory(root / '.bugmind' / 'memory.db')
    if args.command == 'memory':
        for item in memory.recall(project['id']):
            print(item['memory_id'], item['status'], item['title'], '\n ', item['invariant'])
        return
    if args.command == 'sync':
        _, scan = saved_review(root, args.review_id)
        print(sync(scan))
        return
    if args.command == 'receipt':
        _, scan = saved_review(root, args.review_id)
        path = Path(args.file) if args.file else root / '.bugmind' / 'receipts' / f'{args.review_id}.json'
        if args.action == 'prepare':
            path.parent.mkdir(parents=True, exist_ok=True)
            receipt = save_prepared(scan, path)
            print('Prepared Base Sepolia receipt:', receipt['digest'])
            print('Saved:', path)
        else:
            receipt = json.loads(path.read_text(encoding='utf-8'))
            verify_receipt(scan, receipt)
            print('Receipt matches review:', receipt['digest'])
        return
    if args.command in {'confirm', 'reject', 'fixed'}:
        path, scan = saved_review(root, args.review_id)
        finding = next((item for item in scan['findings'] if item['id'] == args.finding_id), None)
        if not finding:
            raise ReviewError('Finding not present in this review.')
        status = {'confirm': 'confirmed', 'reject': 'false_positive', 'fixed': 'fixed'}[args.command]
        memory.remember(project['id'], finding, status, args.reason, scan['project']['files'], scan['project']['commit'])
        finding['status'] = status
        path.write_text(json.dumps(scan, indent=2), encoding='utf-8')
        print('Decision saved to Sibyl. Use sentinel sync REVIEW_ID to update the dashboard.')
        return
    provider = config.get('provider')
    if provider not in PROVIDERS:
        raise ReviewError('Run sentinel select provider first.')
    model = args.model or config.get('model')
    if not args.local_only and not config.get('dashboard'):
        raise ReviewError('Run sentinel login --dashboard URL first, or use --local-only.')
    source = load_files(root, project, args.files)
    print(f'Reviewing {len(source["scope"]["selected"])} selected file(s), {len(source["scope"]["included_dependencies"])} dependencies with {provider}/{model}.')
    if source['scope']['missing_imports']:
        print('Missing context:', ', '.join(source['scope']['missing_imports']))
    reviewer = BYOKReviewer(provider, secret(provider), model)
    if args.resume and args.engine != 'pashov':
        raise ReviewError('--resume is only supported by the Pashov engine.')
    if args.engine == 'pashov':
        reviewer = PashovReviewer(reviewer, root / '.bugmind' / 'pashov-runs', args.concurrency, resume=args.resume)
    result = review(source, memory, reviewer)
    if args.engine == 'pashov':
        result['pashov_executed'] = reviewer.metadata['status'] == 'complete'
        result['workflow'] = reviewer.metadata
    result.update(provider=provider, model=model, reviewer=f'{provider}/{model}')
    directory = root / '.bugmind' / 'reviews'
    directory.mkdir(parents=True, exist_ok=True)
    (directory / f'{result["id"]}.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print('Review:', result['id'], '| recalled memories:', len(result['memories']))
    for finding in result['findings']:
        print(f'\n[{finding["severity"].upper()}] {finding["title"]}\n{finding["file"]}:{finding["line"]} | {finding["id"]}\n{finding["impact"]}\nEvidence: {finding["evidence"]}')
    if not result['findings']:
        print('No supported findings returned. This is not a security certification.')
    if not args.local_only:
        try:
            print('Dashboard:', sync(result).get('url', 'Review summary saved'))
        except ReviewError as error:
            print(f'Sync pending: {error}\nRetry with: sentinel sync {result["id"]}')


if __name__ == '__main__':
    main()
