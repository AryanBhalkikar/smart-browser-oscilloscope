import { useState, useEffect, useRef } from 'react';
import { DataBuffer } from '../utils/DataBuffer';
import ControlPanel from '../components/ControlPanel';
import OscilloscopeCanvas from '../components/OscilloscopeCanvas';
import '../App.css';

const SAMPLE_RATE_HZ = 10000;
const WS_URL = 'ws://localhost:8080';

export default function Oscilloscope() {
    const dataBuffer = useRef(new DataBuffer());
    const sampleRateRef = useRef(SAMPLE_RATE_HZ);
    // Core App State
    const [wsStatus, setWsStatus] = useState('disconnected');
    const [measurements, setMeasurements] = useState({ vmax: '--', vmin: '--', vpp: '--', vmean: '--', vrms: '--', freq: '--' });

    // Oscilloscope Settings State
    const [settings, setSettings] = useState({
        acqState: 'RUN',
        demoMode: false,
        voltsPerDiv: 1,
        vOffset: 0,
        timePerDiv: 0.01,
        trigMode: 'AUTO',
        trigEdge: 'RISING',
        trigLevel: 0,
        sampleRate: SAMPLE_RATE_HZ
    });

    const updateSetting = (key, value) => {
        setSettings(prev => {
            const next = { ...prev, [key]: value };
            if (key === 'acqState' && value === 'SINGLE_WAIT') next.trigMode = 'NORMAL';
            return next;
        });
    };

    // WebSocket / Demo Data Ingestion
    useEffect(() => {
        let ws;
        let demoInterval;

        if (settings.demoMode) {
            let phase = 0;
            demoInterval = setInterval(() => {
                if (settings.acqState === 'STOP' || settings.acqState === 'SINGLE_DONE') return;
                const chunk = new Float32Array(1000);
                for (let i = 0; i < 1000; i++) {
                    const t = phase + i / SAMPLE_RATE_HZ;
                    chunk[i] = 1.5 * Math.sin(2 * Math.PI * 1000 * t) + 0.5 * Math.sin(2 * Math.PI * 2500 * t) + (Math.random() * 0.1 - 0.05);
                }
                phase += 1000 / SAMPLE_RATE_HZ;
                dataBuffer.current.push(chunk);
            }, (1000 / SAMPLE_RATE_HZ) * 1000);
        } else {
            const connect = () => {
                setWsStatus('connecting');
                ws = new WebSocket(WS_URL);
                ws.binaryType = 'arraybuffer';
                ws.onopen = () => setWsStatus('connected');
                ws.onclose = () => { setWsStatus('disconnected'); setTimeout(connect, 3000); };
                ws.onmessage = (e) => {
                    if (typeof e.data === 'string') {
                        let message;
                        try {
                            message = JSON.parse(e.data);
                        } catch (err) {
                            console.error(`Invalid JSON sample message: ${err.message}`);
                            return;
                        }

                        if (
                            !Number.isFinite(message?.sampleRate) ||
                            message.sampleRate <= 0 ||
                            !Array.isArray(message.samples) ||
                            message.samples.length === 0 ||
                            !message.samples.every(Number.isFinite)
                        ) {
                            console.error('Expected JSON with a positive finite sampleRate and a non-empty array of finite samples.');
                            return;
                        }

                        const samples = Float32Array.from(message.samples);
                        if (!samples.every(Number.isFinite)) {
                            console.error('Sample values must fit in the Float32 range.');
                            return;
                        }

                        const sampleRateTolerance = Math.max(0.01, sampleRateRef.current * 1e-6);
                        if (Math.abs(message.sampleRate - sampleRateRef.current) > sampleRateTolerance) {
                            sampleRateRef.current = message.sampleRate;
                            dataBuffer.current.clear();
                            setMeasurements({ vmax: '--', vmin: '--', vpp: '--', vmean: '--', vrms: '--', freq: '--' });
                            setSettings(prev => ({ ...prev, sampleRate: message.sampleRate }));
                        }

                        dataBuffer.current.push(samples);
                        return;
                    }

                    if (!(e.data instanceof ArrayBuffer)) {
                        console.error('Expected JSON samples or binary Float32 sample data from the WebSocket.');
                        return;
                    }

                    if (e.data.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
                        console.error(`Received ${e.data.byteLength} bytes; Float32 sample data must be a multiple of 4 bytes.`);
                        return;
                    }

                    if (sampleRateRef.current !== SAMPLE_RATE_HZ) {
                        sampleRateRef.current = SAMPLE_RATE_HZ;
                        dataBuffer.current.clear();
                        setMeasurements({ vmax: '--', vmin: '--', vpp: '--', vmean: '--', vrms: '--', freq: '--' });
                        setSettings(prev => ({ ...prev, sampleRate: SAMPLE_RATE_HZ }));
                    }

                    const sampleCount = e.data.byteLength / Float32Array.BYTES_PER_ELEMENT;
                    const view = new DataView(e.data);
                    const samples = new Float32Array(sampleCount);
                    for (let i = 0; i < sampleCount; i++) {
                        samples[i] = view.getFloat32(i * Float32Array.BYTES_PER_ELEMENT, true);
                    }
                    dataBuffer.current.push(samples);
                };
            };
            connect();
        }

        return () => {
            if (ws) ws.close();
            if (demoInterval) clearInterval(demoInterval);
        };
    }, [settings.demoMode, settings.acqState]);

    const handleClear = () => {
        dataBuffer.current.clear();
        setMeasurements({ vmax: '--', vmin: '--', vpp: '--', vmean: '--', vrms: '--', freq: '--' });
    };

    const displayWsStatus = settings.demoMode ? 'demo' : wsStatus;

    return (
        <div className="dso-container">
            <header className="dso-header">
                <div className="branding">Digital Storage Oscilloscope</div>
                <div className="status-panel">
                    <span className={`indicator ${displayWsStatus}`}>WS: {displayWsStatus.toUpperCase()}</span>
                    <span className={`indicator ${settings.acqState === 'STOP' ? 'stopped' : 'running'}`}>
                        ACQ: {settings.acqState === 'SINGLE_WAIT' ? 'Wait Trigger' : settings.acqState}
                    </span>
                    <span>{(settings.sampleRate / 1000).toFixed(1)} kS/s</span>
                </div>
            </header>

            <div className="dso-main">
                <div className="dso-screen-container">
                    <OscilloscopeCanvas
                        settings={settings}
                        dataBuffer={dataBuffer}
                        onMeasurementsUpdate={setMeasurements}
                    />
                    <div className="measurements-panel">
                        <div className="meas-item">Vmax: <span>{measurements.vmax}</span> V</div>
                        <div className="meas-item">Vmin: <span>{measurements.vmin}</span> V</div>
                        <div className="meas-item">Vpp: <span>{measurements.vpp}</span> V</div>
                        <div className="meas-item">Vmean: <span>{measurements.vmean}</span> V</div>
                        <div className="meas-item">Vrms: <span>{measurements.vrms}</span> V</div>
                        <div className="meas-item">Freq: <span>{measurements.freq}</span> Hz</div>
                    </div>
                </div>

                <ControlPanel
                    settings={settings}
                    updateSetting={updateSetting}
                    actions={{ onClear: handleClear }}
                />
            </div>
        </div>
    );
}
