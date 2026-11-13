export function downsamplePairedSamples(xSamples, ySamples, maxPoints) {
    const count = Math.min(xSamples.length, ySamples.length);
    if (count <= maxPoints) {
        return { x: xSamples.subarray(0, count), y: ySamples.subarray(0, count) };
    }

    const pointCount = Math.max(2, Math.floor(maxPoints));
    const x = new Float32Array(pointCount);
    const y = new Float32Array(pointCount);
    const lastIndex = count - 1;

    for (let i = 0; i < pointCount; i++) {
        const sourceIndex = Math.round((i * lastIndex) / (pointCount - 1));
        x[i] = xSamples[sourceIndex];
        y[i] = ySamples[sourceIndex];
    }

    return { x, y };
}

export function calculateMeasurements(dataSlice, sampleRate) {
    if (!dataSlice || dataSlice.length === 0) {
        return { vmax: '--', vmin: '--', vpp: '--', vmean: '--', vrms: '--', freq: '--' };
    }

    let max = -Infinity;
    let min = Infinity;
    let sum = 0;
    let squareSum = 0;
    const count = dataSlice.length;

    for (let i = 0; i < count; i++) {
        const value = dataSlice[i];
        if (value > max) max = value;
        if (value < min) min = value;
        sum += value;
        squareSum += value * value;
    }

    const mean = sum / count;
    const rms = Math.sqrt(squareSum / count);
    const vpp = max - min;
    let frequency = '--';

    if (vpp > 0.1 && Number.isFinite(sampleRate) && sampleRate > 0) {
        const hysteresis = vpp * 0.05;
        const risingCrossings = [];
        let aboveThreshold = dataSlice[0] > mean;

        for (let i = 1; i < count; i++) {
            if (!aboveThreshold && dataSlice[i] >= mean + hysteresis) {
                aboveThreshold = true;
                risingCrossings.push(i);
            } else if (aboveThreshold && dataSlice[i] <= mean - hysteresis) {
                aboveThreshold = false;
            }
        }

        if (risingCrossings.length >= 2) {
            const periods = risingCrossings.length - 1;
            const samplesPerPeriod = (risingCrossings.at(-1) - risingCrossings[0]) / periods;
            const hz = sampleRate / samplesPerPeriod;
            frequency = hz > 1e6 ? `${(hz / 1e6).toFixed(2)} M` :
                hz > 1e3 ? `${(hz / 1e3).toFixed(2)} k` :
                    hz.toFixed(1);
        }
    }

    return {
        vmax: max.toFixed(2),
        vmin: min.toFixed(2),
        vpp: vpp.toFixed(2),
        vmean: mean.toFixed(2),
        vrms: rms.toFixed(2),
        freq: frequency
    };
}
