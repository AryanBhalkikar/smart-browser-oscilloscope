const METRICS = [
    { key: 'vmax', label: 'Vmax', unit: 'V' },
    { key: 'vmin', label: 'Vmin', unit: 'V' },
    { key: 'vpp', label: 'Vpp', unit: 'V' },
    { key: 'vmean', label: 'Mean', unit: 'V' },
    { key: 'vrms', label: 'Vrms', unit: 'V' },
    { key: 'freq', label: 'Freq', unit: 'Hz' }
];

const EMPTY_CHANNEL = { vmax: '--', vmin: '--', vpp: '--', vmean: '--', vrms: '--', freq: '--' };

export default function MeasurementPanel({ measurements }) {
    const channels = measurements?.channels ?? [];

    return (
        <section className="measurements-panel" aria-label="Waveform measurements">
            {(channels.length ? channels : [EMPTY_CHANNEL]).map((channel, index) => (
                <div className={`measurement-channel channel-${index + 1}`} key={index}>
                    <h3>CH{index + 1}</h3>
                    <div className="measurement-values">
                        {METRICS.map(({ key, label, unit }) => {
                            const value = channel[key] ?? '--';
                            const frequencyUnit = key === 'freq' && value !== '--'
                                ? value.endsWith(' M') ? 'MHz' : value.endsWith(' k') ? 'kHz' : 'Hz'
                                : unit;
                            const displayValue = key === 'freq' ? value.replace(/ [kM]$/, '') : value;
                            return (
                                <div className="measurement-value" key={key}>
                                    <span className="measurement-label">{label}</span>
                                    <span className="measurement-reading">{displayValue} <small>{frequencyUnit}</small></span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </section>
    );
}
