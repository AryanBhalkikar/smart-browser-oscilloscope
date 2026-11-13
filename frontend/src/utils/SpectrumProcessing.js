/**
 * Calculate a single-sided, Hann-windowed amplitude spectrum in dBV.
 * The sample count must be a power of two for the radix-2 FFT below.
 */
export function calculateAmplitudeSpectrum(samples, sampleRate, size = 4096) {
    if (
        !samples ||
        samples.length < size ||
        !Number.isFinite(sampleRate) ||
        sampleRate <= 0 ||
        !Number.isInteger(size) ||
        size < 2 ||
        (size & (size - 1)) !== 0
    ) {
        return null;
    }

    let mean = 0;
    for (let i = 0; i < size; i++) mean += samples[i];
    mean /= size;

    const real = new Float64Array(size);
    const imag = new Float64Array(size);
    let windowSum = 0;

    for (let i = 0; i < size; i++) {
        const window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
        real[i] = (samples[i] - mean) * window;
        windowSum += window;
    }

    fftInPlace(real, imag);

    const binCount = size / 2 + 1;
    const frequencies = new Float32Array(binCount);
    const magnitudeDbv = new Float32Array(binCount);
    for (let bin = 0; bin < binCount; bin++) {
        const isEndpoint = bin === 0 || bin === size / 2;
        const peakVolts = Math.hypot(real[bin], imag[bin]) / windowSum * (isEndpoint ? 1 : 2);
        const rmsVolts = isEndpoint ? peakVolts : peakVolts / Math.SQRT2;
        frequencies[bin] = (bin * sampleRate) / size;
        magnitudeDbv[bin] = 20 * Math.log10(Math.max(rmsVolts, 1e-12));
    }

    return {
        frequencies,
        magnitudeDbv,
        resolutionHz: sampleRate / size,
        nyquistHz: sampleRate / 2
    };
}

function fftInPlace(real, imag) {
    const size = real.length;

    // Reorder samples into bit-reversed order before the butterfly stages.
    for (let i = 1, j = 0; i < size; i++) {
        let bit = size >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            [real[i], real[j]] = [real[j], real[i]];
            [imag[i], imag[j]] = [imag[j], imag[i]];
        }
    }

    for (let span = 2; span <= size; span <<= 1) {
        const halfSpan = span >> 1;
        const angleStep = (-2 * Math.PI) / span;
        for (let start = 0; start < size; start += span) {
            for (let offset = 0; offset < halfSpan; offset++) {
                const angle = angleStep * offset;
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                const even = start + offset;
                const odd = even + halfSpan;
                const oddReal = real[odd] * cos - imag[odd] * sin;
                const oddImag = real[odd] * sin + imag[odd] * cos;

                real[odd] = real[even] - oddReal;
                imag[odd] = imag[even] - oddImag;
                real[even] += oddReal;
                imag[even] += oddImag;
            }
        }
    }
}

