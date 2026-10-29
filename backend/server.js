import dgram from 'node:dgram';
import { WebSocketServer, WebSocket } from 'ws';

const UDP_PORT = 4000;
const WS_PORT = 8080;

const wss = new WebSocketServer({ port: WS_PORT });

wss.on("connection", (ws) => {
    console.log("Frontend client connected to WebSocket");

    ws.on("close", () => {
        console.log("Frontend client disconnected");
    });
});

console.log(`WebSocket server running on ws://localhost:${WS_PORT}`);

const udpServer = dgram.createSocket('udp4');

udpServer.on('error', (err) => {
    console.error(`UDP server error:\n${err.stack}`);
    udpServer.close();
});

udpServer.on('message', (msg) => {
    const floatVal = msg.readFloatLE(0);
    console.log(`Server received: ${floatVal}`);

    for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    }
});

udpServer.on('listening', () => {
    const address = udpServer.address();
    console.log(`UDP server listening ${address.address}:${address.port}`);
});

udpServer.bind(UDP_PORT, '0.0.0.0', () => {
    console.log(`Server listening on all interfaces at port ${UDP_PORT}`);
});