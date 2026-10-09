import {validDate} from './core.mjs';
import {Solar} from './vendor/lunar-1.7.7.mjs';

// Festival dates are independent of the government's days-off schedule.
// Calculate from the date's year/month/day, independently of the device's zone
// and WebView ICU version. Known dates are checked against HKO conversion tables.
const SOLAR_FESTIVALS=Object.freeze({'01-01':'元旦','03-08':'妇女节','05-01':'劳动节','05-04':'青年节','06-01':'儿童节','09-10':'教师节','10-01':'国庆节'});
const LUNAR_FESTIVALS=Object.freeze({'1-1':'春节','1-15':'元宵节','2-2':'龙抬头','5-5':'端午节','7-7':'七夕','8-15':'中秋节','9-9':'重阳节','12-8':'腊八节'});
const cache=new Map();
export function festivalNames(date){
  validDate(date);
  if(cache.has(date))return [...cache.get(date)];
  const [year,month,day]=date.split('-').map(Number),solar=Solar.fromYmd(year,month,day),lunar=solar.getLunar(),names=[];
  if(SOLAR_FESTIVALS[date.slice(5)])names.push(SOLAR_FESTIVALS[date.slice(5)]);
  // Leap months have negative month numbers and must not repeat festivals.
  const name=LUNAR_FESTIVALS[`${lunar.getMonth()}-${lunar.getDay()}`];if(name)names.push(name);
  if(lunar.getJieQi()==='清明')names.push('清明节');
  const tomorrow=solar.next(1).getLunar();
  if(tomorrow.getMonth()===1&&tomorrow.getDay()===1)names.push('除夕');
  if(cache.size>=4096)cache.clear();
  const result=[...new Set(names)];cache.set(date,result);return [...result];
}
export function dayObservance(date,holiday){
  const names=festivalNames(date),period=!!holiday&&!names.length;
  const holidayName=String(holiday?.name??'');
  const label=names.join(' · ')||(holiday?`${holidayName.replace(/节$/,'')}${holiday.isOffDay?'假期':'补班'}`:'');
  const details=[...names];
  if(holiday){
    const isSameFestival=names.some(name=>holidayName.replace(/节$/,'')===name.replace(/节$/,''));
    details.push(holiday.isOffDay?(isSameFestival?'放假':`${holidayName}假期`):`${holidayName}调休上班`);
  }
  return {names,label,detail:details.join(' · '),period,work:!!holiday&&!holiday.isOffDay};
}
