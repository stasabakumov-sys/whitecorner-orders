import assert from 'node:assert/strict';
import test from 'node:test';
import {publicReviewAuthor,coverFirst} from './public-fields.mjs';

test('uses Fera public display name only when visibility is explicit', () => {
  assert.equal(publicReviewAuthor({customer:{is_name_visible:true,display_name:'Marine L.',name:'Private Full Name'}},null),'Marine L.');
  assert.equal(publicReviewAuthor({customer:{display_name:'Marine L.'}},null),'Customer');
});

test('anonymity overrides manual display names', () => {
  assert.equal(publicReviewAuthor({customer:{is_anonymous:true,is_name_visible:true,display_name:'Marine L.'}},'Manager name'),'Anonymous');
  assert.equal(publicReviewAuthor({customer:{is_name_visible:false,display_name:'Marine L.'}},'Manager name'),'Anonymous');
});

test('manager-approved name is available when visibility is not denied', () => {
  assert.equal(publicReviewAuthor({customer:{is_name_visible:true}},'Approved name'),'Approved name');
  assert.equal(publicReviewAuthor({},null),'Customer');
});

test('chosen cover is first without discarding other review media', () => {
  const media=[{id:'a',is_cover:false},{id:'b',is_cover:true},{id:'c',is_cover:false}];
  assert.deepEqual(coverFirst(media).map(item=>item.id),['b','a','c']);
  assert.deepEqual(media.map(item=>item.id),['a','b','c']);
});
