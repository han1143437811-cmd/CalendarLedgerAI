import {festivalNames} from '../prototype/festivals.mjs';
import {Solar} from '../prototype/vendor/lunar-1.7.7.mjs';
import {addDays} from '../prototype/core.mjs';
import {writeFile} from 'node:fs/promises';

/** Use the app's own pinned lunar library rather than the device's ICU version. */
export async function writeWidgetFestivalIndex(filename) {
  const dates={},lunarDays={};
  for(let date='2020-01-01';date<='2100-12-31';date=addDays(date,1)) {
    const names=festivalNames(date);
    if(names.length)dates[date]=names;
    const lunar=Solar.fromYmd(...date.split('-').map(Number)).getLunar();
    lunarDays[date]=lunar.getDay()===1?`${lunar.getMonthInChinese()}月`:lunar.getDayInChinese();
  }
  const index={version:2,start:'2020-01-01',end:'2100-12-31',
    source:'prototype/festivals.mjs; lunar-javascript 1.7.7 (MIT)',dates,lunarDays};
  await writeFile(filename,JSON.stringify(index),'utf8');
  return Object.keys(dates).length;
}
