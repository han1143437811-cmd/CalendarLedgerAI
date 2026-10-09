import test from 'node:test';
import assert from 'node:assert/strict';
import {festivalNames,dayObservance} from '../festivals.mjs';

// Independent date fixtures from the Hong Kong Observatory's 2025/2026/2027
// Gregorian/lunar conversion tables, including the 2025 leap-sixth month.
test('traditional festivals follow the lunar date and move between Gregorian years',()=>{
  for(const [date,name]of [['2025-01-29','春节'],['2026-02-17','春节'],['2027-02-06','春节'],['2026-03-03','元宵节'],['2026-06-19','端午节'],['2026-08-19','七夕'],['2026-09-25','中秋节'],['2025-10-06','中秋节'],['2026-10-18','重阳节']])assert.ok(festivalNames(date).includes(name),`${date}: ${name}`);
});
test('New Year eve works for both 29-day and 30-day final lunar months',()=>{
  assert.ok(festivalNames('2025-01-28').includes('除夕'));
  assert.ok(festivalNames('2026-02-16').includes('除夕'));
  assert.equal(festivalNames('2026-02-15').includes('除夕'),false);
});
test('leap months and ordinary days do not gain false festival labels',()=>{
  assert.equal(festivalNames('2023-03-23').includes('龙抬头'),false);
  assert.deepEqual(festivalNames('2026-10-09'),[]);
  assert.throws(()=>festivalNames('2026-02-30'));
});
test('festival day, vacation period and adjusted workday have distinct labels',()=>{
  const holiday={name:'国庆节',isOffDay:true};
  assert.equal(dayObservance('2026-10-01',holiday).label,'国庆节');
  assert.equal(dayObservance('2026-10-05',holiday).label,'国庆假期');
  assert.equal(dayObservance('2026-10-10',{...holiday,isOffDay:false}).label,'国庆补班');
  assert.equal(dayObservance('2026-03-03').detail,'元宵节');
  assert.deepEqual(dayObservance('2026-09-25').names,['中秋节']);
  const combined=dayObservance('2025-10-06',{name:'国庆节、中秋节',isOffDay:true});
  assert.equal(combined.label,'中秋节');
  assert.ok(combined.detail.includes('国庆节、中秋节假期'));
});
test('Qingming uses verified solar-term dates and cache callers cannot alter future labels',()=>{
  assert.ok(festivalNames('2025-04-04').includes('清明节'));
  assert.ok(festivalNames('2026-04-05').includes('清明节'));
  const names=festivalNames('2026-10-01');names.push('错误名称');
  assert.deepEqual(festivalNames('2026-10-01'),['国庆节']);
});
