"""Download official Android runtime test tools into an isolated ASCII temp path."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import hashlib, json, tempfile, urllib.request, xml.etree.ElementTree as ET, zipfile

project = Path(__file__).resolve().parent.parent
runtime = Path(tempfile.gettempdir()) / 'calendarledger-runtime'
runtime.mkdir(exist_ok=True)
def find_package(repository, name, prefix):
    for node in ET.parse(repository).getroot():
        if not node.tag.endswith('remotePackage') or node.attrib.get('path') != name:
            continue
        channel = next((n.attrib.get('ref') for n in node if n.tag.endswith('channelRef')), None)
        if channel not in (None, 'channel-0'):
            continue
        for archive in node.iter():
            if not archive.tag.endswith('archive'):
                continue
            host = next((n.text for n in archive if n.tag.endswith('host-os')), None)
            if host not in (None, 'windows'):
                continue
            fields = {n.tag.split('}')[-1]: n.text for n in archive.iter() if n.tag.endswith(('url','checksum','size'))}
            return dict(name=name, url=prefix+fields['url'], sha1=fields['checksum'], bytes=int(fields['size']))
    raise RuntimeError('No stable SDK package: '+name)
packages = [
    find_package(project/'build-tools/android-repository.xml','platform-tools','https://dl.google.com/android/repository/'),
    find_package(project/'build-tools/android-repository.xml','emulator','https://dl.google.com/android/repository/'),
    find_package(project/'build-tools/aosp-images.xml','system-images;android-36;default;x86_64','https://dl.google.com/android/repository/sys-img/android/'),
]
def prepare(package):
    archive = runtime / package['url'].rsplit('/',1)[1]
    print('DOWNLOAD '+package['name']+' '+str(package['bytes']), flush=True)
    if not archive.exists() or archive.stat().st_size != package['bytes']:
        with urllib.request.urlopen(package['url'],timeout=90) as response, archive.open('wb') as output:
            while True:
                chunk = response.read(1024*1024)
                if not chunk: break
                output.write(chunk)
    digest = hashlib.sha1()
    with archive.open('rb') as source:
        for chunk in iter(lambda: source.read(1024*1024),b''): digest.update(chunk)
    if digest.hexdigest()!=package['sha1']: raise RuntimeError('SDK hash mismatch: '+package['name'])
    destination = runtime/'sdk'
    if package['name'].startswith('system-images'):
        destination /= 'system-images/android-36/default'
    marker = runtime / (package['name'].replace(';','-')+'.ready')
    if not marker.exists():
        destination.mkdir(parents=True,exist_ok=True)
        with zipfile.ZipFile(archive) as source: source.extractall(destination)
        marker.write_text('sha1='+package['sha1'],encoding='ascii')
    print('READY '+package['name'],flush=True)
with ThreadPoolExecutor(max_workers=3) as pool:
    list(pool.map(prepare,packages))
(project/'build-tools/runtime-location.json').write_text(json.dumps({'directory':str(runtime),'packages':packages},indent=2),encoding='utf-8')
print('RUNTIME_READY '+str(runtime),flush=True)
