"""Pruebas de carga de secretos sintéticos; no requieren red ni cuentas externas."""
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
import os
import runpy
import secrets
import shlex
import tempfile
import unittest
from unittest.mock import patch
import uuid

SCRIPT = Path(__file__).with_name('configure-oidc.py')


class Terminal(StringIO):
    def isatty(self):
        return True


class ConfigureOidcTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.home = Path(self.temporary.name)
        (self.home / 'securetex').mkdir()
        self.env = self.home / 'securetex/.env'
        self.original = 'REGISTRATION_ENABLED=false\nGOOGLE_CLIENT_ID=conservar\nMICROSOFT_CLIENT_ID=anterior\n'
        self.env.write_text(self.original)
        self.env.chmod(0o600)

    def tearDown(self):
        self.temporary.cleanup()

    def invoke(self, provider, client_id, secret):
        output = StringIO()
        with patch('sys.argv', [str(SCRIPT), provider]), patch('sys.stdin', Terminal()), \
             patch.object(Path, 'home', return_value=self.home), patch('builtins.input', return_value=client_id), \
             patch('getpass.getpass', return_value=secret), redirect_stdout(output):
            runpy.run_path(str(SCRIPT), run_name='__main__')
        return output.getvalue()

    def test_microsoft_replaces_only_its_fields_and_hides_the_secret(self):
        secret = secrets.token_urlsafe(32)
        client_id = str(uuid.uuid4())
        output = self.invoke('microsoft', client_id, secret)
        content = self.env.read_text()
        self.assertNotIn(secret, output)
        self.assertIn('REGISTRATION_ENABLED=false\n', content)
        self.assertIn('GOOGLE_CLIENT_ID=conservar\n', content)
        self.assertEqual(content.count('MICROSOFT_CLIENT_ID='), 1)
        self.assertIn('MICROSOFT_TENANT=common\n', content)
        self.assertIn('MICROSOFT_CLIENT_SECRET=' + shlex.quote(secret), content)
        self.assertEqual(os.stat(self.env).st_mode & 0o777, 0o600)
        self.assertFalse(self.env.with_name('.env.oidc-next').exists())

    def test_google_preserves_microsoft(self):
        self.invoke('google', '123-example.apps.googleusercontent.com', secrets.token_urlsafe(32))
        self.assertIn('MICROSOFT_CLIENT_ID=anterior\n', self.env.read_text())
        self.assertNotIn('MICROSOFT_TENANT=', self.env.read_text())

    def test_invalid_id_changes_nothing(self):
        with self.assertRaises(SystemExit):
            self.invoke('microsoft', '../ruta', secrets.token_urlsafe(32))
        self.assertEqual(self.env.read_text(), self.original)

    def test_invalid_secret_changes_nothing(self):
        with self.assertRaises(SystemExit):
            self.invoke('microsoft', str(uuid.uuid4()), '')
        self.assertEqual(self.env.read_text(), self.original)

    def test_insecure_permissions_are_rejected(self):
        self.env.chmod(0o644)
        with self.assertRaises(SystemExit):
            self.invoke('microsoft', str(uuid.uuid4()), secrets.token_urlsafe(32))
        self.assertEqual(self.env.read_text(), self.original)


if __name__ == '__main__':
    unittest.main()
