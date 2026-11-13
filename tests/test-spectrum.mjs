import assert from 'node:assert/strict';
import { calculateAmplitudeSpectrum } from '../frontend/src/utils/SpectrumProcessing.js';

const sampleRate = 10000;
const size = 8192;
const samples = Float32Array.from({ length: size }, (_, i) =>
    Math.sin(2 * Math.PI * 50 * i / sampleRate) +
    0.1 * Math.sin(2 * Math.PI * 150 * i / sampleRate)
);
const spectrum = calculateAmplitudeSpectrum(samples, sampleRate, size);
assert.ok(spectrum);
assert.ok(Math.abs(spectrum.resolutionHz - sampleRate / size) < 1e-9);

function strongestBinBetween(lowHz, highHz) {
    let strongest = -1;
    for (let i = 0; i < spectrum.frequencies.length; i++) {
        const frequency = spectrum.frequencies[i];
        if (frequency >= lowHz && frequency <= highHz &&
            (strongest < 0 || spectrum.magnitudeDbv[i] > spectrum.magnitudeDbv[strongest])) {
            strongest = i;
        }
    }
    return strongest;
}

const fundamental = strongestBinBetween(40, 60);
const thirdHarmonic = strongestBinBetween(140, 160);
assert.ok(fundamental >= 0);
assert.ok(thirdHarmonic >= 0);
assert.ok(Math.abs(spectrum.frequencies[fundamental] - 50) <= spectrum.resolutionHz);
assert.ok(Math.abs(spectrum.frequencies[thirdHarmonic] - 150) <= spectrum.resolutionHz);
assert.ok(Math.abs((spectrum.magnitudeDbv[fundamental] - spectrum.magnitudeDbv[thirdHarmonic]) - 20) < 1);
assert.equal(calculateAmplitudeSpectrum(new Float32Array(32), sampleRate, 64), null);

console.log(
    `FFT dummy checks passed: H1 ${spectrum.frequencies[fundamental].toFixed(1)} Hz, ` +
    `H3 ${spectrum.frequencies[thirdHarmonic].toFixed(1)} Hz.`
);
