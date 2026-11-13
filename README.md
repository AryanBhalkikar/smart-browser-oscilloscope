# Browser-Based Smart Oscilloscope

## Project Description

This project displays sampled voltage waveforms in a browser oscilloscope. It can show one or two channels in Time mode, plot paired channels in X-Y mode, calculate an FFT spectrum, and report basic measurements. An optional Python AI service can explain a capture using the waveform data and the user's measurement context.

The repository handles sample transport, processing and display. It does not include physical probes, sensors or ADC hardware; Simulink data or an external measurement device must provide the voltage samples.

## Architecture

The normal Ethernet workflow moves waveform samples through these parts:

1. **Signal and sampling — MATLAB/Simulink.** Simulink generates or measures voltage signals. For a physical Simscape electrical circuit, a Voltage Sensor measures across two nodes and a PS-Simulink Converter turns its physical signal into a Simulink signal. The model samples the channel or synchronized channel pair and `simulation/TcpJsonStreamer.m` sends batches as newline-delimited JSON over TCP to the oscilloscope computer on port `4000`.
2. **Network bridge — Node.js.** `backend/ethernet-server.js` accepts TCP connections, checks the JSON message and sample arrays, then broadcasts valid data to browser clients over WebSocket on port `8080`. TCP carries data between the computers; WebSocket carries it from the local bridge to the browser. This bridge does not calculate circuit measurements.
3. **Stream handling — React frontend.** `frontend/src/hooks/useOscilloscopeStream.js` connects to the WebSocket, validates/normalizes incoming samples through `frontend/src/utils/SampleMessage.js`, and stores samples in rolling channel buffers. The message includes the sample rate, which the frontend uses to place samples on the time axis and calculate frequency-related values.
4. **Processing and display — frontend utilities and renderers.** Focused modules under `frontend/src/utils/` handle waveform measurements, trigger detection, paired-channel data and FFT calculations. Modules under `frontend/src/renderers/` draw the grid, Time traces, X-Y pattern and spectrum on the oscilloscope canvas. React components provide controls, measurements and status around that canvas. Demo mode generates local sample data so the display can be explored without the Ethernet sender.
5. **Optional AI analysis — Python/FastAPI and Gemini.** `ai_service/app.py` connects as another client to the Node WebSocket stream, keeps a bounded recent-data buffer, and calculates a compact capture summary. When the user requests analysis or enables monitoring, it sends that summary, selected waveform data and the user's context to the configured Gemini model. This service is separate from the display and measurement path; the oscilloscope continues to work without it.

The bridge also has a separate older UDP entry point in `backend/server.js`; the direct Ethernet instructions below use the TCP JSON bridge, `backend/ethernet-server.js`.

## Measurement and instrumentation concepts

- **Instrumentation** means the equipment and steps used to turn a real electrical signal into data that can be viewed: a sensor or probe, any needed signal scaling, an ADC or simulator sampling step, and the software that displays the samples.
- **A sensor measures; it does not automatically make a signal safe or correctly scaled.** In Simscape, a Voltage Sensor measures the difference between two circuit nodes. The PS-Simulink Converter makes that measured value available to normal Simulink blocks. A real circuit needs a correctly rated, isolated sensor/probe and suitable hardware; this software does not provide electrical isolation or protection.
- **Sampling** means taking repeated readings over time. The sample rate (samples per second, or S/s) and the actual time interval between readings determine how accurately the waveform and its frequency can be represented. The sender must report the rate that matches its samples.
- **Calibration and scaling** connect displayed numbers to real volts. If a sensor, divider, probe or ADC changes the signal size, its scale factor must be applied correctly. A wrong scale produces wrong voltage readings even if the plotted shape looks right.
- **Measurements are calculated from samples.** Peak-to-peak voltage (Vpp) is the difference between the highest and lowest values; RMS estimates the effective AC voltage; frequency estimates how often the waveform repeats. They depend on valid samples, a correct sample rate and any required calibration factor.
- **FFT and X-Y are different views of the same samples.** FFT shows the signal's frequency components (including harmonics). X-Y plots one channel against the other; with two periodic signals it can reveal their phase relationship. Neither view replaces checking sensor scaling or calibration.

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
