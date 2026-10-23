# Browser-Based Smart Oscilloscope

## Project Description
The system will function as a web-based DSO. By using instrument transformers and microcontroller ADCs, it will capture continuous AC waveforms, current and scaled voltages. The final product (on web browser) will have features like real-time digital signal processing, waveform spectrum analysis via FFT, X-Y mode for generating Lissajous figures to calculate phase angle errors, etc. An AI agent will be integrated to autonomously monitor the live telemetry to flag anomalies or calibration drift. This project can provide a low-cost and scalable architecture for remote equipment monitoring and automated fault diagnostics.

## Architecture

*1. Signal Generation & Edge Transmission*
* *Tools:* MATLAB Simulink, Quantizer, Byte Pack, and the Instrument Control Toolbox (specifically the UDP Send block).
* *Data Flow & Form:* The Simulink model generates a sine wave (representing AC mains) and simulates an ADC by sampling the signal at a fixed frequency. It packs the sampled voltage values into a raw binary payload to minimize network bandwidth. This binary payload is then streamed via UDP to `127.0.0.1` (localhost) on port `4000`.

*2. Backend Ingestion & Processing*
* *Tools:* Node.js and its native `dgram` module.
* *Data Flow & Form:* The Node.js UDP socket receives the incoming binary packets as a `Buffer`. The backend unpacks these binary values (e.g., using `buffer.readFloatLE()`) and groups the discrete voltage readings into arrays of 50-100 samples.

*3. Real-Time Broadcasting (Direct Connection)*
* *Tools:* Node.js with WebSockets (`Socket.io` or `ws`).
* *Data Flow & Form:* the Node.js server directly broadcasts these grouped arrays of voltage data to all connected WebSocket clients.

*4. Frontend Ingestion & Rendering*
* *Tools:* React.js (set up with Vite) and the HTML5 `<canvas>` API.
* *Data Flow & Form:* The React frontend connects to the WebSocket bridge and sequentially appends the incoming voltage arrays into a high-performance `Float32Array`. A `requestAnimationFrame` loop plots the time-domain waveform on the canvas. The time axis is naturally reconstructed by multiplying the sample's array index by the known fixed sampling interval.

*5. AI Monitoring*
* *Tools:* Python (FastAPI).
* *Data Flow & Form:*  the Python agent will simply connect directly to the Node.js WebSocket server as another standard client to receive the live data arrays.