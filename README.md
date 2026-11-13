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

## Direct Ethernet TCP Input

Ethernet is the network connection; the data protocol used here is TCP. For a direct computer-to-computer cable, assign both Ethernet adapters static IPv4 addresses in the same subnet (for example, MATLAB PC `192.168.1.10/24` and oscilloscope PC `192.168.1.20/24`). Allow inbound TCP port `4000` through the oscilloscope PC's firewall. The bridge listens on all network interfaces, so use only a trusted network.

On the oscilloscope PC, start the TCP-to-WebSocket bridge **instead of** `backend/server.js`:

```sh
cd backend
npm run start:ethernet
```

The bridge accepts newline-delimited UTF-8 JSON over TCP port `4000`. Single-channel messages use `{"sampleRate":100000,"samples":[0.0,0.1,...]}`; paired-channel messages use `{"sampleRate":100000,"xSamples":[...],"ySamples":[...]}`. It forwards each valid message to the frontend over WebSocket at `ws://localhost:8080`. The frontend development server can run as usual with `cd frontend && npm run dev`; keep internal demo mode disabled. The frontend reads the sample rate from each TCP message, so frequency and time-axis measurements use the sender's rate rather than a hardcoded assumption.

### Simulink TCP sender

Use `simulation/TcpJsonStreamer.m` as the System object for a Simulink **MATLAB System** block. For every batch, it measures the elapsed Simulink time between the first and last input samples and derives `sampleRate` from that interval. It rounds the measured rate to a whole sample per second to prevent harmless floating-point variation from repeatedly resetting the browser's sample buffer. Real-time pacing is enabled by default so a fast offline simulation does not flood the browser in bursts.

For X-Y mode, place one Voltage Sensor across each voltage pair to measure, connect each sensor output to its own **PS-Simulink Converter**, and set both converters to the same output sample time. Pass both signals through synchronized **Zero-Order Hold** blocks with the same sample time, then use a **Mux** to form `[X voltage, Y voltage]` in that order. In `browser_dso_model1.slx`, replace the UDP Send block with the **MATLAB System** block. Optionally convert the Mux output to `single`, then connect it to the sender. The block sends corresponding pairs in `xSamples` and `ySamples` arrays. Set the Zero-Order Hold sample time to the desired interval (for example, `0.0001` seconds for 10 kS/s); the model solver fixed step must be that sample interval or a smaller interval that divides it evenly. Set **System object name** to `TcpJsonStreamer`, **ServerAddress** to the oscilloscope computer's Ethernet IP, **Port** to `4000`, and **SamplesPerMessage** to `1000`. Leave **RealtimePacing** enabled for a smooth browser display. Set **Simulate using** to **Interpreted Execution** because the sender uses MATLAB's `tcpclient` and JSON functions. Start the Ethernet bridge before running the model.

On the frontend, paired data appears in **Time** mode as two aligned traces: CH1/X in green and CH2/Y in amber. The X-Y control is enabled when paired data is present; there, the X axis uses `xSamples` and the Y axis uses `ySamples`. Single-channel `samples` messages still show one trace in Time mode and disable X-Y mode. **FFT** mode shows the latest selected sample window as a single-sided amplitude spectrum, with one colored trace per available channel. Choose a window size for frequency resolution, a maximum frequency span to zoom the X axis, and a dB range for the Y axis. The vertical scale auto-centers around the strongest visible peak, and amplitude is shown in dBV relative to 1 Vrms. Internal demo mode also generates a phase-shifted pair so Time, X-Y, and FFT modes can be previewed without the Ethernet sender.

For example, from MATLAB on the other computer:

```matlab
targetIp = "192.168.1.20";
sampleRate = 100000;
samplesPerMessage = 1000;
client = tcpclient(targetIp, 4000);

disp("Streaming data to the oscilloscope...");
for packet = 0:499
    sampleIndex = packet * samplesPerMessage + (0:samplesPerMessage - 1);
    t = sampleIndex / sampleRate;
    samples = sin(2 * pi * 1000 * t) + 0.1 * randn(1, samplesPerMessage);
    message = jsonencode(struct("sampleRate", sampleRate, "samples", samples));
    write(client, uint8([char(message), newline]));
    pause(samplesPerMessage / sampleRate);
end
clear client
```

The TCP bridge reassembles newline-delimited messages because TCP does not preserve write boundaries; each complete line must contain the sample rate and its samples.

## Run the dummy-data tests

The scripts in `tests/` generate their own local sample data. They do not need MATLAB/Simulink, the Ethernet server, the AI service, or an API key, and they do not send data over the network.

To run all three checks from the repository root:

```sh
cd frontend
npm run test:dummy
```

To run one check from the repository root:

```sh
node tests/test-signal-processing.mjs
node tests/test-spectrum.mjs
node tests/test-scope-frames.mjs
```

The signal-processing check covers sample-message parsing, measurements, paired-channel downsampling, and trigger detection. The spectrum check uses a generated 50 Hz sine wave with a 10% third harmonic. The scope-frame check covers single and paired inputs in Time, X-Y, and FFT modes, single acquisition, and FFT axis scaling. More detail is in [`tests/README.md`](tests/README.md).

## AI assistant and waveform analysis

The optional Python service connects to the existing Node WebSocket stream as a second client. It keeps a bounded rolling buffer (up to 10 seconds), computes channel measurements and spectrum summaries locally, and sends a selected capture to the configured model only when the user requests analysis or enables automatic monitoring. It does not sit in the browser rendering path.

The oscilloscope UI includes a context field, optional expected frequency and Vrms fields, a **Analyze current capture** action, chat, and an opt-in automatic monitor. Chat and analysis include a compact capture payload with per-channel measurements, prominent spectrum peaks, a waveform preview, and a spectrum preview. Automatic monitoring checks for persistent candidate conditions locally and limits AI calls to one per minute. Candidate flags are prompts for interpretation, not calibrated fault diagnoses.

Start all three processes on the oscilloscope computer. First start `backend/ethernet-server.js` as described above, then start the AI service:

```sh
cd ai_service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey), set `GEMINI_API_KEY` in `ai_service/.env`, then run:

```sh
uvicorn app:app --host 127.0.0.1 --port 8090
```

Finally start the Vite frontend with `cd frontend && npm run dev`. Vite proxies `/api/ai` to the local Python service. The AI service listens only on localhost and keeps the model key server-side. Without an API key the scope and stream still work; AI controls stay unavailable. Automatic monitoring starts disabled. When you ask for chat/analysis or enable automatic monitoring, capture samples and the entered measurement context are sent to the configured model provider. Review the provider's current data-retention settings before sending sensitive measurements.

The default model is `gemini-3.5-flash-lite`. Set `NODE_WS_URL` or `GEMINI_MODEL` in `.env` to override the defaults. The service currently binds to `127.0.0.1:8090`.
