import { useState, useEffect, useRef } from 'react';
import { DataBuffer } from '../utils/DataBuffer';
import { PairedDataBuffer } from '../utils/PairedDataBuffer';
import { normalizeSampleMessage } from '../utils/SignalProcessing';
import ControlPanel from '../components/ControlPanel';
import OscilloscopeCanvas from '../components/OscilloscopeCanvas';
import '../App.css';

const SAMPLE_RATE_HZ = 10000;
const WS_URL = 'ws://localhost:8080';

export default function Oscilloscope() {
    const dataBuffer = useRef(new DataBuffer());
    const xyDataBuffer = useRef(new PairedDataBuffer());
    const sampleRateRef = useRef(SAMPLE_RATE_HZ);
    const streamFormatRef = useRef(null);
    // Core App State
    const [wsStatus, setWsStatus] = useState('disconnected');
    const [hasPairedInput, setHasPairedInput] = useState(false);
    const [measurements, setMeasurements] = useState({ vmax: '--', vmin: '--', vpp: '--', vmean: '--', vrms: '--', freq: '--' });

    // Oscilloscope Settings State
    const [settings, setSettings] = useState({
        acqState: 'RUN',
        demoMode: false,
        displayMode: 'TIME',
        voltsPerDiv: 1,
        vOffset: 0,
        xyXVoltsPerDiv: 1,
        xyYVoltsPerDiv: 1,
        xyXOffset: 0,
        xyYOffset: 0,
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

        const resetBuffers = () => {
            dataBuffer.current.clear();
            xyDataBuffer.current.clear();
            setMeasurements({ vmax: '--', vmin: '--', vpp: '--', vmean: '--', vrms: '--', freq: '--' });
        };

        const updateSampleRate = (sampleRate) => {
            const tolerance = Math.max(0.01, sampleRateRef.current * 1e-6);
            if (Math.abs(sampleRate - sampleRateRef.current) <= tolerance) return;

            sampleRateRef.current = sampleRate;
            resetBuffers();
            setSettings(prev => ({ ...prev, sampleRate }));
        };

        const selectStreamFormat = (format) => {
            if (streamFormatRef.current === format) return;
            streamFormatRef.current = format;
            setHasPairedInput(format === 'xy');
            resetBuffers();
            if (format !== 'xy') {
                setSettings(prev => prev.displayMode === 'XY' ? { ...prev, displayMode: 'TIME' } : prev);
            }
        };

        if (settings.demoMode) {
            selectStreamFormat('xy');
            let sampleIndex = 0;
            demoInterval = setInterval(() => {
                if (settings.acqState === 'STOP' || settings.acqState === 'SINGLE_DONE') return;
                const xSamples = new Float32Array(1000);
                const ySamples = new Float32Array(1000);
                for (let i = 0; i < 1000; i++) {
                    const t = (sampleIndex + i) / SAMPLE_RATE_HZ;
                    xSamples[i] = 1.5 * Math.sin(2 * Math.PI * 1000 * t);
                    ySamples[i] = 1.5 * Math.sin(2 * Math.PI * 1000 * t + Math.PI / 3);
                }
                sampleIndex += xSamples.length;
                dataBuffer.current.push(xSamples);
                xyDataBuffer.current.push(xSamples, ySamples);
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

                        const normalized = normalizeSampleMessage(message);
                        if (normalized.error) {
                            console.error(`Invalid sample message: ${normalized.error}`);
                            return;
                        }

                        updateSampleRate(normalized.sampleRate);
                        selectStreamFormat(normalized.mode);
                        if (normalized.mode === 'xy') {
                            dataBuffer.current.push(normalized.xSamples);
                            xyDataBuffer.current.push(normalized.xSamples, normalized.ySamples);
                        } else {
                            dataBuffer.current.push(normalized.samples);
                        }
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

                    updateSampleRate(SAMPLE_RATE_HZ);
                    selectStreamFormat('single');

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
        xyDataBuffer.current.clear();
        setMeasurements({ vmax: '--', vmin: '--', vpp: '--', vmean: '--', vrms: '--', freq: '--' });
    };

    const displayWsStatus = settings.demoMode ? 'demo' : wsStatus;
    const measurementPrefix = settings.displayMode === 'XY'
        ? 'X '
        : hasPairedInput ? 'CH1 ' : '';

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
                        xyDataBuffer={xyDataBuffer}
                        onMeasurementsUpdate={setMeasurements}
                    />
                    <div className="measurements-panel">
                        <div className="meas-item">{measurementPrefix}Vmax: <span>{measurements.vmax}</span> V</div>
                        <div className="meas-item">{measurementPrefix}Vmin: <span>{measurements.vmin}</span> V</div>
                        <div className="meas-item">{measurementPrefix}Vpp: <span>{measurements.vpp}</span> V</div>
                        <div className="meas-item">{measurementPrefix}Vmean: <span>{measurements.vmean}</span> V</div>
                        <div className="meas-item">{measurementPrefix}Vrms: <span>{measurements.vrms}</span> V</div>
                        <div className="meas-item">{measurementPrefix}Freq: <span>{measurements.freq}</span> Hz</div>
                    </div>
                </div>

                <ControlPanel
                    settings={settings}
                    hasPairedInput={hasPairedInput}
                    updateSetting={updateSetting}
                    actions={{ onClear: handleClear }}
                />
            </div>
        </div>
    );
}
