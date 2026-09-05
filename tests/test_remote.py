import argparse
import unittest
from unittest.mock import patch
from bugmind.remote import add_commands, execute_remote, select_contracts, discover
from bugmind.cloud import dashboard_url, NoRedirect
from worker.core import ReviewError

class RemoteTests(unittest.TestCase):
 def args(self, words):
  p=argparse.ArgumentParser();add_commands(p.add_subparsers(dest='command'));return p.parse_args(words)
 def test_scope_rejects_paths_outside_catalog(self):
  with self.assertRaises(ReviewError):select_contracts(['Vault.sol'],['Other.sol'])
 def test_scope_rejects_negative_index(self):
  with patch('builtins.input',return_value='0'):
   with self.assertRaises(ReviewError):select_contracts(['Vault.sol'])
 def test_scope_deduplicates(self):
  self.assertEqual(select_contracts(['Vault.sol'],['Vault.sol','Vault.sol']),['Vault.sol'])
 def test_audit_queues_draft_without_local_provider(self):
  with patch('bugmind.remote.read_config',return_value={'workspace_id':'ws','dashboard':'https://sentinel.test'}),patch('bugmind.remote.call',side_effect=[{'status':'draft'},{'status':'queued'}]) as call:
   execute_remote(self.args(['audit']))
   self.assertEqual(call.call_args.args,('/api/workspaces/ws/audit',{}))
 def test_audit_does_not_resubmit_running_job(self):
  with patch('bugmind.remote.read_config',return_value={'workspace_id':'ws','dashboard':'https://sentinel.test'}),patch('bugmind.remote.call',return_value={'status':'running'}) as call:
   execute_remote(self.args(['audit']));self.assertEqual(call.call_count,1)
 def test_workspace_draft_does_not_start_review(self):
  with patch('bugmind.remote.discover',return_value=('https://github.com/a/b','main',['V.sol'])),patch('bugmind.remote.call',side_effect=[{'workspaces':[]},{'id':'ws'}]) as call,patch('bugmind.remote.activate') as activate:
   execute_remote(self.args(['workspace','create','https://github.com/a/b','--contracts','V.sol']))
   self.assertTrue(call.call_args.args[1]['draft']);activate.assert_called_once_with('ws')
 def test_monitoring_is_not_falsely_enabled(self):
  with self.assertRaises(ReviewError):execute_remote(self.args(['watch','enable']))
 def test_rejects_missing_host_and_non_https(self):
  for url in ['https://','http://example.com','https://a.com/path']:
   with self.assertRaises(ReviewError):dashboard_url(url)
 def test_token_is_not_redirected(self):
  with self.assertRaises(ReviewError):NoRedirect().redirect_request(None,None,302,'',{},'https://other.test')
 def test_truncated_catalog_is_rejected(self):
  with patch('bugmind.remote.github_json',side_effect=[{'default_branch':'main'},{'truncated':True}]):
   with self.assertRaises(ReviewError):discover('https://github.com/a/b')
if __name__=='__main__':unittest.main()
