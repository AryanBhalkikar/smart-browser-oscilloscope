const BUFFER_SIZE = 1000000;

export class DataBuffer {
    constructor() {
        this.buffer = new Float32Array(BUFFER_SIZE);
        this.head = 0;
        this.tail = 0;
        this.totalSamplesReceived = 0;
        this.version = 0;
        this.generation = 0;
    }

    push(samples) {
        if (samples.length === 0) return;
        for (let i = 0; i < samples.length; i++) {
            this.buffer[this.head] = samples[i];
            this.head = (this.head + 1) % BUFFER_SIZE;
            
            if (this.totalSamplesReceived < BUFFER_SIZE) {
                this.totalSamplesReceived++;
            } else {
                this.tail = (this.tail + 1) % BUFFER_SIZE;
            }
        }
        this.version++;
    }

    clear() {
        this.head = 0;
        this.tail = 0;
        this.totalSamplesReceived = 0;
        this.version++;
        this.generation++;
    }

    extractWindow(startIdx, requiredSamples) {
        const result = new Float32Array(requiredSamples);
        const actualStart = (startIdx + BUFFER_SIZE) % BUFFER_SIZE;
        for (let i = 0; i < requiredSamples; i++) {
            result[i] = this.buffer[(actualStart + i) % BUFFER_SIZE];
        }
        return result;
    }

    extractLatest(requiredSamples) {
        const available = Math.min(this.totalSamplesReceived, requiredSamples);
        const startIdx = (this.head - available + BUFFER_SIZE) % BUFFER_SIZE;
        return this.extractWindow(startIdx, available);
    }
}
