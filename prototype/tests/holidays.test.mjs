import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateHolidays} from '../holiday-data.mjs';
import {createInitialState,isWorkingDay,findFreeSlots} from '../core.mjs';
import {createPreviewServer} from '../server.mjs';

const year2026=JSON.parse(await readFile(new URL('../holidays/2026.json',import.meta.url),'utf8'));
test('国庆休假跳过周一至周五，10月10日周六补班可安排',()=>{
  const s=createInitialState('2026-10-05',false),data=validateHolidays(year2026,2026);
  s.holidayDays=Object.fromEntries(data.days.map(d=>[d.date,d]));
  s.holidayMeta={2026:{papers:data.papers}};
  assert.equal(isWorkingDay(s,'2026-10-05'),false);
  assert.equal(isWorkingDay(s,'2026-10-10'),true);
  assert.equal(isWorkingDay(s,'2026-10-11'),false);
  const plan=findFreeSlots(s,{start:'2026-10-05',end:'2026-10-11',count:3,duration:120});
  assert.deepEqual(plan.slots.map(d=>d.date),['2026-10-08','2026-10-09','2026-10-10']);
  assert.equal(plan.criteria.workdayBasis,'中国放假调休安排');
});
test('节假日校验拒绝重复日期、虚构日期、无政府来源和错误年份',()=>{
  const one={year:2026,papers:year2026.papers,days:[{date:'2026-10-01',name:'国庆节',isOffDay:true}]};
  assert.throws(()=>validateHolidays({...one,days:[...one.days,...one.days]},2026));
  assert.throws(()=>validateHolidays({...one,days:[{...one.days[0],date:'2026-02-30'}]},2026));
  assert.throws(()=>validateHolidays({...one,papers:['https://example.com/fake.gov.cn']},2026));
  assert.throws(()=>validateHolidays(one,2027));
});
test('未公布年份保持空数据，不编造调休并说明工作日计算口径',()=>{
  const s=createInitialState('2027-01-01',false),data=validateHolidays({year:2027,papers:[],days:[]},2027);
  s.holidayMeta={2027:{papers:data.papers}};
  const plan=findFreeSlots(s,{start:'2027-01-01',end:'2027-01-08',count:1,duration:60});
  assert.equal(data.days.length,0);
  assert.ok(plan.criteria.workdayBasis.includes('未获取'));
});
test('联网节假日代理首个镜像失败后换源，且不需要API Key',async()=>{
  const attempts=[];
  const server=createPreviewServer({upstreamFetch:async url=>{
    attempts.push(url);
    return new Response(JSON.stringify(attempts.length===1?{error:'unavailable'}:year2026),{status:attempts.length===1?503:200});
  }});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const base=`http://127.0.0.1:${server.address().port}`;
    const response=await fetch(base+'/api/holidays?year=2026'),data=await response.json();
    assert.equal(response.status,200);assert.equal(data.days.length,39);assert.equal(attempts.length,2);
    assert.ok(data.dataURL.startsWith('https://fastly.jsdelivr.net/'));
    assert.equal((await fetch(base+'/api/holidays?year=abc')).status,400);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
