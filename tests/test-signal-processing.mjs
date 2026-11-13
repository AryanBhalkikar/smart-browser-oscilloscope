import assert from 'node:assert/strict';
import { decodeFloat32Message, normalizeSampleMessage } from '../frontend/src/utils/SampleMessage.js';
import { calculateMeasurements, downsamplePairedSamples } from '../frontend/src/utils/WaveformProcessing.js';
import { findTrigger } from '../frontend/src/utils/TriggerProcessing.js';

const sampleRate = 10000;
const samples = Float32Array.from({ length: 2000 }, (_, i) => Math.sin(2 * Math.PI * 50 * i / sampleRate));

const single = normalizeSampleMessage({ sampleRate, samples: Array.from(samples) });
assert.equal(single.mode, 'single');
assert.equal(single.samples.length, samples.length);

const paired = normalizeSampleMessage({ sampleRate, xSamples: [1, 2], ySamples: [3, 4] });
assert.equal(paired.mode, 'xy');
assert.deepEqual(Array.from(paired.ySamples), [3, 4]);
assert.ok(normalizeSampleMessage({ sampleRate, xSamples: [1], ySamples: [1, 2] }).error);
assert.ok(normalizeSampleMessage({ sampleRate: 0, samples: [1] }).error);

const binaryBuffer = new ArrayBuffer(8);
const binaryView = new DataView(binaryBuffer);
binaryView.setFloat32(0, 1.25, true);
binaryView.setFloat32(4, -0.5, true);
assert.deepEqual(Array.from(decodeFloat32Message(binaryBuffer).samples), [1.25, -0.5]);
assert.ok(decodeFloat32Message(new ArrayBuffer(3)).error);

const measurements = calculateMeasurements(samples, sampleRate);
assert.equal(measurements.vpp, '2.00');
assert.ok(Math.abs(Number(measurements.freq) - 50) < 1);

const reduced = downsamplePairedSamples(Float32Array.from([0, 1, 2, 3]), Float32Array.from([4, 5, 6, 7]), 2);
assert.deepEqual(Array.from(reduced.x), [0, 3]);
assert.deepEqual(Array.from(reduced.y), [4, 7]);

const triggerInput = Float32Array.from({ length: 1000 }, (_, i) => Math.sin(2 * Math.PI * i / 20));
assert.notEqual(findTrigger(triggerInput, triggerInput.length, 0, 200, 1000, 0, true), null);

console.log('Signal-processing dummy checks passed.');
