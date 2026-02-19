'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { haversineDistance, getBearing } = require('../cli/geoUtils');
const { buildPacket } = require('../cli/udpSender');
const { Logger } = require('../cli/logger');
const { resolvePath, interpolateSegment } = require('../cli/simulationRunner');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}: ${e.message}`);
  }
}

// ── geoUtils ────────────────────────────────────────────────────────
console.log('\ngeoUtils');

test('haversineDistance returns metres between two points', () => {
  const d = haversineDistance(39.925, 32.866, 39.930, 32.870);
  assert(d > 600 && d < 700, `expected ~650m, got ${d}`);
});

test('haversineDistance same point is 0', () => {
  assert.strictEqual(haversineDistance(0, 0, 0, 0), 0);
});

test('getBearing returns 0-360 range', () => {
  const b = getBearing(39.925, 32.866, 39.930, 32.870);
  assert(b >= 0 && b < 360, `bearing ${b} out of range`);
});

test('getBearing north is ~0', () => {
  const b = getBearing(0, 0, 1, 0);
  assert(b < 1 || b > 359, `expected ~0, got ${b}`);
});

// ── udpSender ───────────────────────────────────────────────────────
console.log('\nudpSender');

test('buildPacket returns 72 bytes', () => {
  const pkt = buildPacket({ lat: 39.925, lng: 32.866, speed: 60, heading: 45, v2x: {} });
  assert.strictEqual(pkt.length, 72);
});

test('buildPacket encodes lat/lng correctly', () => {
  const pkt = buildPacket({ lat: 39.925, lng: 32.866, speed: 0, heading: 0, v2x: {} });
  const lat = pkt.readDoubleLE(0);
  const lng = pkt.readDoubleLE(8);
  assert(Math.abs(lat - 39.925) < 1e-10);
  assert(Math.abs(lng - 32.866) < 1e-10);
});

test('buildPacket encodes v2x flags', () => {
  const pkt = buildPacket({
    lat: 0, lng: 0, speed: 0, heading: 0,
    v2x: { eebl: true, lightBar: true, siren: false, flasher: false, foglight: false, drl: true }
  });
  const flags = pkt.readUInt16LE(40);
  assert.strictEqual(flags, 1 | 2 | 32); // eebl + lightBar + drl = 35
});

// ── logger ──────────────────────────────────────────────────────────
console.log('\nlogger');

test('CSV logger writes header and a row', async () => {
  const tmpFile = path.join('/tmp', 'test-logger.csv');
  const logger = new Logger(tmpFile, 'csv');
  logger.log({
    timestamp: '2026-01-01T00:00:00Z', vehicleId: 'v1',
    lat: 39.0, lng: 32.0, speed: 50, heading: 90,
    eebl: false, lightBar: true, siren: false, flasher: false,
    foglight: false, drl: false, wiper: 0, leftSignal: false, rightSignal: false,
  });
  await logger.close();
  const content = fs.readFileSync(tmpFile, 'utf-8');
  assert(content.startsWith('timestamp,'), 'CSV should start with header');
  const lines = content.trim().split('\n');
  assert.strictEqual(lines.length, 2, 'header + 1 data row');
  fs.unlinkSync(tmpFile);
});

test('JSON logger writes JSONL', async () => {
  const tmpFile = path.join('/tmp', 'test-logger.jsonl');
  const logger = new Logger(tmpFile, 'json');
  logger.log({ timestamp: '2026-01-01T00:00:00Z', vehicleId: 'v1', lat: 39, lng: 32 });
  await logger.close();
  const content = fs.readFileSync(tmpFile, 'utf-8').trim();
  const obj = JSON.parse(content);
  assert.strictEqual(obj.vehicleId, 'v1');
  fs.unlinkSync(tmpFile);
});

// ── simulationRunner ────────────────────────────────────────────────
console.log('\nsimulationRunner');

test('resolvePath uses vehicle path when available', () => {
  const vehicle = { id: 'v1', path: [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }] };
  const result = resolvePath(vehicle, []);
  assert.strictEqual(result.length, 2);
});

test('resolvePath falls back to savedPaths', () => {
  const vehicle = { id: 'v1', path: [] };
  const saved = [{ vehicle_id: 'v1', path: [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }] }];
  const result = resolvePath(vehicle, saved);
  assert.strictEqual(result.length, 2);
});

test('resolvePath returns null when no path', () => {
  const vehicle = { id: 'v1', path: [{ lat: 0, lng: 0 }] };
  const result = resolvePath(vehicle, []);
  assert.strictEqual(result, null);
});

test('interpolateSegment yields correct number of ticks', () => {
  const from = { lat: 39.925, lng: 32.866 };
  const to = { lat: 39.930, lng: 32.870, hops: 10, v2x: { velocityKmh: 60 } };
  const ticks = [...interpolateSegment(from, to, 10)];
  assert.strictEqual(ticks.length, 10);
});

test('interpolateSegment last tick reaches destination', () => {
  const from = { lat: 39.925, lng: 32.866 };
  const to = { lat: 39.930, lng: 32.870, hops: 5, v2x: { velocityKmh: 40 } };
  const ticks = [...interpolateSegment(from, to, 10)];
  const last = ticks[ticks.length - 1];
  assert(Math.abs(last.lat - 39.930) < 1e-10, `lat: ${last.lat}`);
  assert(Math.abs(last.lng - 32.870) < 1e-10, `lng: ${last.lng}`);
});

// ── Summary ─────────────────────────────────────────────────────────
console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
