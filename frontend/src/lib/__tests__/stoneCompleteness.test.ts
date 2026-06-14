/**
 * Unit tests for the stone-completeness helpers.
 * Run via `node --test` or any test runner; kept dep-free.
 *
 * To execute:
 *   cd /app/frontend && npx tsx --test src/lib/__tests__/stoneCompleteness.test.ts
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  isStoneVerbalComplete,
  isStoneCertComplete,
  isJobVerbalComplete,
  isJobCertComplete,
} from '../stoneCompleteness';

const fullVerbal = {
  certificate_id: 'C-123',
  weight: 1.05,
  identification: 'Diamond',
  color: 'D',
  origin: 'Natural',
  comment: '',
};

test('isStoneVerbalComplete — null record is incomplete', () => {
  assert.equal(isStoneVerbalComplete({}), false);
  assert.equal(isStoneVerbalComplete({ verbal_findings: null }), false);
});

test('isStoneVerbalComplete — empty string is incomplete', () => {
  assert.equal(isStoneVerbalComplete({ verbal_findings: '' }), false);
  assert.equal(isStoneVerbalComplete({ verbal_findings: '   ' }), false);
});

test('isStoneVerbalComplete — legacy free-text is complete', () => {
  assert.equal(isStoneVerbalComplete({ verbal_findings: 'D color natural' }), true);
});

test('isStoneVerbalComplete — structured, missing color is incomplete', () => {
  assert.equal(
    isStoneVerbalComplete({ verbal_findings: { ...fullVerbal, color: '' } }),
    false,
  );
});

test('isStoneVerbalComplete — structured, only comment missing is COMPLETE', () => {
  assert.equal(
    isStoneVerbalComplete({ verbal_findings: { ...fullVerbal, comment: '' } }),
    true,
  );
});

test('isStoneVerbalComplete — parcel needs every per_stone entry filled', () => {
  const goodPerStone = { weight: 1, identification: 'D', color: 'D', origin: 'N' };
  // Complete parcel of 3:
  assert.equal(
    isStoneVerbalComplete({
      kind: 'parcel',
      stone_count: 3,
      verbal_findings: { ...fullVerbal, per_stone: [goodPerStone, goodPerStone, goodPerStone] },
    }),
    true,
  );
  // Parcel of 3 with only 2 per_stone entries:
  assert.equal(
    isStoneVerbalComplete({
      kind: 'parcel',
      stone_count: 3,
      verbal_findings: { ...fullVerbal, per_stone: [goodPerStone, goodPerStone] },
    }),
    false,
  );
  // Parcel where one per_stone entry is missing color:
  assert.equal(
    isStoneVerbalComplete({
      kind: 'parcel',
      stone_count: 2,
      verbal_findings: {
        ...fullVerbal,
        per_stone: [goodPerStone, { ...goodPerStone, color: '' }],
      },
    }),
    false,
  );
});

test('isStoneCertComplete — only true when URL is non-empty', () => {
  assert.equal(isStoneCertComplete({}), false);
  assert.equal(isStoneCertComplete({ certificate_scan_url: '' }), false);
  assert.equal(isStoneCertComplete({ certificate_scan_url: 'https://cdn/sig.png' }), true);
});

test('isJobVerbalComplete — excludes cancelled stones', () => {
  const stones = [
    { id: 'a', verbal_findings: fullVerbal },
    { id: 'b', verbal_findings: null, cancelled: true },
  ];
  assert.equal(isJobVerbalComplete(stones), true);
});

test('isJobVerbalComplete — empty stones list is incomplete', () => {
  assert.equal(isJobVerbalComplete([]), false);
});

test('isJobCertComplete — every cert group needs one scan', () => {
  // Two stones share cert group 1 — one upload is enough for the group.
  // Stone c is ungrouped and has its own.
  const stones = [
    { id: 'a', certificate_group: 1, certificate_scan_url: 'https://cdn/1.png' },
    { id: 'b', certificate_group: 1 },
    { id: 'c', certificate_scan_url: 'https://cdn/2.png' },
  ];
  assert.equal(isJobCertComplete(stones), true);
});

test('isJobCertComplete — ungrouped stone without scan blocks completion', () => {
  const stones = [
    { id: 'a', certificate_group: 1, certificate_scan_url: 'https://cdn/1.png' },
    { id: 'b' },
  ];
  assert.equal(isJobCertComplete(stones), false);
});

test('isJobCertComplete — cancelled stones are excluded', () => {
  const stones = [
    { id: 'a', certificate_scan_url: 'https://cdn/1.png' },
    { id: 'b', cancelled: true },
  ];
  assert.equal(isJobCertComplete(stones), true);
});
