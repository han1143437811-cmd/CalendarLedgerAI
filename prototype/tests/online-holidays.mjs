// Explicit live check of the configured public holiday sources; no user data or key.
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {createPreviewServer} from '../server.mjs';
const server=createPreviewServer();
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try {
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/holidays?year=2026`);
  const data=await response.json();
  assert.equal(response.status,200,JSON.stringify(data));
  assert.equal(data.year,2026);
  assert.equal(data.days.find(d=>d.date==='2026-10-01').isOffDay,true);
  assert.equal(data.days.find(d=>d.date==='2026-10-10').isOffDay,false);
  const result={passed:true,checkedAt:new Date().toISOString(),year:data.year,days:data.days.length,dataURL:data.dataURL,papers:data.papers};
  await mkdir(new URL('../qa/',import.meta.url),{recursive:true});
  await writeFile(new URL('../qa/online-holidays.json',import.meta.url),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
} finally {await new Promise(resolve=>server.close(resolve));}
