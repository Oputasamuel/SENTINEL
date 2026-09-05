import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from worker.core import Gemini, Memory, ReviewError, fixture, github_repo, parse_gemini_response, relevant_memories, review, select_review_scope, validate_findings


def finding():
    return {'id': 'test-bug', 'title': 'Owner authorization missing', 'root_cause': 'missing ownership check',
            'invariant': 'Only the owner may debit their balance', 'file': 'src/Vault.sol', 'function': 'withdraw'}


class MemoryTests(unittest.TestCase):
    def test_persists_into_fresh_python_process(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'memory.db'
            project = fixture('before')
            Memory(path).remember(project['repo'], finding(), 'confirmed', 'Any caller can debit another owner.', project['files'], project['commit'])
            script = 'import json,sys; from worker.core import Memory; print(json.dumps(Memory(sys.argv[1]).recall(sys.argv[2])))'
            raw = subprocess.check_output([sys.executable, '-c', script, str(path), project['repo']], text=True)
            recalled = json.loads(raw)
            self.assertEqual(recalled[0]['invariant'], finding()['invariant'])
            self.assertTrue(recalled[0]['memory_id'])
            self.assertEqual(Memory(path).recall('other/repo'), [])

    def test_changed_context_invalidates_rejection_conditions(self):
        with tempfile.TemporaryDirectory() as directory:
            memory = Memory(Path(directory) / 'memory.db')
            before, after = fixture('before'), fixture('after')
            memory.remember(before['repo'], finding(), 'false_positive', 'Assumed that an upstream guard checks ownership.', before['files'], before['commit'])
            recalled = memory.recall(before['repo'])
            self.assertTrue(relevant_memories(recalled, before['files'])[0]['conditions_unchanged'])
            self.assertFalse(relevant_memories(recalled, after['files'])[0]['conditions_unchanged'])

    def test_deletion_stops_memory_mode_before_model_call(self):
        class NeverCalled:
            def review(self, *_):
                raise AssertionError('Must not invoke model after memory failure')
        with self.assertRaises(ReviewError):
            review(fixture('after'), Memory(enabled=False), NeverCalled())

    def test_memory_cannot_be_bypassed(self):
        class NeverCalled:
            def review(self, *_):
                raise AssertionError('Model must not run without Sibyl')
        with self.assertRaisesRegex(ReviewError, 'Sibyl is disabled'):
            review(fixture('after'), Memory(enabled=False), NeverCalled())

    def test_intake_rejects_non_github_and_credential_urls(self):
        for url in ['http://127.0.0.1', 'https://github.com@evil.com/a/b', 'https://github.com/a/b?x=1', 'https://github.com/a/..']:
            with self.assertRaises(ReviewError):
                github_repo(url)
        self.assertEqual(github_repo('https://github.com/org/project.git'), 'org/project')

    def test_large_repository_gets_bounded_transparent_scope(self):
        entries = [{'path': f'src/Ordinary{i}.sol', 'size': 7000, 'sha': str(i)} for i in range(20)]
        entries += [{'path': 'src/VaultManager.sol', 'size': 9000, 'sha': 'risk'},
                    {'path': 'src/RecentlyChanged.sol', 'size': 9000, 'sha': 'changed'},
                    {'path': 'src/interfaces/IVaultManager.sol', 'size': 1000, 'sha': 'interface'}]
        selected, scope = select_review_scope(entries, {'src/RecentlyChanged.sol'})
        paths = [entry['path'] for entry in selected]
        self.assertEqual(paths[0], 'src/RecentlyChanged.sol')
        self.assertIn('src/VaultManager.sol', paths)
        self.assertLessEqual(len(selected), 12)
        self.assertLessEqual(scope['selected_bytes'], 80000)
        self.assertGreater(scope['excluded_files'], 0)
        self.assertFalse(scope['is_complete_repository_review'])

    def test_implementation_is_prioritized_over_interface(self):
        entries = [{'path': 'src/interfaces/IVaultManager.sol', 'size': 1000, 'sha': 'interface'},
                   {'path': 'src/VaultManager.sol', 'size': 9000, 'sha': 'implementation'}]
        selected, _ = select_review_scope(entries)
        self.assertEqual(selected[0]['path'], 'src/VaultManager.sol')

    def test_hallucinated_memory_ids_rejected(self):
        item = dict(finding(), line=12, severity='high', confidence=.9, evidence='balances[owner] -= amount;',
                    impact='Unauthorized withdrawal', suggested_fix='Check owner', memory_ids=['invented'])
        with self.assertRaises(ReviewError):
            validate_findings({'findings': [item]}, fixture('before')['files'], [])

    def test_missing_key_never_calls_network(self):
        with patch.dict(os.environ, {'GEMINI_API_KEY': ''}), patch('urllib.request.urlopen') as request:
            with self.assertRaises(ReviewError):
                Gemini().review(fixture('before'), [])
            request.assert_not_called()

    def test_structured_response_parser_accepts_json_and_fenced_json(self):
        for text in ['{"findings": []}', '```json\n{"findings": []}\n```']:
            envelope = json.dumps({'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': text}]}}]}).encode()
            self.assertEqual(parse_gemini_response(envelope), {'findings': []})

    def test_structured_response_parser_rejects_partial_output(self):
        envelope = json.dumps({'candidates': [{'finishReason': 'MAX_TOKENS', 'content': {'parts': [{'text': '{}'}]}}]}).encode()
        with self.assertRaisesRegex(ReviewError, 'MAX_TOKENS'):
            parse_gemini_response(envelope)


if __name__ == '__main__':
    unittest.main()
