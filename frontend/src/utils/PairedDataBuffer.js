const BUFFER_SIZE = 1000000;

export class PairedDataBuffer {
    constructor() {
        this.xBuffer = new Float32Array(BUFFER_SIZE);
        this.yBuffer = new Float32Array(BUFFER_SIZE);
        this.head = 0;
        this.totalSamplesReceived = 0;
        this.version = 0;
        this.generation = 0;
    }

    push(xSamples, ySamples) {
        if (xSamples.length !== ySamples.length) {
            throw new RangeError('X and Y sample arrays must have the same length.');
        }

        for (let i = 0; i < xSamples.length; i++) {
            this.xBuffer[this.head] = xSamples[i];
            this.yBuffer[this.head] = ySamples[i];
            this.head = (this.head + 1) % BUFFER_SIZE;
            this.totalSamplesReceived = Math.min(this.totalSamplesReceived + 1, BUFFER_SIZE);
        }
        if (xSamples.length > 0) this.version++;
    }

    clear() {
        this.head = 0;
        this.totalSamplesReceived = 0;
        this.version++;
        this.generation++;
    }

    extractWindow(startIndex, requiredSamples) {
        const available = Math.min(requiredSamples, this.totalSamplesReceived);
        const start = (startIndex + BUFFER_SIZE) % BUFFER_SIZE;
        const x = new Float32Array(available);
        const y = new Float32Array(available);

        for (let i = 0; i < available; i++) {
            const index = (start + i) % BUFFER_SIZE;
            x[i] = this.xBuffer[index];
            y[i] = this.yBuffer[index];
        }

        return { x, y };
    }

    extractLatest(requiredSamples) {
        const available = Math.min(this.totalSamplesReceived, requiredSamples);
        const start = (this.head - available + BUFFER_SIZE) % BUFFER_SIZE;
        return this.extractWindow(start, available);
    }
}
