from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
import runpy
import secrets
import smtplib
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).with_name('configure-resend.py')


class Terminal(StringIO):
    def isatty(self):
        return True


class ConfigureResendTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.home = Path(self.temporary.name)
        (self.home / 'securetex').mkdir()
        self.env = self.home / 'securetex/.env'
        self.original = 'REGISTRATION_ENABLED=false\nGOOGLE_CLIENT_ID=conservar\nMICROSOFT_CLIENT_ID=conservar\nSMTP_HOST=anterior\n'
        self.env.write_text(self.original)
        self.env.chmod(0o600)

    def tearDown(self):
        self.temporary.cleanup()

    def invoke(self, key, fail_auth=False):
        output = StringIO()
        with patch('sys.stdin', Terminal()), patch.object(Path, 'home', return_value=self.home), \
             patch('getpass.getpass', return_value=key), patch('smtplib.SMTP_SSL') as transport, redirect_stdout(output):
            if fail_auth:
                transport.return_value.__enter__.return_value.login.side_effect = smtplib.SMTPAuthenticationError(535, b'Prueba')
            runpy.run_path(str(SCRIPT), run_name='__main__')
        return output.getvalue(), transport

    def test_preserves_other_credentials_and_keeps_registration_closed(self):
        key = 're_' + secrets.token_urlsafe(32)
        output, transport = self.invoke(key)
        self.assertNotIn(key, output)
        self.assertIn('REGISTRATION_ENABLED=false\n', self.env.read_text())
        self.assertIn('MICROSOFT_CLIENT_ID=conservar\n', self.env.read_text())
        self.assertIn('GOOGLE_CLIENT_ID=conservar\n', self.env.read_text())
        self.assertIn('no-reply@securetex.dayle.dev', self.env.read_text())
        self.assertEqual(self.env.read_text().count('SMTP_HOST='), 1)
        self.assertEqual(self.env.stat().st_mode & 0o777, 0o600)
        self.assertFalse(self.env.with_name('.env.smtp-next').exists())
        self.assertEqual(transport.call_args.args, ('smtp.resend.com', 465))

    def test_failed_authentication_preserves_the_environment(self):
        with self.assertRaises(SystemExit):
            self.invoke('re_' + secrets.token_urlsafe(32), fail_auth=True)
        self.assertEqual(self.env.read_text(), self.original)

    def test_invalid_key_preserves_the_environment(self):
        with self.assertRaises(SystemExit):
            self.invoke('')
        self.assertEqual(self.env.read_text(), self.original)

    def test_rejects_insecure_permissions(self):
        self.env.chmod(0o644)
        with self.assertRaises(SystemExit):
            self.invoke('re_' + secrets.token_urlsafe(32))
        self.assertEqual(self.env.read_text(), self.original)


if __name__ == '__main__':
    unittest.main()
