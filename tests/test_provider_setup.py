import io
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

from bugmind.cli import configure_provider, main
from worker.core import ReviewError


class ProviderSetupTests(unittest.TestCase):
    def test_numbered_setup_fetches_selected_provider_and_saves_model(self):
        output = io.StringIO()
        with patch('builtins.input', side_effect=['bad', '4', '99', '2']), patch('bugmind.cli.getpass.getpass', return_value='test-secret'), patch('bugmind.cli.list_models', return_value=['claude-a', 'claude-b']) as models, patch('bugmind.cli.save_secret') as save, patch('bugmind.cli.write_config') as write, redirect_stdout(output):
            configure_provider({'dashboard': 'https://example.test'})
        models.assert_called_once_with('anthropic', 'test-secret')
        save.assert_called_once_with('anthropic', 'test-secret')
        write.assert_called_once_with({'dashboard': 'https://example.test', 'provider': 'anthropic', 'model': 'claude-b'})
        self.assertNotIn('test-secret', output.getvalue())
        self.assertIn('Anthropic (Claude)', output.getvalue())

    def test_cancel_at_model_does_not_save_credentials_or_settings(self):
        config = {'provider': 'gemini', 'model': 'previous'}
        with patch('builtins.input', side_effect=['anthropic', 'q']), patch('bugmind.cli.getpass.getpass', return_value='test-secret'), patch('bugmind.cli.list_models', return_value=['claude-a']), patch('bugmind.cli.save_secret') as save, patch('bugmind.cli.write_config') as write, redirect_stdout(io.StringIO()):
            with self.assertRaises(KeyboardInterrupt):
                configure_provider(config)
        save.assert_not_called()
        write.assert_not_called()
        self.assertEqual(config, {'provider': 'gemini', 'model': 'previous'})

    def test_empty_key_does_not_fetch_or_save(self):
        with patch('bugmind.cli.getpass.getpass', return_value=' '), patch('bugmind.cli.list_models') as models, patch('bugmind.cli.save_secret') as save, redirect_stdout(io.StringIO()):
            with self.assertRaises(ReviewError):
                configure_provider({}, 'gemini')
        models.assert_not_called()
        save.assert_not_called()

    def test_select_provider_command_routes_to_wizard(self):
        with patch('sys.argv', ['bugmind', 'select', 'provider']), patch('bugmind.cli.read_config', return_value={}), patch('bugmind.cli.configure_provider') as configure:
            main()
        configure.assert_called_once_with({})


if __name__ == '__main__':
    unittest.main()
