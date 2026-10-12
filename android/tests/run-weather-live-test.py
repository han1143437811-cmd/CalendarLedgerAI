"""Read-only provider integration through the real APK, on the isolated emulator."""
import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[2]
RUNTIME = Path(json.loads((ROOT/'build-tools/runtime-location.json').read_text(encoding='utf-8-sig'))['directory'])
ADB = RUNTIME/'sdk/platform-tools/adb.exe'
OUT = ROOT/'prototype/qa'
VERSION = '0.3.3'

def adb(*args, binary=False, timeout=60):
    result=subprocess.run([str(ADB),'-s','emulator-5580',*args],capture_output=True,timeout=timeout)
    if result.returncode: raise RuntimeError(result.stderr.decode(errors='replace'))
    return result.stdout if binary else result.stdout.decode('utf-8',errors='replace').strip()

report={'passed':False,'version':VERSION,'actualSamsungPhone':False,'apiKeyUsed':False,'responses':'real Open-Meteo HTTPS'}
try:
    assert adb('shell','getprop','ro.kernel.qemu')=='1'
    assert adb('shell','getprop','sys.boot_completed')=='1'
    assert 'versionName='+VERSION in adb('shell','dumpsys','package','org.calendarledger.preview')
    previous_airplane=adb('shell','settings','get','global','airplane_mode_on')
    previous_wifi=adb('shell','settings','get','global','wifi_on')
    adb('shell','am','force-stop','org.calendarledger.preview')
    adb('shell','cmd','connectivity','airplane-mode','disable')
    adb('shell','svc','wifi','enable')
    # Offline widget QA deliberately disables networking. Wait for the emulator's
    # restored Wi-Fi default route before starting the real provider check.
    deadline=time.monotonic()+30
    while time.monotonic()<deadline:
        connectivity=adb('shell','dumpsys','connectivity')
        default=next((line.strip() for line in connectivity.splitlines() if line.strip().startswith('Active default network:')),'')
        if default and not default.endswith('none'):break
        time.sleep(.4)
    assert default and not default.endswith('none'),'Emulator Wi-Fi default network did not become ready.'
    report['defaultNetworkReady']=True
    output=adb('shell','am','instrument','-w','-e','phase','live-weather','org.calendarledger.preview.test/.WidgetRuntimeTest',timeout=75)
    (OUT/f'weather-native-live-v{VERSION}.txt').write_text(output,encoding='utf-8')
    result=json.loads(next(line.split('result=',1)[1] for line in output.splitlines() if line.startswith('INSTRUMENTATION_RESULT: result=')))
    report['native']=result
    assert result['passed'],result.get('error','Weather native integration failed')
    for name in ['widget-weather-live','app-weather-live']:
        png=adb('exec-out','cat',f'/sdcard/Android/data/org.calendarledger.preview/files/qa-{name}-v{VERSION}.png',binary=True)
        assert png.startswith(b'\x89PNG')
        (OUT/f'android-{name}-v{VERSION}.png').write_bytes(png)
    path=adb('shell','pm','path','org.calendarledger.preview').splitlines()[0].removeprefix('package:')
    report['apkSha256']=hashlib.sha256(adb('exec-out','cat',path,binary=True)).hexdigest()
    assert report['apkSha256']==hashlib.sha256((ROOT/f'dist/CalendarLedgerAI-v{VERSION}.apk').read_bytes()).hexdigest()
    report['passed']=True
except Exception as error: report['error']=str(error)
finally:
    if 'previous_airplane' in locals():
        adb('shell','cmd','connectivity','airplane-mode','enable' if previous_airplane=='1' else 'disable')
        adb('shell','svc','wifi','enable' if previous_wifi=='1' else 'disable')
    (OUT/f'weather-native-live-v{VERSION}.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
if not report['passed']:sys.exit(1)
