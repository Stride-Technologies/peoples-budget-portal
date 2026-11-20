import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bodiesOf,
  clock,
  documentsMentioned,
  hours,
  posterUrl,
  safeId,
  safeUrl,
  segmentAt,
  sourceOf,
  summaryLangFor,
  termsUsed,
  withReviewed,
  wordTimes,
  type Segment,
} from './format.ts';

const segs: Segment[] = [
  { start: 0, end: 30, text: 'The session is called to order' },
  { start: 30, end: 60, text: 'the Annual Investment Program is on the agenda', words: [[30, 31], [31, 32], [32, 33], [33, 34], [34, 35], [35, 36], [36, 37], [37, 38]] },
  { start: 60, end: 90, text: 'buy one take one', skip: 'aired' },
  { start: 90, end: 120, text: 'the AIP was referred to the committee' },
];

test('only http(s) links and plain ids from the API reach a URL', () => {
  assert.equal(safeUrl('https://example.gov.ph/ordinance/1'), 'https://example.gov.ph/ordinance/1');
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('data:text/html,x'), null);
  assert.equal(safeUrl('/relative'), null);
  assert.equal(safeUrl(undefined), null);
  assert.equal(safeId('abc_DEF-123'), 'abc_DEF-123');
  assert.equal(safeId('../../etc/passwd'), null);
  assert.equal(safeId('a?b'), null);
  assert.equal(safeId(''), null);
});

test('times and lengths read the way the pages print them', () => {
  assert.equal(clock(3725), '01:02:05');
  assert.equal(clock(59.9), '00:00:59');
  assert.equal(hours(14693), 4.1);
});

test('a video is a file when the API says so or the id starts with fb', () => {
  assert.equal(sourceOf({ id: 'abc' }), 'youtube');
  assert.equal(sourceOf({ id: 'fb123' }), 'file');
  assert.equal(sourceOf({ id: 'abc', source: 'file' }), 'file');
  // An API may name where the stream was first shown; it still holds the copy.
  assert.equal(sourceOf({ id: 'fb123', source: 'facebook' }), 'file');
  assert.equal(sourceOf({ id: 'fb123', source: 'youtube' }), 'youtube');
  assert.equal(posterUrl('https://h.example', { id: 'fb123' }), 'https://h.example/video/fb123.jpg');
  assert.equal(posterUrl('https://h.example', { id: 'abc' }), 'https://i.ytimg.com/vi/abc/hqdefault.jpg');
});

test('bodies come from hearings.json, else from the index', () => {
  const index = [
    { id: 'a', title: 'A', durationSec: 1 },
    { id: 'b', title: 'B', durationSec: 1, body: 'pc' },
  ];
  assert.deepEqual(bodiesOf(index, null).map((b) => b.id), ['', 'pc']);
  assert.deepEqual(bodiesOf(index, { bodies: [{ id: 'sp', name: 'Council' }] }), [{ id: 'sp', name: 'Council' }]);
  assert.deepEqual(bodiesOf([], null), [{ id: '' }]);
});

test('word times use the alignment when it fits, else spread by word length', () => {
  assert.deepEqual(wordTimes(segs[1]), [30, 31, 32, 33, 34, 35, 36, 37]);
  const spread = wordTimes({ start: 0, end: 10, text: 'aa bbbbbb' });
  assert.equal(spread[0], 0);
  assert.equal(spread[1], 3); // "aa " is 3 of 10 characters
  // An alignment for other words (the text was corrected) is not used.
  assert.equal(wordTimes({ start: 0, end: 10, text: 'one two', words: [[5, 6]] }).length, 2);
});

test('the line at a time, and none between sessions', () => {
  assert.equal(segmentAt(segs, 0), 0);
  assert.equal(segmentAt(segs, 59.9), 1);
  assert.equal(segmentAt(segs, 500), -1);
});

test('reviewed text replaces the line and drops its timings', () => {
  const out = withReviewed(segs, [{ seg_idx: 1, text: 'The AIP is on the agenda' }, { seg_idx: 99, text: 'x' }]);
  assert.equal(out[1].text, 'The AIP is on the agenda');
  assert.equal(out[1].words, null);
  assert.equal(out[1].reviewed, true);
  assert.equal(segs[1].reviewed, undefined);
  assert.equal(out.length, segs.length);
});

test('glossary terms are found by name or abbreviation, never in aired audio', () => {
  const used = termsUsed(
    [
      { term: 'Annual Investment Program', short: 'AIP', definition: 'The plan.' },
      { term: 'one', definition: 'Only said in an ad.' },
      { term: 'Appropriation (a+b)', definition: 'Not said.' },
    ],
    segs,
  );
  assert.deepEqual(used.map((u) => [u.term, u.refs]), [['Annual Investment Program', [1, 3]]]);
});

test('documents are listed once, and a link that is not http(s) is dropped', () => {
  const docs = documentsMentioned([
    { seg: 1, kind: 'ordinance', title: 'A', url: 'https://example.gov.ph/a' },
    { seg: 3, kind: 'ordinance', title: 'A', url: 'https://example.gov.ph/a' },
    { seg: 2, kind: 'ordinance', title: 'B', url: 'javascript:alert(1)' },
  ]);
  assert.deepEqual(docs.map((d) => [d.title, d.refs]), [['A', [1, 3]]]);
});

test('the summary language follows the page language', () => {
  assert.equal(summaryLangFor('fil'), 'tl');
  assert.equal(summaryLangFor('bcl'), 'bcl');
  assert.equal(summaryLangFor('en'), 'en');
});
