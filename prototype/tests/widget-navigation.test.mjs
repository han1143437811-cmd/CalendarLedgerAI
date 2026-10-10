import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveWidgetNavigation} from '../widget-navigation.mjs';

test('widget opens the AI or a valid calendar date without accepting actions',()=>{
  assert.deepEqual(resolveWidgetNavigation({target:'ai',message:'automatically save this'}),{target:'ai'});
  assert.deepEqual(resolveWidgetNavigation({target:'date',date:'2028-02-29'}),{target:'date',date:'2028-02-29'});
  for(const payload of [null,{}, {target:'delete'}, {target:'date',date:'2026-02-29'},
    {target:'date',date:'2026-13-01'}, {target:'date',date:'2019-12-31'},
    {target:'date',date:'2101-01-01'}, {target:'date',date:'2026-10-10);sendChat("delete")'}])
    assert.equal(resolveWidgetNavigation(payload),null);
});
