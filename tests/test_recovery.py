import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

from bugmind.pashov import PashovReviewer
from bugmind.providers import request_json, TransientProviderError
from worker.core import ReviewError


class RecoveryTests(unittest.TestCase):
    def test_transient_retry_is_bounded(self):
        with patch('bugmind.providers._request_once', side_effect=[TransientProviderError('503'), {'ok': True}]) as call, patch('bugmind.providers.time.sleep'):
            self.assertEqual(request_json('url', 'key', 'gemini'), {'ok': True})
            self.assertEqual(call.call_count, 2)
        with patch('bugmind.providers._request_once', side_effect=TransientProviderError('503')) as call, patch('bugmind.providers.time.sleep'):
            with self.assertRaises(TransientProviderError):
                request_json('url', 'key', 'gemini')
            self.assertEqual(call.call_count, 2)

    def test_permanent_error_not_retried(self):
        with patch('bugmind.providers._request_once', side_effect=ReviewError('Quota or invalid key')) as call:
            with self.assertRaises(ReviewError):
                request_json('url', 'key', 'gemini')
            self.assertEqual(call.call_count, 1)

    def test_resume_skips_finished_stages_and_rejects_changed_source(self):
        class Provider:
            provider = 'test'
            model = 'test'
            def __init__(self):
                self.calls = 0
                self.fail_at = 3
            def generate(self, system, body, structured=False):
                self.calls += 1
                if self.calls == self.fail_at:
                    raise ReviewError('Temporary failure')
                return {'findings': []} if structured else 'No supported findings. No leads.'
        project = {'files': [{'path': 'A.sol', 'content': 'contract A {}'}]}
        with tempfile.TemporaryDirectory() as root:
            provider = Provider()
            run = PashovReviewer(provider, root, progress=lambda _: None)
            with self.assertRaises(ReviewError):
                run.review(project, [])
            self.assertEqual(provider.calls, 3)  # no subsequent work after failure
            run_id = run.metadata['run_id']
            with self.assertRaisesRegex(ReviewError, 'changed'):
                PashovReviewer(provider, root, progress=lambda _: None, resume=run_id).review({'files': []}, [])
            provider.fail_at = -1
            resumed = PashovReviewer(provider, root, progress=lambda _: None, resume=run_id)
            self.assertEqual(resumed.review(project, []), [])
            self.assertEqual(provider.calls, 15)  # 14 successful stages plus one failed attempt
            self.assertEqual(resumed.metadata['status'], 'complete')
            with self.assertRaisesRegex(ReviewError, 'changed'):
                PashovReviewer(provider, root, progress=lambda _: None, resume=run_id).review(project, [{'memory_id': 'new'}])

    def test_successful_parallel_stages_survive_other_stage_failure(self):
        import threading
        class FailingProvider:
            def __init__(self):
                self.calls = 0
                self.lock = threading.Lock()
            def generate(self, *args, **kwargs):
                with self.lock:
                    self.calls += 1
                    call = self.calls
                if call == 1:
                    raise ReviewError('Failed stage')
                return 'No supported findings. No leads.'
        with tempfile.TemporaryDirectory() as root:
            provider = FailingProvider()
            run = PashovReviewer(provider, root, concurrency=3, progress=lambda _: None)
            with self.assertRaises(ReviewError):
                run.review({'files': []}, [])
            self.assertEqual(provider.calls, 3)
            self.assertEqual(len(list(Path(run.metadata['artifacts']).glob('*.checkpoint.json'))), 2)


if __name__ == '__main__':
    unittest.main()
