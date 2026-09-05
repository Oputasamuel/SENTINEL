"""Privacy-preserving Base receipt preparation and verification."""
import hashlib
import json
from pathlib import Path

from worker.core import ReviewError

CHAIN_ID = 84532
NETWORK = 'base-sepolia'


def receipt_payload(review):
    workflow = review.get('workflow', {})
    return {
        'schema': 'bugmind-review-receipt-v1',
        'review_id': review['id'],
        'created_at': review['created_at'],
        'repository': review['project'].get('name', review['project']['repo']),
        'source_digest': review['project']['source_digest'],
        'provider': review['provider'],
        'model': review['model'],
        'pashov_revision': workflow.get('revision'),
        'pashov_run_id': workflow.get('run_id'),
        'finding_count': len(review['findings']),
    }


def digest_payload(payload):
    canonical = json.dumps(payload, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()
    return '0x' + hashlib.sha256(canonical).hexdigest()


def prepare_receipt(review):
    payload = receipt_payload(review)
    return {'network': NETWORK, 'chain_id': CHAIN_ID, 'digest': digest_payload(payload),
            'payload': payload, 'contract': None, 'transaction_hash': None, 'block_number': None}


def verify_receipt(review, receipt):
    if receipt.get('network') != NETWORK or receipt.get('chain_id') != CHAIN_ID:
        raise ReviewError('Receipt is not for Base Sepolia.')
    expected = prepare_receipt(review)
    if receipt.get('payload') != expected['payload'] or receipt.get('digest') != expected['digest']:
        raise ReviewError('Receipt does not match this review.')
    return True


def save_prepared(review, path):
    receipt = prepare_receipt(review)
    Path(path).write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    return receipt
