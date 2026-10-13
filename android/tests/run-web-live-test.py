"""Public search/page integration through the installed APK; no model API key."""
import hashlib,json,subprocess,sys,time
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8',errors='replace')
ROOT=Path(__file__).resolve().parents[2]
RUNTIME=Path(json.loads((ROOT/'build-tools/runtime-location.json').read_text(encoding='utf-8-sig'))['directory'])
ADB=RUNTIME/'sdk/platform-tools/adb.exe'
VERSION='0.3.8'
OUT=ROOT/'prototype/qa'
def adb(*args,binary=False,timeout=60):
    result=subprocess.run([str(ADB),'-s','emulator-5580',*args],capture_output=True,timeout=timeout)
    if result.returncode:raise RuntimeError(result.stderr.decode(errors='replace'))
    return result.stdout if binary else result.stdout.decode('utf-8',errors='replace').strip()
report={'passed':False,'version':VERSION,'actualSamsungPhone':False,'apiKeyUsed':False,'actualPublicNetwork':True}
try:
    assert adb('shell','getprop','ro.kernel.qemu')=='1'
    assert adb('emu','avd','name').splitlines()[0]=='CalendarLedger_API36'
    assert adb('shell','getprop','sys.boot_completed')=='1'
    assert 'versionName='+VERSION in adb('shell','dumpsys','package','org.calendarledger.preview')
    previous_airplane=adb('shell','settings','get','global','airplane_mode_on')
    previous_wifi=adb('shell','settings','get','global','wifi_on')
    adb('shell','am','force-stop','org.calendarledger.preview')
    adb('shell','cmd','connectivity','airplane-mode','disable');adb('shell','svc','wifi','enable')
    deadline=time.monotonic()+30
    while time.monotonic()<deadline:
        default=next((line.strip() for line in adb('shell','dumpsys','connectivity').splitlines() if line.strip().startswith('Active default network:')),'')
        if default and not default.endswith('none'):break
        time.sleep(.4)
    assert default and not default.endswith('none'),'Isolated emulator network unavailable'
    output=adb('shell','am','instrument','-w','-e','phase','live-web','org.calendarledger.preview.test/.WidgetRuntimeTest',timeout=150)
    (OUT/f'web-native-live-v{VERSION}.txt').write_text(output,encoding='utf-8')
    result=json.loads(next(line.split('result=',1)[1] for line in output.splitlines() if line.startswith('INSTRUMENTATION_RESULT: result=')))
    report['native']=result
    assert result['passed'],result.get('error','Public web integration failed')
    apk_path=adb('shell','pm','path','org.calendarledger.preview').splitlines()[0].removeprefix('package:')
    report['apkSha256']=hashlib.sha256(adb('exec-out','cat',apk_path,binary=True)).hexdigest()
    assert report['apkSha256']==hashlib.sha256((ROOT/f'dist/CalendarLedgerAI-v{VERSION}.apk').read_bytes()).hexdigest()
    report['passed']=True
except Exception as error:report['error']=str(error)
finally:
    if 'previous_airplane' in locals():
        adb('shell','cmd','connectivity','airplane-mode','enable' if previous_airplane=='1' else 'disable')
        adb('shell','svc','wifi','enable' if previous_wifi=='1' else 'disable')
    (OUT/f'web-native-live-v{VERSION}.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
if not report['passed']:sys.exit(1)
