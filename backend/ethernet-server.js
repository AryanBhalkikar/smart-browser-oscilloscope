import net from 'node:net';
import { WebSocketServer, WebSocket } from 'ws';

const TCP_PORT = 4000;
const WS_PORT = 8080;
const MAX_LINE_BYTES = 4 * 1024 * 1024;
const MAX_SAMPLES_PER_MESSAGE = 100_000;
const MAX_WS_BUFFERED_BYTES = 8 * 1024 * 1024;

const wss = new WebSocketServer({ port: WS_PORT });

wss.on('connection', (ws) => {
    console.log('Frontend client connected to WebSocket');
    ws.on('close', () => console.log('Frontend client disconnected'));
});

wss.on('listening', () => {
    console.log(`WebSocket server running on ws://localhost:${WS_PORT}`);
});

wss.on('error', (err) => {
    console.error(`WebSocket server error: ${err.message}`);
});

function broadcast(message) {
    const serialized = JSON.stringify(message);

    for (const client of wss.clients) {
        if (client.readyState !== WebSocket.OPEN) continue;

        if (client.bufferedAmount > MAX_WS_BUFFERED_BYTES) {
            console.error('Closing a WebSocket client that cannot keep up with the sample stream.');
            client.close(1013, 'Client cannot keep up with sample stream');
            continue;
        }

        client.send(serialized, (err) => {
            if (err) console.error(`WebSocket send error: ${err.message}`);
        });
    }
}

function handleLine(line, socket) {
    if (!line.trim()) return true;

    let message;
    try {
        message = JSON.parse(line);
    } catch (err) {
        console.error(`Invalid JSON from TCP client: ${err.message}`);
        socket.destroy();
        return false;
    }

    const { sampleRate, samples, xSamples, ySamples } = message ?? {};
    const validRate = Number.isFinite(sampleRate) && sampleRate > 0;
    const isSingleChannel = Array.isArray(samples) && xSamples === undefined && ySamples === undefined;
    const isPairedChannel = samples === undefined && Array.isArray(xSamples) && Array.isArray(ySamples);
    const validSingleChannel = isSingleChannel &&
        samples.length > 0 &&
        samples.length <= MAX_SAMPLES_PER_MESSAGE &&
        samples.every(Number.isFinite);
    const validPairedChannel = isPairedChannel &&
        xSamples.length > 0 &&
        xSamples.length === ySamples.length &&
        xSamples.length <= MAX_SAMPLES_PER_MESSAGE &&
        xSamples.every(Number.isFinite) &&
        ySamples.every(Number.isFinite);

    if (!validRate || (!validSingleChannel && !validPairedChannel)) {
        console.error('TCP message must contain a positive sampleRate and either 1-100000 finite samples or equally sized finite xSamples and ySamples arrays.');
        socket.destroy();
        return false;
    }

    broadcast(validSingleChannel
        ? { sampleRate, samples }
        : { sampleRate, xSamples, ySamples });
    return true;
}

const tcpServer = net.createServer((socket) => {
    const remoteAddress = `${socket.remoteAddress}:${socket.remotePort}`;
    console.log(`TCP data source connected: ${remoteAddress}`);
    socket.setEncoding('utf8');

    let pending = '';
    socket.on('data', (chunk) => {
        pending += chunk;

        let newlineIndex;
        while ((newlineIndex = pending.indexOf('\n')) !== -1) {
            const line = pending.slice(0, newlineIndex);
            pending = pending.slice(newlineIndex + 1);

            if (Buffer.byteLength(line, 'utf8') > MAX_LINE_BYTES) {
                console.error(`TCP message from ${remoteAddress} exceeds the ${MAX_LINE_BYTES}-byte limit.`);
                socket.destroy();
                return;
            }

            if (!handleLine(line, socket)) return;
        }

        if (Buffer.byteLength(pending, 'utf8') > MAX_LINE_BYTES) {
            console.error(`Incomplete TCP message from ${remoteAddress} exceeds the ${MAX_LINE_BYTES}-byte limit.`);
            socket.destroy();
        }
    });

    socket.on('close', () => console.log(`TCP data source disconnected: ${remoteAddress}`));
    socket.on('error', (err) => console.error(`TCP client error (${remoteAddress}): ${err.message}`));
});

tcpServer.on('error', (err) => {
    console.error(`TCP server error: ${err.message}`);
});

tcpServer.listen(TCP_PORT, '0.0.0.0', () => {
    console.log(`TCP server listening on all network interfaces at port ${TCP_PORT}`);
});
