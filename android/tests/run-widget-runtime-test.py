"""Upgrade from the published APK and exercise native widgets on an isolated emulator."""
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
VERSION='0.3.8'
BASELINE_VERSION='0.3.7'

def adb(*args,binary=False,timeout=60):
    result=subprocess.run([str(ADB),'-s',SERIAL,*args],capture_output=True,timeout=timeout)
    if result.returncode:raise RuntimeError(result.stdout.decode(errors='replace')+result.stderr.decode(errors='replace'))
    return result.stdout if binary else result.stdout.decode('utf-8',errors='replace').strip()

def install(source,name):
    target=RUNTIME/name;shutil.copy2(source,target)
    assert 'Success' in adb('install','-r',str(target))
    print('INSTALLED',name,flush=True)

def phase(name,offline_test=False):
    test='OfflineStartupTest' if offline_test else 'WidgetRuntimeTest'
    output=adb('shell','am','instrument','-w','-e','phase',name,f'org.calendarledger.preview.test/.{test}',timeout=110)
    (OUT/f'android-widget-v{VERSION}-{name}.txt').write_text(output,encoding='utf-8')
    reports=[line.split('result=',1)[1] for line in output.splitlines() if line.startswith('INSTRUMENTATION_RESULT: result=')]
    if not reports:raise AssertionError(output[-3000:])
    result=json.loads(reports[-1])
    print('ANDROID_WIDGET_PHASE',name,'passed=',result.get('passed'),'checks=',len(result.get('findings',[])),flush=True)
    if not result.get('passed'):raise AssertionError(result.get('error',name))
    return result

def screenshot(name):
    data=adb('exec-out','cat',f'/sdcard/Android/data/org.calendarledger.preview/files/qa-{name}-v{VERSION}.png',binary=True)
    assert data.startswith(b'\x89PNG')
    (OUT/f'android-{name}-v{VERSION}.png').write_bytes(data)

report={'passed':False,'version':VERSION,'device':SERIAL,'actualSamsungPhone':False,
        'apiKeyUsed':False,'host':'actual Android AppWidgetHost, test-only overlay',
        'baseline':f'published signed v{BASELINE_VERSION}','phases':{}}
