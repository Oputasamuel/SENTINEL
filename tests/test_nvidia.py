import unittest
from unittest.mock import patch

from bugmind.providers import BYOKReviewer, ground_nvidia_evidence, list_models


class NvidiaProviderTests(unittest.TestCase):
    def test_only_close_quote_drift_is_grounded(self):
        content = '{"project":{"files":[{"path":"A.sol","content":"x();\\nbalances[msg.sender] = 0;"}]}}'
        close = {'findings': [{'file': 'A.sol', 'line': 2, 'evidence': '2: balances[msg.sender] = 0;'}]}
        self.assertEqual(ground_nvidia_evidence(close, content)['findings'][0]['evidence'], 'balances[msg.sender] = 0;')
        distant = {'findings': [{'file': 'A.sol', 'line': 2, 'evidence': 'external call sends all funds'}]}
        self.assertEqual(ground_nvidia_evidence(distant, content)['findings'][0]['evidence'], 'external call sends all funds')

    @patch('bugmind.providers.request_json')
    def test_catalog_uses_nvidia_endpoint(self, request):
        request.return_value = {'data': [{'id': 'deepseek-ai/deepseek-v4-pro-0813'}]}
        self.assertEqual(list_models('nvidia', 'key'), ['deepseek-ai/deepseek-v4-pro-0813'])
        request.assert_called_once_with('https://integrate.api.nvidia.com/v1/models', 'key', 'nvidia')

    @patch('bugmind.providers.request_stream_json')
    def test_review_uses_openai_compatible_streaming_endpoint(self, request):
        request.return_value = {'choices': [{'finish_reason': 'stop', 'message': {'content': '{"findings": []}'}}]}
        result = BYOKReviewer('nvidia', 'key', 'deepseek-ai/deepseek-v4-pro-0813').review({'files': []}, [])
        self.assertEqual(result, [])
        self.assertEqual(request.call_args.args[0], 'https://integrate.api.nvidia.com/v1/chat/completions')
        self.assertEqual(request.call_args.args[2], 'nvidia')
        self.assertEqual(request.call_args.args[3]['max_tokens'], 16000)
        self.assertFalse(request.call_args.args[3]['chat_template_kwargs']['enable_thinking'])
        self.assertNotIn('response_format', request.call_args.args[3])


if __name__ == '__main__':
    unittest.main()
