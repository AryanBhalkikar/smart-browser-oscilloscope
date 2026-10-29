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
        let state = dataSlice[0] > mean;

        for (let i = 1; i < N; i++) {
            if (state && dataSlice[i] < mean - hist) {
                state = false;
            } else if (!state && dataSlice[i] > mean + hist) {
                state = true;
                crossings.push(i);
            }
        }

        if (crossings.length >= 2) {
            const avgSamplesPerCycle = (crossings[crossings.length - 1] - crossings[0]) / (crossings.length - 1);
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