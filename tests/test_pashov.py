import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from bugmind.pashov import PashovReviewer, SPECIALISTS, skill_files, require_review_response
from bugmind.providers import BYOKReviewer
from worker.core import ReviewError


class PashovTests(unittest.TestCase):
    def test_live_observed_refusal_is_not_a_completed_stage(self):
        refusal = 'Sorry, I cannot fulfill your request. I am unable to perform vulnerability analysis or security assessments on specific code snippets.'
        with self.assertRaisesRegex(ReviewError, 'refused'):
            require_review_response(refusal)
        self.assertEqual(require_review_response('No supported findings. No leads.'), 'No supported findings. No leads.')

    def test_all_specialists_then_judge_then_validation(self):
        calls = []
        class Provider:
            def generate(self, system, content, structured=False):
                calls.append((system, json.loads(content), structured))
                return {'findings': []} if structured else 'No supported findings. No leads.'
        project = {'files': [{'path': 'Vault.sol', 'content': 'contract Vault {}'}]}
        with tempfile.TemporaryDirectory() as root:
            reviewer = PashovReviewer(Provider(), root, progress=lambda _: None)
            self.assertEqual(reviewer.review(project, []), [])
            self.assertEqual(len(calls), 14)
            self.assertEqual(set(calls[12][1]['specialist_outputs']), set(SPECIALISTS))
            self.assertIn('Gate 1', calls[12][0])
            self.assertIn('NEVER merge across different', calls[12][0])
            self.assertTrue(calls[13][2])
            self.assertEqual(reviewer.metadata['status'], 'complete')
            self.assertTrue((Path(reviewer.metadata['artifacts']) / 'report.md').exists())
            _, read = skill_files()
            for name, call in zip(SPECIALISTS, calls[:12]):
                self.assertIn(read(f'references/hacking-agents/{name}-agent.md'), call[0])

    def test_failure_does_not_run_judge_or_accept_findings(self):
        class Provider:
            def generate(self, *args, **kwargs):
                raise ReviewError('Quota reached')
        with tempfile.TemporaryDirectory() as root:
            reviewer = PashovReviewer(Provider(), root, progress=lambda _: None)
            with self.assertRaisesRegex(ReviewError, 'no findings accepted'):
                reviewer.review({'files': []}, [])
            self.assertEqual(reviewer.metadata['status'], 'failed')
            self.assertFalse((Path(reviewer.metadata['artifacts']) / 'report.md').exists())

    def test_extraction_cannot_add_nonexistent_source_evidence(self):
        finding = dict(title='Bug', file='Vault.sol', function='f', line=1, severity='high',
                       root_cause='Cause', invariant='Rule', evidence='nonexistent code', impact='Loss',
                       suggested_fix='Check', confidence=0.9, memory_ids=[])
        class Provider:
            def generate(self, system, content, structured=False):
                return {'findings': [finding]} if structured else 'Report'
        with tempfile.TemporaryDirectory() as root:
            reviewer = PashovReviewer(Provider(), root, progress=lambda _: None)
            self.assertEqual(reviewer.review({'files': [{'path': 'Vault.sol', 'content': 'contract Vault {}'}]}, []), [])
            self.assertEqual(reviewer.metadata['status'], 'complete')

    def test_raw_gemini_pass_rejects_truncation(self):
        with patch('bugmind.providers.request_json', return_value={'candidates': [{'finishReason': 'MAX_TOKENS'}]}):
            with self.assertRaises(ReviewError):
                BYOKReviewer('gemini', 'fake-test-key', 'test-model').generate('rules', 'source')

    def test_gemini_raw_and_structured_modes(self):
        with patch('bugmind.providers.request_json', return_value={'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': 'Report'}]}}]}) as request:
            self.assertEqual(BYOKReviewer('gemini', 'fake-test-key', 'test-model').generate('rules', 'source'), 'Report')
            self.assertNotIn('responseSchema', request.call_args.args[3]['generationConfig'])


if __name__ == '__main__':
    unittest.main()
