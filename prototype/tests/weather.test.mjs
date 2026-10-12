import test from 'node:test';
import assert from 'node:assert/strict';
import {weatherSummary} from '../weather-view.mjs';

test('weather safely escapes external city and provider text', () => {
  const html=weatherSummary({city:{name:'<img src=x onerror=alert(1)>'},today:'2026-10-12',
    days:[{date:'2026-10-12',icon:'rain',description:'<script>alert(1)</script>',min:12,max:23}],
    updatedAt:Date.now(),forecastEnd:'2026-10-12'});
  assert.ok(!html.includes('<img')&&!html.includes('<script'));
  assert.ok(html.includes('&lt;img')&&html.includes('&lt;script'));
});
test('missing forecast or temperature does not manufacture sunshine or zero degrees', () => {
  const empty=weatherSummary({city:{name:'北京'},days:[],expired:true,updatedAt:Date.now()-4*86400000});
  assert.ok(empty.includes('缓存已过期')&&!empty.includes('weather-sun')&&!empty.includes('0°'));
  const missing=weatherSummary({city:{name:'北京'},today:'2026-10-12',days:[{date:'2026-10-12',icon:'cloud',description:'阴'}]});
  assert.ok(missing.includes('温度暂无数据')&&!missing.includes('0°'));
});
test('weather preserves cache time and identifies stale or failed refreshes', () => {
  const stamp=Date.now()-2*86400000;
  const html=weatherSummary({city:{name:'北京'},updatedAt:stamp,stale:true,lastError:'本次未更新，缓存保留',days:[]});
  assert.ok(html.includes('最近更新')&&html.includes('缓存较早')&&html.includes('本次未更新，缓存保留'));
});
