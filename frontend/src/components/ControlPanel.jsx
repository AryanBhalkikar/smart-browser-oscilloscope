import React from 'react';

export default function ControlPanel({ settings, updateSetting, actions }) {
    return (
        <aside className="dso-controls">
            <section className="control-group">
                <h3>Acquisition</h3>
                <div className="button-grid">
                    <button className={settings.acqState === 'RUN' ? 'active' : ''} onClick={() => updateSetting('acqState', 'RUN')}>Run</button>
                    <button className={settings.acqState === 'STOP' ? 'active' : ''} onClick={() => updateSetting('acqState', 'STOP')}>Stop</button>
                    <button className={settings.acqState.includes('SINGLE') ? 'active' : ''} onClick={() => updateSetting('acqState', 'SINGLE_WAIT')}>Single</button>
                    <button onClick={actions.onClear}>Clear</button>
                </div>
                <div className="demo-toggle">
                    <input type="checkbox" id="chk-demo" checked={settings.demoMode} onChange={(e) => updateSetting('demoMode', e.target.checked)} />
                    <label htmlFor="chk-demo">Enable Internal Demo Data</label>
                </div>
            </section>

            <section className="control-group">
                <h3>Vertical</h3>
                <div className="control-row">
                    <label>Scale (V/div)</label>
                    <select value={settings.voltsPerDiv} onChange={(e) => updateSetting('voltsPerDiv', parseFloat(e.target.value))}>
                        <option value="5">5 V</option><option value="2">2 V</option>
                        <option value="1">1 V</option><option value="0.5">500 mV</option>
                        <option value="0.2">200 mV</option><option value="0.1">100 mV</option>
                    </select>
                </div>
                <div className="control-row">
                    <label>Position (V)</label>
                    <input type="range" min="-10" max="10" step="0.1" value={settings.vOffset} onChange={(e) => updateSetting('vOffset', parseFloat(e.target.value))} />
                    <span>{settings.vOffset.toFixed(1)} V</span>
                </div>
            </section>

            <section className="control-group">
                <h3>Horizontal</h3>
                <div className="control-row">
                    <label>Time (s/div)</label>
                    <select value={settings.timePerDiv} onChange={(e) => updateSetting('timePerDiv', parseFloat(e.target.value))}>
                        <option value="0.05">50 ms</option><option value="0.01">10 ms</option>
                        <option value="0.005">5 ms</option><option value="0.001">1 ms</option>
                        <option value="0.0005">500 µs</option><option value="0.0001">100 µs</option>
                    </select>
                </div>
            </section>

            <section className="control-group">
                <h3>Trigger</h3>
                <div className="control-row">
                    <label>Mode</label>
                    <select value={settings.trigMode} onChange={(e) => updateSetting('trigMode', e.target.value)}>
                        <option value="AUTO">Auto</option><option value="NORMAL">Normal</option>
                    </select>
                </div>
                <div className="control-row">
                    <label>Edge</label>
                    <select value={settings.trigEdge} onChange={(e) => updateSetting('trigEdge', e.target.value)}>
                        <option value="RISING">Rising</option><option value="FALLING">Falling</option>
                    </select>
                </div>
                <div className="control-row">
                    <label>Level (V)</label>
                    <input type="range" min="-10" max="10" step="0.1" value={settings.trigLevel} onChange={(e) => updateSetting('trigLevel', parseFloat(e.target.value))} />
                    <span>{settings.trigLevel.toFixed(1)} V</span>
                </div>
            </section>
        </aside>
    );
}