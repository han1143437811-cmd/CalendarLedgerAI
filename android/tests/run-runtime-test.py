"""Test delivery APKs on this task's disposable emulator, never a USB phone."""
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
OUT.mkdir(exist_ok=True)

def adb(*args, timeout=60, binary=False):
    result = subprocess.run([str(ADB), '-s', SERIAL, *args], capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(result.stderr.decode('utf-8', errors='replace') + result.stdout.decode('utf-8', errors='replace'))
    return result.stdout if binary else result.stdout.decode('utf-8', errors='replace').strip()

def install(source, name):
    staged = RUNTIME / name
    shutil.copy2(source, staged)
    text = adb('install', '-r', str(staged))
    if 'Success' not in text:
        raise AssertionError(text)
    print('INSTALL', name, 'SUCCESS', flush=True)

def instrument(phase):
    output = adb('shell', 'am', 'instrument', '-w', '-e', 'phase', phase, 'org.calendarledger.preview.test/.OfflineStartupTest')
    (OUT / f'android-{phase}-instrumentation.txt').write_text(output, encoding='utf-8')
    lines = [line.split('result=', 1)[1] for line in output.splitlines() if line.startswith('INSTRUMENTATION_RESULT: result=')]
    if not lines:
        raise AssertionError(output)
    result = json.loads(lines[-1])
    print('ANDROID_PHASE', phase, json.dumps(result, ensure_ascii=False), flush=True)
    return result

def screenshot(name):
    adb('shell', 'am', 'force-stop', 'org.calendarledger.preview')
    adb('shell', 'am', 'start', '-n', 'org.calendarledger.preview/.MainActivity')
    time.sleep(4)
    (OUT / name).write_bytes(adb('exec-out', 'screencap', '-p', binary=True))

report = {'passed': False, 'device': SERIAL, 'actualSamsungPhone': False, 'network': 'airplane mode, Wi-Fi and mobile data disabled'}
try:
    assert adb('shell', 'getprop', 'sys.boot_completed') == '1'
    adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'enable')
    adb('shell', 'svc', 'wifi', 'disable')
    adb('shell', 'svc', 'data', 'disable')
    report['airplaneMode'] = adb('shell', 'settings', 'get', 'global', 'airplane_mode_on')
    # This serial is a disposable test emulator. Reset only the synthetic test
    # app data so the baseline -> repaired upgrade can be repeated reliably.
    if 'org.calendarledger.preview' in adb('shell', 'pm', 'list', 'packages', 'org.calendarledger.preview'):
        adb('uninstall', 'org.calendarledger.preview')
    install(PROJECT / 'dist/CalendarLedgerAI-v0.1.0.apk', 'baseline.apk')
    install(PROJECT / 'android/build/runtime-test.apk', 'runtime-test.apk')
    report['baseline'] = instrument('baseline')
    screenshot('android-v0.1.0-startup.png')
    adb('shell', 'am', 'force-stop', 'org.calendarledger.preview')
    install(PROJECT / 'dist/CalendarLedgerAI-v0.1.1.apk', 'repaired.apk')
    report['sameSignatureUpgrade'] = True
    report['offline'] = instrument('offline')
    if not report['offline'].get('passed'):
        raise AssertionError(report['offline'].get('error', 'Offline checks failed'))
    screenshot('android-v0.1.1-offline.png')
    adb('shell', 'am', 'force-stop', 'org.calendarledger.preview')
    report['persistence'] = instrument('persistence')
    if not report['persistence'].get('passed'):
        raise AssertionError(report['persistence'].get('error', 'Persistence checks failed'))
    screenshot('android-v0.1.1-reopened.png')
    report['passed'] = True
except Exception as error:
    report['error'] = str(error)
finally:
    (OUT / 'android-runtime-results.json').write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
    print('ANDROID_RUNTIME_RESULT', json.dumps(report, ensure_ascii=False), flush=True)
if not report['passed']:
    raise SystemExit(1)