try:
    assert adb('shell','getprop','sys.boot_completed')=='1'
    assert adb('shell','getprop','ro.kernel.qemu')=='1', 'Only the isolated emulator may be modified.'
    assert adb('emu','avd','name').splitlines()[0]=='CalendarLedger_API36', 'Only the named isolated test AVD may be modified.'
    resume='--resume' in sys.argv
    resume_appearance='--resume-appearance' in sys.argv
    resume_weather='--resume-weather' in sys.argv
    reuse_core=resume_appearance or resume_weather
    resume=resume or reuse_core
    installed=adb('shell','dumpsys','package','org.calendarledger.preview')
    assert f'versionName={VERSION if resume else BASELINE_VERSION}' in installed, 'Start with the published baseline or explicitly resume its already installed upgrade.'
    adb('shell','cmd','connectivity','airplane-mode','enable')
    adb('shell','svc','wifi','disable');adb('shell','svc','data','disable')
    previous_font=adb('shell','settings','get','system','font_scale')
    install(PROJECT/'android/build/runtime-test.apk','v038-runtime-test.apk')
    if reuse_core:
        previous=json.loads((OUT/f'android-widget-v{VERSION}-results.json').read_text(encoding='utf-8'))
        for name in ('baseline','widget','reopened','cold-ai','cold-date','system-font','data-projection','sparse-grid'):
            assert previous['phases'][name]['passed'], f'{name} must have already passed.'
        if resume_appearance:assert previous['phases']['weather']['passed']
        path=adb('shell','pm','path','org.calendarledger.preview').splitlines()[0].removeprefix('package:')
        installed_hash=hashlib.sha256(adb('exec-out','cat',path,binary=True)).hexdigest()
        delivery_hash=hashlib.sha256((PROJECT/f'dist/CalendarLedgerAI-v{VERSION}.apk').read_bytes()).hexdigest()
        assert installed_hash==delivery_hash, 'Completed phases must belong to the unchanged delivery APK.'
        report['phases']={name:data for name,data in previous['phases'].items() if data.get('passed')}
        report['sameSignatureUpgrade']=previous['sameSignatureUpgrade']
        report['completedPhasesApkSha256']=installed_hash
    elif resume:
        output=(OUT/f'android-widget-v{VERSION}-baseline.txt').read_text(encoding='utf-8')
        report['phases']['baseline']=json.loads([line.split('result=',1)[1] for line in output.splitlines() if line.startswith('INSTRUMENTATION_RESULT: result=')][-1])
        assert report['phases']['baseline']['passed'] and report['phases']['baseline']['version']==BASELINE_VERSION
        # Reinstall only the tested upgrade during repair; never downgrade or clear.
        adb('shell','am','force-stop','org.calendarledger.preview')
        install(PROJECT/f'dist/CalendarLedgerAI-v{VERSION}.apk','v038-delivery.apk')
    else:
        report['phases']['baseline']=phase('baseline')
        adb('shell','am','force-stop','org.calendarledger.preview')
        install(PROJECT/f'dist/CalendarLedgerAI-v{VERSION}.apk','v038-delivery.apk')
    if not reuse_core:
        report['sameSignatureUpgrade']=True
        report['phases']['widget']=phase('widget')
        for name in ('widget-large','widget-six-weeks','widget-compact','widget-dark','widget-ai-open','widget-date-open'):screenshot(name)
        for name in ('reopened','cold-ai','cold-date'):
            adb('shell','am','force-stop','org.calendarledger.preview')
            report['phases'][name]=phase(name)
        screenshot('widget-reopened')
        adb('shell','am','force-stop','org.calendarledger.preview')
        adb('shell','settings','put','system','font_scale','1.3')
        report['phases']['system-font']=phase('system-font')
        screenshot('widget-system-font')
        adb('shell','settings','put','system','font_scale',previous_font if previous_font!='null' else '1.0')
        adb('shell','am','force-stop','org.calendarledger.preview')
        report['phases']['data-projection']=phase('data-projection')
        adb('shell','am','force-stop','org.calendarledger.preview')
        report['phases']['sparse-grid']=phase('sparse-grid')
        for name in ('widget-empty','widget-one-event','widget-three-events'):screenshot(name)
    if not resume_appearance:
        adb('shell','am','force-stop','org.calendarledger.preview')
        report['phases']['weather']=phase('weather')
        for name in ('widget-weather','widget-weather-dark','widget-weather-minimum','app-weather'):screenshot(name)
        adb('shell','am','force-stop','org.calendarledger.preview')
        adb('shell','settings','put','system','font_scale','1.3')
        report['phases']['weather-system-font']=phase('weather-system-font')
        screenshot('widget-weather-minimum')
        adb('shell','settings','put','system','font_scale',previous_font if previous_font!='null' else '1.0')
    adb('shell','am','force-stop','org.calendarledger.preview')
    report['phases']['ai-operations']=phase('ai-operations')
    for name in ('widget-allocation','app-ai-memory','app-ai-context','app-model-controls','app-corrections'):screenshot(name)
    adb('shell','am','force-stop','org.calendarledger.preview')
    report['phases']['web-tools']=phase('web-tools')
    adb('shell','am','force-stop','org.calendarledger.preview')
    report['phases']['chat-api']=phase('chat-api')
    adb('shell','am','force-stop','org.calendarledger.preview')
    report['phases']['conversation']=phase('conversation')
    screenshot('app-conversation');screenshot('app-chat-model-picker')
    for name in ('app-chat-branches','app-newapi-settings','app-branch-chat'):screenshot(name)
    report['phases']['appearance']=phase('appearance')
    for name in ('app-calendar','app-ledger','app-reports','app-more','app-chat','app-settings'):screenshot(name)
    report['nativeWidgetChecks']=sum(len(result.get('findings',[])) for result in report['phases'].values())
    report['apkSha256']=hashlib.sha256((PROJECT/f'dist/CalendarLedgerAI-v{VERSION}.apk').read_bytes()).hexdigest()
    path=adb('shell','pm','path','org.calendarledger.preview').splitlines()[0].removeprefix('package:')
    assert hashlib.sha256(adb('exec-out','cat',path,binary=True)).hexdigest()==report['apkSha256'], 'The installed and delivered APK must be byte-identical.'
    report['passed']=True
except Exception as error:
    report['error']=str(error)
finally:
    if 'previous_font' in locals():
        adb('shell','settings','put','system','font_scale',previous_font if previous_font!='null' else '1.0')
    (OUT/f'android-widget-v{VERSION}-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)
if not report['passed']:sys.exit(1)
