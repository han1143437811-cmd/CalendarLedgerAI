"""Check microphone authorization and actual bundled Mandarin decoder.

Only the project's disposable emulator-5580 is touched; never a USB phone.
Permission/lifecycle tests capture silence on the emulator. A separately
identified local Chinese TTS WAV tests the real native decoder, not a mock.
"""
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
PROJECT = Path(__file__).resolve().parents[2]
RUNTIME = Path(json.loads((PROJECT / 'build-tools/runtime-location.json').read_text(encoding='utf-8-sig'))['directory'])
ADB = RUNTIME / 'sdk/platform-tools/adb.exe'
SERIAL = 'emulator-5580'
PACKAGE = 'org.calendarledger.preview'
FIXTURE_SERVICE = PACKAGE + '.test/.FixtureRecognitionService'
OUT = PROJECT / 'prototype/qa'
OUT.mkdir(exist_ok=True)
APK = PROJECT / 'dist/CalendarLedgerAI-v0.2.2.apk'
REPORT = OUT / 'android-voice-v0.2.2-results.json'


def adb(*args, timeout=60, binary=False):
    response = subprocess.run([str(ADB), '-s', SERIAL, *args], capture_output=True, timeout=timeout)
    if response.returncode:
        raise RuntimeError((response.stderr + response.stdout).decode('utf-8', errors='replace'))
    return response.stdout if binary else response.stdout.decode('utf-8', errors='replace').strip()


def install(source, name):
    staged = RUNTIME / name
    shutil.copy2(source, staged)
    response = adb('install', '-r', str(staged))
    if 'Success' not in response:
        raise AssertionError(response)
    print('INSTALL', name, 'SUCCESS', flush=True)


def stop():
    adb('shell', 'am', 'force-stop', PACKAGE)


def microphone_reset():
    stop()
    adb('shell', 'pm', 'revoke', PACKAGE, 'android.permission.RECORD_AUDIO')
    adb('shell', 'pm', 'clear-permission-flags', PACKAGE, 'android.permission.RECORD_AUDIO', 'user-set', 'user-fixed')


def instrument(phase, test='VoiceRuntimeTest'):
    stop()
    output = adb('shell', 'am', 'instrument', '-w', '-e', 'phase', phase,
                 f'{PACKAGE}.test/.{test}', timeout=60)
    (OUT / f'android-voice-{phase}-instrumentation.txt').write_text(output, encoding='utf-8')
    values = [line.split('result=', 1)[1] for line in output.splitlines()
              if line.startswith('INSTRUMENTATION_RESULT: result=')]
    if not values:
        raise AssertionError(output)
    result = json.loads(values[-1])
    print('ANDROID_VOICE_PHASE', phase, json.dumps(result, ensure_ascii=False), flush=True)
    return result


report = {'passed': False, 'apk': {'filename': APK.name, 'bytes': APK.stat().st_size,
          'sha256': hashlib.sha256(APK.read_bytes()).hexdigest()}, 'device': SERIAL,
          'actualSamsungPhone': False, 'network': 'airplane mode, Wi-Fi and data off',
          'lifecycle': 'native voice hooks called by onStop/onResume explicitly simulated around real permission dialog',
          'audio': 'silent emulator AudioRecord; separate Chinese TTS PCM sent to actual bundled Vosk decoder'}
previous_service = None
try:
    assert adb('shell', 'getprop', 'ro.kernel.qemu') == '1', 'Requires disposable emulator'
    assert adb('shell', 'getprop', 'sys.boot_completed') == '1', 'Emulator not booted'
    previous_service = adb('shell', 'settings', 'get', 'secure', 'voice_recognition_service')
    adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'enable')
    adb('shell', 'svc', 'wifi', 'disable')
    adb('shell', 'svc', 'data', 'disable')
    install(PROJECT / 'android/build/runtime-test.apk', 'voice-runtime-test.apk')
    if '--skip-baseline' not in sys.argv:
        install(PROJECT / 'dist/CalendarLedgerAI-v0.2.1.apk', 'voice-baseline-v021.apk')
        adb('shell', 'settings', 'put', 'secure', 'voice_recognition_service', FIXTURE_SERVICE)
        microphone_reset()
        report['baseline'] = instrument('baseline')
        if not report['baseline']['passed']:
            raise AssertionError('Could not reproduce old permission lifecycle failure')
        report['upgradeBaseline'] = instrument('upgrade-baseline', 'OfflineStartupTest')
        if not report['upgradeBaseline']['passed']:
            raise AssertionError('Could not create known old business records')
    elif REPORT.exists():
        prior = json.loads(REPORT.read_text(encoding='utf-8'))
        for key in ('baseline', 'upgradeBaseline'):
            if key in prior:
                report[key] = prior[key]
    stop()
    install(APK, 'voice-delivery-v022.apk')
    report['sameSignatureUpgrade'] = True
    # Prove the new engine starts even when no Android recognition service exists.
    adb('shell', 'settings', 'delete', 'secure', 'voice_recognition_service')
    install(PROJECT / 'android/build/runtime-test-no-system-speech.apk', 'voice-no-system-speech-test.apk')
    for phase in ('deny', 'grant'):
        microphone_reset()
        report[phase] = instrument(phase)
        if not report[phase]['passed']:
            raise AssertionError(report[phase].get('error', f'{phase} failed'))
    sample = PROJECT / 'android/tests/audio/mandarin-ledger.wav'
    report['audioFixtureSha256'] = hashlib.sha256(sample.read_bytes()).hexdigest()
    adb('push', str(sample), f'/sdcard/Android/data/{PACKAGE}/files/mandarin-ledger.wav')
    report['pcm'] = instrument('pcm')
    if not report['pcm']['passed']:
        raise AssertionError(report['pcm'].get('error', 'PCM decoding failed'))
    for name in ('permission', 'listening', 'transcript'):
        filename = f'qa-voice-{name}-v0.2.2.png'
        adb('pull', f'/sdcard/Android/data/{PACKAGE}/files/{filename}', str(OUT / filename))
    report['checks'] = sum(len(report[key].get('findings', [])) for key in ('baseline', 'deny', 'grant', 'pcm'))
    report['passed'] = True
except Exception as error:
    report['error'] = str(error)
finally:
    if previous_service is not None:
        if previous_service == 'null':
            adb('shell', 'settings', 'delete', 'secure', 'voice_recognition_service')
        else:
            adb('shell', 'settings', 'put', 'secure', 'voice_recognition_service', previous_service)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print('ANDROID_VOICE_RESULT', json.dumps(report, ensure_ascii=False), flush=True)
if not report['passed']:
    raise SystemExit(1)
