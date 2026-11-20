import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LENGTH_HEADER, lengthHeader, totalBytes } from './download-length.ts';

test('the proxy header wins over Content-Length', () => {
  const headers = new Headers({ [LENGTH_HEADER]: '2048', 'content-length': '512' });
  assert.equal(totalBytes(headers), 2048);
});

test('Content-Length still serves a response that has it', () => {
  assert.equal(totalBytes(new Headers({ 'content-length': '512' })), 512);
});

test('no stated size, or a nonsense one, is no total', () => {
  assert.equal(totalBytes(new Headers()), 0);
  assert.equal(totalBytes(new Headers({ [LENGTH_HEADER]: 'abc' })), 0);
  assert.equal(totalBytes(new Headers({ [LENGTH_HEADER]: '-5', 'content-length': '0' })), 0);
});

test('a proxy forwards the upstream size under the header Next keeps', () => {
  assert.deepEqual(lengthHeader(new Headers({ 'content-length': '91234' })), {
    'X-Content-Length': '91234',
  });
  assert.deepEqual(lengthHeader(new Headers()), {});
});

test('an encoded upstream body states no size: its length counts the encoded bytes', () => {
  const upstream = new Headers({ 'content-length': '400', 'content-encoding': 'gzip' });
  assert.deepEqual(lengthHeader(upstream), {});
});
