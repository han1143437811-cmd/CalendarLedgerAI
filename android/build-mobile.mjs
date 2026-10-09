import {build} from '../build-tools/js/node_modules/esbuild/lib/main.js';
import {readFile,mkdir,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const project=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export async function makeMobileDocument(){
  const prototype=path.join(project,'prototype');
  const [css,icon,result]=await Promise.all([
    readFile(path.join(prototype,'styles.css'),'utf8'),
    readFile(path.join(prototype,'icon.svg')),
    build({entryPoints:[path.join(prototype,'app.mjs')],bundle:true,write:false,format:'iife',platform:'browser',target:'chrome105',charset:'utf8',minify:false,legalComments:'none'})
  ]);
  const holidays={};for(const name of await readdir(path.join(prototype,'holidays'))){if(/^\d{4}\.json$/.test(name))holidays[name.slice(0,4)]=JSON.parse(await readFile(path.join(prototype,'holidays',name),'utf8'));}
  const iconURL='data:image/svg+xml;base64,'+icon.toString('base64');
  const script=result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
  const seed=JSON.stringify(holidays).replace(/</g,'\\u003c');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#ffffff"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'none'; base-uri 'self'; form-action 'self'"><title>日历账本 AI</title><link rel="icon" href="${iconURL}"><style>${css.replace(/<\/style/gi,'<\\/style')}</style></head><body><div id="app"><p style="padding:32px;color:#64748b">正在打开日历账本…</p></div><div id="modal-root"></div><div id="toast" role="status" aria-live="polite"></div><script>globalThis.CALENDAR_APP_ICON=${JSON.stringify(iconURL)};globalThis.CALENDAR_BUNDLED_HOLIDAYS=${seed};addEventListener('error',function(e){if(!globalThis.calendarLedgerPreview){document.getElementById('app').textContent='应用初始化未完成：'+String(e.message||'请重新打开应用').slice(0,160);}});</script><script>${script}</script></body></html>`;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const directory=process.argv[2]??path.join(project,'android','build','web');await mkdir(directory,{recursive:true});
  const html=await makeMobileDocument();await writeFile(path.join(directory,'mobile-shell.html'),html,'utf8');
  console.log(`OFFLINE_MOBILE_DOCUMENT_READY bytes=${Buffer.byteLength(html)}`);
}
