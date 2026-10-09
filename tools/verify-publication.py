"""Validate the tracked publication payload without printing credential values."""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import zipfile

root = Path(__file__).resolve().parents[1]
original_apk_hash = 'cb7e32c66ec8b9e7d1a4bc5d36843e457901c83b61f8a089eddbc519128580ba'
tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode('utf-8').split('\0')
tracked = [name for name in tracked if name]
assert tracked, 'Stage the reviewed publication files before verifying.'
forbidden_parts = ('signing', 'node_modules', 'sdk', 'backups', 'release-assets')
secret_patterns = (
    re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    re.compile(rb'gh[pousr]_[A-Za-z0-9_]{25,}'),
    re.compile(rb'github_pat_[A-Za-z0-9_]{35,}'),
    re.compile(rb'sk-[A-Za-z0-9]{28,}'),
)
findings = []
for name in tracked:
    parts = Path(name).parts
    assert not any(part in forbidden_parts or part.startswith('browser-profile') for part in parts), f'Forbidden path: {name}'
    assert Path(name).suffix.lower() not in ('.apk', '.p12', '.jks', '.keystore', '.aar', '.jar'), f'Private or generated payload: {name}'
    assert Path(name).name.lower() not in ('password.txt', 'hosts.yml', '.env'), f'Credential file: {name}'
    data = (root / name).read_bytes()
    if Path(name).suffix.lower() not in ('.png', '.wav'):
        for pattern in secret_patterns:
            if pattern.search(data):
                findings.append({'file': name, 'type': 'possible credential'})
assert not findings, json.dumps(findings)
apk = root / 'release-assets/CalendarLedgerAI-v0.2.3.apk'
assert hashlib.sha256(apk.read_bytes()).hexdigest() == original_apk_hash
with zipfile.ZipFile(apk) as archive:
    assert archive.testzip() is None
assert 'LICENSE' in tracked and 'ACKNOWLEDGEMENTS.md' in tracked
assert 'prototype/THIRD_PARTY_NOTICES.txt' in tracked
assert 'prototype/vendor/lunar-LICENSE.txt' in tracked
assert 'build-tools/voice/voice-dependencies.json' in tracked
assert '向' in (root / 'ACKNOWLEDGEMENTS.md').read_text(encoding='utf-8')
print(json.dumps({'passed': True, 'trackedFiles': len(tracked), 'credentialPatternFindings': 0, 'apkHashUnchanged': True}))
