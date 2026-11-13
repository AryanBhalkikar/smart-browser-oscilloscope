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
