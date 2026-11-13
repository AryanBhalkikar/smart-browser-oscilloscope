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

export function decodeFloat32Message(arrayBuffer) {
    if (!(arrayBuffer instanceof ArrayBuffer)) {
        return { error: 'Binary sample data must be an ArrayBuffer.' };
    }
    if (arrayBuffer.byteLength === 0 || arrayBuffer.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
        return { error: 'Binary Float32 sample data must contain a non-empty multiple of 4 bytes.' };
    }

    const count = arrayBuffer.byteLength / Float32Array.BYTES_PER_ELEMENT;
    const view = new DataView(arrayBuffer);
    const samples = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        samples[i] = view.getFloat32(i * Float32Array.BYTES_PER_ELEMENT, true);
    }
    if (!samples.every(Number.isFinite)) {
        return { error: 'Binary samples must all be finite numbers.' };
    }
    return { samples };
}
