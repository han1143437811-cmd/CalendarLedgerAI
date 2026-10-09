"""Validate v0.1.2 -> v0.2.0 on our disposable emulator, with fixture speech/API."""
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
PROJECT = Path(__file__).resolve().parents[2]
RUNTIME = Path(json.loads((PROJECT/'build-tools/runtime-location.json').read_text(encoding='utf-8-sig'))['directory'])
ADB = RUNTIME/'sdk/platform-tools/adb.exe'
SERIAL = 'emulator-5580'
OUT = PROJECT/'prototype/qa'
OUT.mkdir(exist_ok=True)
def adb(*args, timeout=60, binary=False):
    result=subprocess.run([str(ADB),'-s',SERIAL,*args],capture_output=True,timeout=timeout)
    if result.returncode: raise RuntimeError(result.stderr.decode('utf-8',errors='replace')+result.stdout.decode('utf-8',errors='replace'))
    return result.stdout if binary else result.stdout.decode('utf-8',errors='replace').strip()
def install(source,name):
    target=RUNTIME/name
    shutil.copy2(source,target)
    assert 'Success' in adb('install','-r',str(target)),name
    print('INSTALLED',name,flush=True)
def phase(name):
    output=adb('shell','am','instrument','-w','-e','phase',name,'org.calendarledger.preview.test/.OfflineStartupTest',timeout=120)
    (OUT/f'android-v0.2.0-{name}.txt').write_text(output,encoding='utf-8')
    result=json.loads([line.split('result=',1)[1] for line in output.splitlines() if line.startswith('INSTRUMENTATION_RESULT: result=')][-1])
    print('ANDROID_PHASE',name,'passed=',result.get('passed'),'checks=',len(result.get('findings',[])),'error=',result.get('error',''),flush=True)
    if not result.get('passed'): raise AssertionError(result.get('error',name))
    return result
report={'passed':False,'version':'0.2.0','device':SERIAL,'actualSamsungPhone':False,'realDeepSeekKeyUsed':False,'speechRecognition':'fixture service, no real audio recognition'}
previous_service=None
try:
    assert adb('shell','getprop','sys.boot_completed')=='1'
    previous_service=adb('shell','settings','get','secure','voice_recognition_service')
    adb('shell','cmd','connectivity','airplane-mode','enable')
    adb('shell','svc','wifi','disable');adb('shell','svc','data','disable')
    adb('shell','settings','put','secure','show_ime_with_hard_keyboard','1')
    # This fixed serial is the isolated synthetic test emulator created for the project.
    if 'org.calendarledger.preview' in adb('shell','pm','list','packages','org.calendarledger.preview'):
        adb('uninstall','org.calendarledger.preview')
    install(PROJECT/'dist/CalendarLedgerAI-v0.1.2.apk','v020-upgrade-baseline.apk')
    install(PROJECT/'android/build/runtime-test.apk','v020-runtime-test.apk')
    report['baseline']=phase('upgrade-baseline')
    adb('shell','am','force-stop','org.calendarledger.preview')
    install(PROJECT/'dist/CalendarLedgerAI-v0.2.0.apk','v020-delivery.apk')
    report['sameSignatureUpgrade']=True
    report['chat']=phase('chat')
    keyboard=adb('exec-out','cat','/sdcard/Android/data/org.calendarledger.preview/files/qa-chat-keyboard-v0.2.0.png',binary=True)
    (OUT/'android-chat-keyboard-v0.2.0.png').write_bytes(keyboard)
    for name in ('offline','persistence'):
        adb('shell','am','force-stop','org.calendarledger.preview')
        report[name]=phase(name)
    adb('shell','am','force-stop','org.calendarledger.preview')
    adb('shell','pm','grant','org.calendarledger.preview','android.permission.RECORD_AUDIO')
    adb('shell','pm','grant','org.calendarledger.preview.test','android.permission.RECORD_AUDIO')
    adb('shell','settings','put','secure','voice_recognition_service','org.calendarledger.preview.test/.FixtureRecognitionService')
    report['multimodal']=phase('multimodal')
    for name in ('image','voice'):
        data=adb('exec-out','cat',f'/sdcard/Android/data/org.calendarledger.preview/files/qa-{name}-v0.2.0.png',binary=True)
        assert data.startswith(b'\x89PNG'),name
        (OUT/f'android-{name}-v0.2.0.png').write_bytes(data)
    adb('shell','am','force-stop','org.calendarledger.preview')
    report['reopened']=phase('persistence')
    report['androidChecks']=sum(len(report[name].get('findings',[])) for name in ('chat','offline','persistence','multimodal','reopened'))
    report['passed']=True
except Exception as error:
    report['error']=str(error)
finally:
    if previous_service is not None:
        if previous_service=='null': adb('shell','settings','delete','secure','voice_recognition_service')
        else: adb('shell','settings','put','secure','voice_recognition_service',previous_service)
    (OUT/'android-v0.2.0-runtime-results.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
    print('ANDROID_RESULT',json.dumps({key:report.get(key) for key in ('passed','version','androidChecks','error')},ensure_ascii=False),flush=True)
if not report['passed']: raise SystemExit(1)
