import assert from 'node:assert/strict';
import { DataBuffer } from '../frontend/src/utils/DataBuffer.js';
import { PairedDataBuffer } from '../frontend/src/utils/PairedDataBuffer.js';
import { buildScopeFrame, createScopeFrameState } from '../frontend/src/utils/ScopeFrame.js';

const sampleRate = 10000;
const size = 8192;
const x = Float32Array.from({ length: size }, (_, i) => Math.sin(2 * Math.PI * 50 * i / sampleRate));
const y = Float32Array.from({ length: size }, (_, i) => 0.5 * Math.sin(2 * Math.PI * 50 * i / sampleRate + Math.PI / 3));
const baseSettings = {
    acqState: 'RUN', displayMode: 'TIME', sampleRate, timePerDiv: 0.01,
    trigLevel: 0, trigEdge: 'RISING', trigMode: 'AUTO', fftSize: 4096,
    fftMaxFrequency: 2000, fftDbRange: 80
};
const dataBuffer = new DataBuffer();
const pairedBuffer = new PairedDataBuffer();
dataBuffer.push(x);
pairedBuffer.push(x, y);

const timeFrame = buildScopeFrame({
    dataBuffer, pairedBuffer, settings: baseSettings, time: 300, width: 800, state: createScopeFrameState()
});
assert.equal(timeFrame.mode, 'TIME');
assert.equal(timeFrame.pair.x.length, 1000);
assert.ok(timeFrame.measurements);

const xyFrame = buildScopeFrame({
    dataBuffer, pairedBuffer, settings: { ...baseSettings, displayMode: 'XY' },
    time: 400, width: 800, state: createScopeFrameState()
});
assert.equal(xyFrame.mode, 'XY');
assert.equal(xyFrame.x.length, xyFrame.y.length);
assert.ok(xyFrame.x.length > 0);

const fftFrame = buildScopeFrame({
    dataBuffer, pairedBuffer, settings: { ...baseSettings, displayMode: 'FFT' },
    time: 500, width: 800, state: createScopeFrameState()
});
assert.equal(fftFrame.mode, 'FFT');
assert.equal(fftFrame.channels.length, 2);
assert.equal(fftFrame.sampleCount, 4096);
assert.equal(fftFrame.maxFrequencyHz, 2000);
assert.equal(fftFrame.ceilingDbv - fftFrame.floorDbv, 80);

const zoomedFftFrame = buildScopeFrame({
    dataBuffer, pairedBuffer, settings: { ...baseSettings, displayMode: 'FFT', fftMaxFrequency: 500, fftDbRange: 40 },
    time: 550, width: 800, state: createScopeFrameState()
});
assert.equal(zoomedFftFrame.maxFrequencyHz, 500);
assert.equal(zoomedFftFrame.ceilingDbv - zoomedFftFrame.floorDbv, 40);

const singleBuffer = new DataBuffer();
singleBuffer.push(x);
const singleFftFrame = buildScopeFrame({
    dataBuffer: singleBuffer, pairedBuffer: new PairedDataBuffer(),
    settings: { ...baseSettings, displayMode: 'FFT' }, time: 600, width: 800, state: createScopeFrameState()
});
assert.equal(singleFftFrame.channels.length, 1);

const fftSingleState = createScopeFrameState();
const fftSingleFrame = buildScopeFrame({
    dataBuffer: singleBuffer, pairedBuffer: new PairedDataBuffer(),
    settings: { ...baseSettings, displayMode: 'FFT', acqState: 'SINGLE_WAIT' },
    time: 650, width: 800, state: fftSingleState
});
assert.equal(fftSingleFrame.singleTriggered, true);

const singleWaitState = createScopeFrameState();
const singleWaitFrame = buildScopeFrame({
    dataBuffer, pairedBuffer, settings: { ...baseSettings, acqState: 'SINGLE_WAIT' },
    time: 700, width: 800, state: singleWaitState
});
assert.equal(singleWaitFrame.singleTriggered, true);
const nextSingleWaitFrame = buildScopeFrame({
    dataBuffer, pairedBuffer, settings: { ...baseSettings, acqState: 'SINGLE_WAIT' },
    time: 701, width: 800, state: singleWaitState
});
assert.equal(nextSingleWaitFrame.singleTriggered, false);

console.log('Scope-frame dummy checks passed for Time, X-Y, FFT, and single acquisition.');
