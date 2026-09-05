import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from bugmind.cloud import sync
from bugmind.project import initialize, load_files
from worker.core import Memory, ReviewError, relevant_memories


class CLITests(unittest.TestCase):
    def test_local_review_loads_imports_without_executing_project(self):
        with tempfile.TemporaryDirectory() as directory:
            root, project = initialize(directory)
            (root / 'Guard.sol').write_text('pragma solidity ^0.8.24; contract Guard {}')
            (root / 'Vault.sol').write_text('pragma solidity ^0.8.24; import "./Guard.sol"; contract Vault is Guard {}')
            result = load_files(root, project, [root / 'Vault.sol'])
            self.assertEqual(result['scope']['selected'], ['Vault.sol'])
            self.assertEqual(result['scope']['included_dependencies'], ['Guard.sol'])
            self.assertEqual(result['scope']['missing_imports'], [])

    def test_target_cannot_escape_repository(self):
        with tempfile.TemporaryDirectory() as directory:
            root, project = initialize(Path(directory) / 'project')
            outside = Path(directory) / 'Outside.sol'
            outside.write_text('contract Outside {}')
            with self.assertRaises(ReviewError):
                load_files(root, project, [outside])

    def test_confirmed_invariant_is_recalled_for_another_file(self):
        with tempfile.TemporaryDirectory() as directory:
            memory = Memory(Path(directory) / 'memory.db')
            finding = {'id': 'A', 'title': 'Owner check', 'root_cause': 'missing owner',
                       'invariant': 'Only owners withdraw', 'file': 'Vault.sol', 'function': 'withdraw'}
            memory.remember('repo', finding, 'confirmed', 'The caller must own the balance.',
                            [{'path': 'Vault.sol', 'content': 'contract Vault {}'}], 'commit')
            recalled = relevant_memories(memory.recall('repo'), [{'path': 'Emergency.sol', 'content': 'contract Emergency {}'}])
            self.assertEqual(recalled[0]['invariant'], 'Only owners withdraw')
            self.assertFalse(recalled[0]['conditions_unchanged'])

    def test_dashboard_sync_omits_source_evidence_and_keys(self):
        scan = {'id': 'review', 'created_at': 'date', 'project': {'repo': 'repo', 'commit': 'commit',
                'files': [{'path': 'Vault.sol', 'content': 'SECRET_SOURCE'}]}, 'mode': 'memory-aware',
                'memories': [{'body': 'PRIVATE_MEMORY'}], 'api_key': 'SECRET_KEY',
                'findings': [{'id': 'finding', 'title': 'Owner missing', 'severity': 'high',
                              'file': 'Vault.sol', 'line': 2, 'status': 'open', 'evidence': 'SECRET_EVIDENCE'}]}
        with patch('bugmind.cloud.call') as call:
            sync(scan)
            serialized = json.dumps(call.call_args.args[1])
            for secret in ['SECRET_SOURCE', 'SECRET_KEY', 'SECRET_EVIDENCE', 'PRIVATE_MEMORY']:
                self.assertNotIn(secret, serialized)


if __name__ == '__main__':
    unittest.main()
