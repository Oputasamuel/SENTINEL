import unittest
import io
import urllib.error
from unittest.mock import patch
from bugmind.providers import BYOKReviewer, list_models, request_json
from worker.core import ReviewError


class AgentRouterTests(unittest.TestCase):
    def test_unauthorized_client_is_not_reported_as_bad_key_or_retried(self):
        body = b'{"error":{"message":"unauthorized client detected, contact support for assistance"}}'
        error = urllib.error.HTTPError('https://agentrouter.org/v1/models', 401, 'Unauthorized', {}, io.BytesIO(body))
        with patch('bugmind.providers.urllib.request.urlopen', side_effect=error) as call:
            with self.assertRaisesRegex(ReviewError, 'unauthorized client'):
                request_json('https://agentrouter.org/v1/models', 'test-secret', 'agentrouter')
            self.assertEqual(call.call_count, 1)

    def test_invalid_token_diagnostic_does_not_echo_provider_body(self):
        body = b'{"error":{"message":"invalid token test-secret"}}'
        error = urllib.error.HTTPError('https://agentrouter.org/v1/models', 401, 'Unauthorized', {}, io.BytesIO(body))
        with patch('bugmind.providers.urllib.request.urlopen', side_effect=error):
            with self.assertRaises(ReviewError) as caught:
                request_json('https://agentrouter.org/v1/models', 'test-secret', 'agentrouter')
            self.assertIn('invalid or expired token', str(caught.exception))
            self.assertNotIn('test-secret', str(caught.exception))

    def test_live_model_catalog_uses_agentrouter_endpoint(self):
        with patch('bugmind.providers.request_json', return_value={'data': [{'id': 'claude-test'}, {'id': 'gpt-test'}]}) as call:
            self.assertEqual(list_models('agentrouter', 'test-key'), ['claude-test', 'gpt-test'])
            call.assert_called_once_with('https://agentrouter.org/v1/models', 'test-key', 'agentrouter')

    def test_claude_uses_native_messages_at_agentrouter(self):
        response = {'stop_reason': 'tool_use', 'content': [{'type': 'tool_use', 'name': 'submit_review', 'input': {'findings': []}}]}
        with patch('bugmind.providers.request_json', return_value=response) as call:
            self.assertEqual(BYOKReviewer('agentrouter', 'test-key', 'claude-test').review({'files': []}, []), [])
            self.assertEqual(call.call_args.args[0], 'https://agentrouter.org/v1/messages')
            self.assertEqual(call.call_args.args[2], 'agentrouter')

    def test_other_models_use_chat_completions(self):
        with patch('bugmind.providers.request_json', return_value={'choices': [{'finish_reason': 'stop', 'message': {'content': '{"findings": []}'}}]}) as call:
            self.assertEqual(BYOKReviewer('agentrouter', 'test-key', 'gpt-test').review({'files': []}, []), [])
            self.assertEqual(call.call_args.args[0], 'https://agentrouter.org/v1/chat/completions')


if __name__ == '__main__':
    unittest.main()
