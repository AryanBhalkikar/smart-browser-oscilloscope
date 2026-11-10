export function normalizeSampleMessage(message) {
    if (!Number.isFinite(message?.sampleRate) || message.sampleRate <= 0) {
        return { error: 'Sample rate must be a positive finite number.' };
    }

    const hasSingleChannel = Array.isArray(message.samples);
    const hasXChannel = Array.isArray(message.xSamples);
    const hasYChannel = Array.isArray(message.ySamples);

    if (hasSingleChannel && !hasXChannel && !hasYChannel) {
        const samples = Float32Array.from(message.samples);
        if (samples.length === 0 || !samples.every(Number.isFinite)) {
            return { error: 'Samples must be a non-empty array of finite numbers.' };
        }
        return { sampleRate: message.sampleRate, mode: 'single', samples };
    }

    if (!hasSingleChannel && hasXChannel && hasYChannel) {
        const xSamples = Float32Array.from(message.xSamples);
        const ySamples = Float32Array.from(message.ySamples);
        if (
            xSamples.length === 0 ||
            xSamples.length !== ySamples.length ||
            !xSamples.every(Number.isFinite) ||
            !ySamples.every(Number.isFinite)
        ) {
            return { error: 'X and Y samples must be non-empty, finite, and the same length.' };
        }
        return { sampleRate: message.sampleRate, mode: 'xy', xSamples, ySamples };
    }

    return { error: 'Message must contain either samples or paired xSamples and ySamples.' };
}

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

export function findTrigger(buffer, totalSamples, head, requiredSamples, sampleRate, level, isRising) {
    if (totalSamples < requiredSamples) return null;

    const available = totalSamples;
    let searchIdx = (head - 1 + buffer.length) % buffer.length;
    const maxSearch = Math.min(available, sampleRate); 

    for (let i = 0; i < maxSearch - 1; i++) {
        const curr = buffer[searchIdx];
        const prevIdx = (searchIdx - 1 + buffer.length) % buffer.length;
        const prev = buffer[prevIdx];

        const triggered = isRising ? (prev < level && curr >= level) : (prev > level && curr <= level);

        if (triggered) {
            const halfWindow = Math.floor(requiredSamples / 2);
            const samplesAfterTrigger = (head - searchIdx + buffer.length) % buffer.length;
            
            if (samplesAfterTrigger >= halfWindow) {
                return (searchIdx - halfWindow + buffer.length) % buffer.length;
            }
        }
        searchIdx = prevIdx;
    }
    return null;
}

export function calculateMeasurements(dataSlice, sampleRate) {
    if (!dataSlice || dataSlice.length === 0) {
        return { vmax: '--', vmin: '--', vpp: '--', vmean: '--', vrms: '--', freq: '--' };
    }

    let max = -Infinity, min = Infinity, sum = 0, sqSum = 0;
    const N = dataSlice.length;

    for (let i = 0; i < N; i++) {
        const v = dataSlice[i];
        if (v > max) max = v;
        if (v < min) min = v;
        sum += v;
        sqSum += v * v;
    }

    const mean = sum / N;
    const rms = Math.sqrt(sqSum / N);
    const vpp = max - min;

    let freqStr = '--';
    if (vpp > 0.1) {
        const hist = vpp * 0.05;
        const crossings = [];
        
        // Track strict rising-edge crossings (going from below mean - hist to above mean + hist)
        let state = dataSlice[0] > mean;

        for (let i = 1; i < N; i++) {
            if (!state && dataSlice[i] >= mean + hist) {
                state = true;
                crossings.push(i); // Record rising edge crossing
            } else if (state && dataSlice[i] <= mean - hist) {
                state = false;
            }
        }

        // If we have at least 2 rising edges, calculate precise frequency
        if (crossings.length >= 2) {
            // Distance between the first and last rising edge divided by the number of complete cycles
            const totalCycles = crossings.length - 1;
            const totalSamplesInCycles = crossings[crossings.length - 1] - crossings[0];
            const avgSamplesPerCycle = totalSamplesInCycles / totalCycles;
            
            const hz = sampleRate / avgSamplesPerCycle;
            freqStr = hz > 1e6 ? (hz / 1e6).toFixed(2) + ' M' : 
                      hz > 1e3 ? (hz / 1e3).toFixed(2) + ' k' : 
                      hz.toFixed(1);
        }
    }

    return {
        vmax: max.toFixed(2),
        vmin: min.toFixed(2),
        vpp: vpp.toFixed(2),
        vmean: mean.toFixed(2),
        vrms: rms.toFixed(2),
        freq: freqStr
    };
}
