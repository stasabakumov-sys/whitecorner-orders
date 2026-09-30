import {test} from 'node:test';
import assert from 'node:assert/strict';
import {syncRestart} from './hub-storefront-freshness.mjs';
test('fresh scan and resume cannot silently default to an old completed run', () => {
 assert.equal(syncRestart(['--sync','--restart']),true);
 assert.equal(syncRestart(['--sync','--resume']),false);
 assert.throws(()=>syncRestart(['--sync']),/Choose/);
 assert.throws(()=>syncRestart(['--sync','--resume','--restart']),/Choose/);
});
