"""Fetch pinned, public Vosk/JNA binaries and the bundled Chinese speech model."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib
import json
import urllib.request
import urllib.error
import zipfile

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'build-tools/voice'
OUT.mkdir(parents=True,exist_ok=True)
PACKAGES=[
    ('vosk-android-0.3.75.aar','https://repo.maven.apache.org/maven2/com/alphacephei/vosk-android/0.3.75/vosk-android-0.3.75.aar'),
    ('jna-5.18.1.aar','https://repo.maven.apache.org/maven2/net/java/dev/jna/jna/5.18.1/jna-5.18.1.aar'),
    ('vosk-model-small-cn-0.22.zip','https://alphacephei.com/vosk/models/vosk-model-small-cn-0.22.zip')
]
LOCK=OUT/'voice-dependencies.json'
old={item['filename']:item for item in json.loads(LOCK.read_text(encoding='utf-8'))} if LOCK.exists() else {}
def fetch(package):
    name,url=package;target=OUT/name
    if not target.exists():
        temporary=target.with_suffix(target.suffix+'.download')
        with urllib.request.urlopen(url,timeout=60) as response,temporary.open('wb') as dest:
            while True:
                chunk=response.read(1024*1024)
                if not chunk:break
                dest.write(chunk)
        temporary.replace(target)
    digest=hashlib.sha256(target.read_bytes()).hexdigest()
    if name in old and old[name]['sha256']!=digest:raise RuntimeError('Hash mismatch: '+name)
    if name.endswith('.aar'):
        try:
            expected=urllib.request.urlopen(url+'.sha256',timeout=30).read().decode().strip().split()[0]
            if digest!=expected:raise RuntimeError('Maven SHA256 mismatch: '+name)
        except urllib.error.HTTPError as error:
            if error.code!=404:raise
            expected=urllib.request.urlopen(url+'.sha1',timeout=30).read().decode().strip().split()[0]
            if hashlib.sha1(target.read_bytes()).hexdigest()!=expected:raise RuntimeError('Maven SHA1 mismatch: '+name)
    with zipfile.ZipFile(target) as archive:
        if archive.testzip():raise RuntimeError('Invalid archive: '+name)
    result={'filename':name,'url':url,'bytes':target.stat().st_size,'sha256':digest}
    print('READY',name,result['bytes'],flush=True)
    return result
with ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(fetch,PACKAGES))
LOCK.write_text(json.dumps(results,indent=2)+'\n',encoding='utf-8')
for name,prefix in [('vosk-android-0.3.75.aar','vosk'),('jna-5.18.1.aar','jna')]:
    with zipfile.ZipFile(OUT/name) as archive:
        (OUT/f'{prefix}-classes.jar').write_bytes(archive.read('classes.jar'))
        for entry in archive.namelist():
            if entry.startswith(('jni/arm64-v8a/','jni/x86_64/')) and entry.endswith('.so'):
                target=OUT/entry;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(archive.read(entry))
print('VOICE_DEPENDENCIES_READY',flush=True)
