import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const events = readFileSync(new URL('../src/components/EventList.tsx', import.meta.url), 'utf8');
const reference = readFileSync(new URL('../src/reference.css', import.meta.url), 'utf8');

test('page headings are not duplicated inside discover and events content', () => {
  assert.doesNotMatch(app, /<p className="eyebrow">ARTIST HUB<\/p>/);
  assert.doesNotMatch(events, /FANFOLIO EVENT/);
  assert.doesNotMatch(events, /events-heading/);
});

test('mobile content has no overlapping global registration control or text-symbol icon', () => {
  assert.doesNotMatch(app, /className="floating-register"/);
  assert.doesNotMatch(app, />▣</);
});

test('430px approved reference preserves compact information density', () => {
  assert.match(reference, /--fan-shell:\s*430px/);
  assert.match(reference, /--fan-gutter:\s*22px/);
  assert.match(reference, /--fan-nav-height:\s*74px/);
  assert.match(reference, /\.artist-hub-hero[^}]*height:\s*205px/s);
  assert.match(reference, /\.hub-schedule-grid[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.doesNotMatch(reference, /min-height:\s*330px/);
  assert.doesNotMatch(reference, /\.hub-schedule-grid\s*\{\s*grid-template-columns:\s*1fr/);
});
