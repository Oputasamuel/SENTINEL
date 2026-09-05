import json
import unittest
from unittest.mock import MagicMock, patch

from bugmind.providers import BYOKReviewer, list_models, request_json
from worker.core import ReviewError


class AnthropicTests(unittest.TestCase):
    def test_catalog_paginates_and_deduplicates(self):
        pages = [{'data': [{'id': 'claude-test-b'}], 'has_more': True, 'last_id': 'cursor/a'},
                 {'data': [{'id': 'claude-test-a'}, {'id': 'claude-test-b'}], 'has_more': False}]
        with patch('bugmind.providers.request_json', side_effect=pages) as request:
            self.assertEqual(list_models('anthropic', 'test-key'), ['claude-test-a', 'claude-test-b'])
            self.assertIn('after_id=cursor%2Fa', request.call_args.args[0])

    def test_catalog_rejects_repeated_cursor(self):
        page = {'data': [], 'has_more': True, 'last_id': 'same'}
        with patch('bugmind.providers.request_json', return_value=page):
            with self.assertRaises(ReviewError):
                list_models('anthropic', 'test-key')

    def test_native_auth_headers(self):
        response = MagicMock()
        response.__enter__.return_value.read.return_value = b'{}'
        with patch('bugmind.providers.urllib.request.urlopen', return_value=response) as urlopen:
            request_json('https://api.anthropic.com/v1/models', 'fake-test-key', 'anthropic')
            headers = {key.lower(): value for key, value in urlopen.call_args.args[0].header_items()}
            self.assertEqual(headers['x-api-key'], 'fake-test-key')
            self.assertEqual(headers['anthropic-version'], '2023-06-01')
            self.assertNotIn('authorization', headers)

    def test_raw_pass_uses_native_messages_and_text_only(self):
        response = {'stop_reason': 'end_turn', 'content': [{'type': 'thinking', 'thinking': 'private'},
                    {'type': 'text', 'text': 'Review complete.'}]}
        with patch('bugmind.providers.request_json', return_value=response) as request:
            result = BYOKReviewer('anthropic', 'fake-test-key', 'claude-test').generate('instructions', 'source')
            self.assertEqual(result, 'Review complete.')
            url, _, _, payload = request.call_args.args
            self.assertEqual(url, 'https://api.anthropic.com/v1/messages')
            self.assertEqual(payload['system'], 'instructions')
            self.assertEqual(payload['messages'], [{'role': 'user', 'content': 'source'}])
            self.assertNotIn('tools', payload)

    def test_structured_pass_flows_through_finding_validation(self):
        response = {'stop_reason': 'tool_use', 'content': [{'type': 'tool_use', 'name': 'submit_review', 'input': {'findings': []}}]}
        with patch('bugmind.providers.request_json', return_value=response) as request:
            self.assertEqual(BYOKReviewer('anthropic', 'fake-test-key', 'claude-test').review({'files': []}, []), [])
            schema = request.call_args.args[3]['tools'][0]['input_schema']
            self.assertEqual(schema['type'], 'object')
            self.assertEqual(schema['properties']['findings']['items']['type'], 'object')
            self.assertNotIn('response_format', request.call_args.args[3])

    def test_rejects_truncation_refusal_and_wrong_tool(self):
        reviewer = BYOKReviewer('anthropic', 'fake-test-key', 'claude-test')
        for reason in ['max_tokens', 'refusal', 'pause_turn']:
            for structured in [False, True]:
                with self.subTest(reason=reason, structured=structured):
                    with patch('bugmind.providers.request_json', return_value={'stop_reason': reason, 'content': [{'type': 'text', 'text': '{}'}]}):
                        with self.assertRaises(ReviewError):
                            reviewer.generate('rules', 'source', structured)
        with patch('bugmind.providers.request_json', return_value={'stop_reason': 'tool_use', 'content': [{'type': 'tool_use', 'name': 'other', 'input': {}}]}):
            with self.assertRaises(ReviewError):
                reviewer.generate('rules', 'source', True)


if __name__ == '__main__':
    unittest.main()
