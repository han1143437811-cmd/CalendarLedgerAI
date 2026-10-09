"""Reproduce chat replacement, upgrade, and test only our disposable emulator."""
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
PROJECT = Path(__file__).resolve().parents[2]
RUNTIME = Path(json.loads((PROJECT / 'build-tools/runtime-location.json').read_text(encoding='utf-8-sig'))['directory'])
ADB = RUNTIME / 'sdk/platform-tools/adb.exe'
SERIAL = 'emulator-5580'
OUT = PROJECT / 'prototype/qa'


def adb(*args, timeout=60, binary=False):
    result = subprocess.run([str(ADB), '-s', SERIAL, *args], capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(result.stderr.decode('utf-8', errors='replace') + result.stdout.decode('utf-8', errors='replace'))
    return result.stdout if binary else result.stdout.decode('utf-8', errors='replace').strip()


def install(source, name):
    staged = RUNTIME / name
    shutil.copy2(source, staged)
    output = adb('install', '-r', str(staged))
    if 'Success' not in output:
        raise AssertionError(output)
    print('INSTALL', name, 'SUCCESS', flush=True)


def instrument(phase):
    output = adb('shell', 'am', 'instrument', '-w', '-e', 'phase', phase,
                 'org.calendarledger.preview.test/.OfflineStartupTest', timeout=90)
    (OUT / f'android-v0.1.2-{phase}-instrumentation.txt').write_text(output, encoding='utf-8')
    lines = [line.split('result=', 1)[1] for line in output.splitlines()
             if line.startswith('INSTRUMENTATION_RESULT: result=')]
    if not lines:
        raise AssertionError(output)
    result = json.loads(lines[-1])
    print('ANDROID_PHASE', phase, 'passed=', result.get('passed'),
          'reproduced=', result.get('reproduced'), 'checks=', len(result.get('findings', [])),
          'error=', result.get('error', ''), flush=True)
    return result


report = {'passed': False, 'device': SERIAL, 'actualSamsungPhone': False,
          'version': '0.1.2', 'network': 'airplane mode, Wi-Fi and mobile data disabled'}
try:
    OUT.mkdir(exist_ok=True)
    assert adb('shell', 'getprop', 'sys.boot_completed') == '1'
    adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'enable')
    adb('shell', 'svc', 'wifi', 'disable')
    adb('shell', 'svc', 'data', 'disable')
    adb('shell', 'settings', 'put', 'secure', 'show_ime_with_hard_keyboard', '1')
    packages = adb('shell', 'dumpsys', 'package', 'org.calendarledger.preview')
    if 'versionName=0.1.2' in packages:
        # This fixed serial is our synthetic QA emulator; never target a USB phone.
        adb('uninstall', 'org.calendarledger.preview')
    install(PROJECT / 'dist/CalendarLedgerAI-v0.1.1.apk', 'chat-baseline.apk')
    install(PROJECT / 'android/build/runtime-test.apk', 'chat-runtime-test.apk')
    report['baseline'] = instrument('chat-baseline')
    if not report['baseline'].get('reproduced'):
        raise AssertionError('Old version chat replacement was not reproduced')
    adb('shell', 'am', 'force-stop', 'org.calendarledger.preview')
    install(PROJECT / 'dist/CalendarLedgerAI-v0.1.2.apk', 'chat-repaired.apk')
    report['sameSignatureUpgrade'] = True
    for phase in ('chat', 'offline', 'persistence'):
        report[phase] = instrument(phase)
        if not report[phase].get('passed'):
            raise AssertionError(report[phase].get('error', phase + ' checks failed'))
        if phase == 'chat':
            screenshot = adb('exec-out', 'cat', '/sdcard/Android/data/org.calendarledger.preview/files/qa-chat-keyboard-v0.1.2.png', binary=True)
            if not screenshot.startswith(b'\x89PNG\r\n\x1a\n'):
                raise AssertionError('Actual Android screenshot could not be retrieved')
            (OUT / 'android-chat-keyboard-v0.1.2.png').write_bytes(screenshot)
        adb('shell', 'am', 'force-stop', 'org.calendarledger.preview')
    report['androidChecks'] = sum(len(report[phase]['findings']) for phase in ('chat', 'offline', 'persistence'))
    report['passed'] = True
except Exception as error:
    report['error'] = str(error)
finally:
    (OUT / 'android-chat-runtime-results.json').write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
    print('ANDROID_CHAT_RESULT', json.dumps({k: report[k] for k in ('passed', 'version', 'device')}
          | {'checks': report.get('androidChecks', 0), 'error': report.get('error', '')}), flush=True)
if not report['passed']:
    raise SystemExit(1)
