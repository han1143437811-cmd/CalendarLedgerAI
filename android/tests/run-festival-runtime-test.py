"""Check the signed v0.2.0 -> v0.2.1 upgrade on the isolated project emulator."""
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8',errors='replace')
PROJECT=Path(__file__).resolve().parents[2]
RUNTIME=Path(json.loads((PROJECT/'build-tools/runtime-location.json').read_text(encoding='utf-8-sig'))['directory'])
ADB=RUNTIME/'sdk/platform-tools/adb.exe'
SERIAL='emulator-5580'
OUT=PROJECT/'prototype/qa'

def adb(*args,binary=False):
    result=subprocess.run([str(ADB),'-s',SERIAL,*args],capture_output=True,timeout=60)
    if result.returncode:raise RuntimeError(result.stdout.decode(errors='replace')+result.stderr.decode(errors='replace'))
    return result.stdout if binary else result.stdout.decode('utf-8',errors='replace').strip()

def install(source,name):
    target=RUNTIME/name;shutil.copy2(source,target)
    assert 'Success' in adb('install','-r',str(target))
    print('INSTALLED',name,flush=True)

def phase(name):
    output=adb('shell','am','instrument','-w','-e','phase',name,'org.calendarledger.preview.test/.OfflineStartupTest')
    (OUT/f'android-v0.2.1-{name}.txt').write_text(output,encoding='utf-8')
    result=json.loads([line.split('result=',1)[1] for line in output.splitlines() if line.startswith('INSTRUMENTATION_RESULT: result=')][-1])
    print('ANDROID_PHASE',name,'passed=',result.get('passed'),'checks=',len(result.get('findings',[])),flush=True)
    if not result.get('passed'):raise AssertionError(result.get('error',name))
    return result

report={'passed':False,'version':'0.2.1','device':SERIAL,'actualSamsungPhone':False,'apiKeyUsed':False}
try:
    assert adb('shell','getprop','sys.boot_completed')=='1'
    assert adb('shell','getprop','ro.kernel.qemu')=='1'
    adb('shell','cmd','connectivity','airplane-mode','enable')
    adb('shell','svc','wifi','disable');adb('shell','svc','data','disable')
    install(PROJECT/'dist/CalendarLedgerAI-v0.2.0.apk','v021-upgrade-baseline.apk')
    install(PROJECT/'android/build/runtime-test.apk','v021-runtime-test.apk')
    report['baseline']=phase('upgrade-baseline')
    adb('shell','am','force-stop','org.calendarledger.preview')
    install(PROJECT/'dist/CalendarLedgerAI-v0.2.1.apk','v021-delivery.apk')
    report['sameSignatureUpgrade']=True
    report['festivals']=phase('festivals')
    screenshot=adb('exec-out','cat','/sdcard/Android/data/org.calendarledger.preview/files/qa-festivals-v0.2.1.png',binary=True)
    assert screenshot.startswith(b'\x89PNG')
    (OUT/'android-festivals-v0.2.1.png').write_bytes(screenshot)
    adb('shell','am','force-stop','org.calendarledger.preview')
    report['reopened']=phase('festivals')
    report['androidChecks']=sum(len(report[name]['findings']) for name in ('festivals','reopened'))
    report['apkSha256']=hashlib.sha256((PROJECT/'dist/CalendarLedgerAI-v0.2.1.apk').read_bytes()).hexdigest()
    report['passed']=True
except Exception as error:
    report['error']=str(error)
finally:
    (OUT/'android-festivals-v0.2.1-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)
if not report['passed']:sys.exit(1)
