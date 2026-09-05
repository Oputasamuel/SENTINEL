import copy
import unittest

from bugmind.base import CHAIN_ID, prepare_receipt, verify_receipt
from worker.core import ReviewError


class BaseReceiptTests(unittest.TestCase):
    def review(self):
        return {'id': '00000000-0000-0000-0000-000000000001', 'created_at': '2026-09-03T00:00:00+00:00',
                'project': {'name': 'demo', 'repo': 'r', 'source_digest': 'ab' * 32},
                'provider': 'nvidia', 'model': 'nemotron', 'findings': [{}],
                'workflow': {'revision': 'rev', 'run_id': 'run'}}

    def test_receipt_is_deterministic_and_private(self):
        receipt = prepare_receipt(self.review())
        self.assertEqual(receipt, prepare_receipt(self.review()))
        self.assertEqual(receipt['chain_id'], CHAIN_ID)
        text = str(receipt)
        self.assertNotIn('evidence', text)
        self.assertNotIn('root_cause', text)
        self.assertTrue(verify_receipt(self.review(), receipt))

    def test_changed_review_fails_verification(self):
        receipt = prepare_receipt(self.review())
        changed = copy.deepcopy(self.review())
        changed['findings'].append({})
        with self.assertRaisesRegex(ReviewError, 'does not match'):
            verify_receipt(changed, receipt)


if __name__ == '__main__':
    unittest.main()
