import json
import os
from pathlib import Path

from worker.core import ReviewError


def config_dir():
    base = os.getenv('APPDATA') if os.name == 'nt' else os.getenv('XDG_CONFIG_HOME', str(Path.home() / '.config'))
    return Path(base) / 'bugmind'


def read_config():
    path = config_dir() / 'config.json'
    return json.loads(path.read_text()) if path.exists() else {}


def write_config(value):
    directory = config_dir()
    directory.mkdir(parents=True, exist_ok=True)
    (directory / 'config.json').write_text(json.dumps(value, indent=2), encoding='utf-8')


def save_secret(name, value):
    import keyring
    try:
        backend = keyring.get_keyring()
        if backend.priority <= 0 or 'plaintext' in type(backend).__name__.lower():
            raise RuntimeError('No secure keyring')
        keyring.set_password('bugmind', name, value)
    except Exception:
        raise ReviewError('No secure OS credential store is available. Configure an OS keyring; SENTINEL will not write the secret to a plaintext file.') from None


def secret(name):
    import keyring
    environment_name = 'BUGMIND_' + name.upper().replace('-', '_') + '_KEY'
    value = os.getenv(environment_name)
    if value:
        return value
    try:
        return keyring.get_password('bugmind', name)
    except Exception:
        return None


def delete_secret(name):
    import keyring
    try:
        keyring.delete_password('bugmind', name)
    except keyring.errors.PasswordDeleteError:
        pass
