import { useCallback, useState } from 'react';
import { useOscilloscopeStream } from '../hooks/useOscilloscopeStream';
import { DEFAULT_SAMPLE_RATE_HZ } from '../constants/scope';
import ControlPanel from '../components/ControlPanel';
import OscilloscopeCanvas from '../components/OscilloscopeCanvas';
import MeasurementPanel from '../components/MeasurementPanel';
import '../App.css';

const EMPTY_MEASUREMENTS = { channels: [] };

export default function Oscilloscope() {
    const [measurements, setMeasurements] = useState(EMPTY_MEASUREMENTS);
    const [settings, setSettings] = useState({
        acqState: 'RUN',
        demoMode: false,
        displayMode: 'TIME',
        showMeasurements: true,
        voltsPerDiv: 1,
        vOffset: 0,
        xyXVoltsPerDiv: 1,
        xyYVoltsPerDiv: 1,
        xyXOffset: 0,
        xyYOffset: 0,
        fftSize: 4096,
        fftMaxFrequency: 2000,
        fftDbRange: 80,
        timePerDiv: 0.01,
        trigMode: 'AUTO',
        trigEdge: 'RISING',
        trigLevel: 0,
        sampleRate: DEFAULT_SAMPLE_RATE_HZ
    });

    const updateSetting = useCallback((key, value) => {
        setSettings(prev => {
            const next = { ...prev, [key]: value };
            if (key === 'acqState' && value === 'SINGLE_WAIT') next.trigMode = 'NORMAL';
            return next;
        });
    }, []);

    const handleSampleRateChange = useCallback((sampleRate) => {
        setSettings(prev => ({ ...prev, sampleRate }));
    }, []);
    const handleStreamFormatChange = useCallback((format) => {
        if (format !== 'xy') {
            setSettings(prev => prev.displayMode === 'XY' ? { ...prev, displayMode: 'TIME' } : prev);
        }
    }, []);
    const handleMeasurementsReset = useCallback(() => setMeasurements(EMPTY_MEASUREMENTS), []);
    const handleSingleTriggered = useCallback(() => {
        setSettings(prev => prev.acqState === 'SINGLE_WAIT' ? { ...prev, acqState: 'SINGLE_DONE' } : prev);
    }, []);

    const { dataBuffer, xyDataBuffer, wsStatus, hasPairedInput, clearBuffers } = useOscilloscopeStream({
        demoMode: settings.demoMode,
        acqState: settings.acqState,
        sampleRate: settings.sampleRate,
        onSampleRateChange: handleSampleRateChange,
        onStreamFormatChange: handleStreamFormatChange,
        onMeasurementsReset: handleMeasurementsReset
    });

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
                        xyDataBuffer={xyDataBuffer}
                        onMeasurementsUpdate={setMeasurements}
                        onSingleTriggered={handleSingleTriggered}
                    />
                    {settings.showMeasurements && <MeasurementPanel measurements={measurements} />}
                </div>

                <ControlPanel
                    settings={settings}
                    hasPairedInput={hasPairedInput}
                    updateSetting={updateSetting}
                    actions={{ onClear: clearBuffers }}
                />
            </div>
        </div>
    );
}
