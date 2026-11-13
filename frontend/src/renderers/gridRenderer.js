import { TIME_DIVISIONS_X, VOLTAGE_DIVISIONS_Y } from '../constants/scope';

const SPECTRUM_MARGINS = { left: 72, right: 16, top: 32, bottom: 48 };

export function getSpectrumPlotRect(width, height) {
    const left = Math.min(SPECTRUM_MARGINS.left, width * 0.24);
    const right = Math.min(SPECTRUM_MARGINS.right, width * 0.05);
    const top = Math.min(SPECTRUM_MARGINS.top, height * 0.12);
    const bottom = Math.min(SPECTRUM_MARGINS.bottom, height * 0.18);
    return {
        left,
        top,
        width: Math.max(1, width - left - right),
        height: Math.max(1, height - top - bottom)
    };
}

export function drawGrid(ctx, width, height, settings, frame) {
    if (frame.mode === 'FFT') {
        drawSpectrumGrid(ctx, width, height, frame);
        return;
    }

    drawFullCanvasGrid(ctx, width, height);
    ctx.fillStyle = 'rgba(0, 255, 0, 0.7)';
    ctx.font = '10px monospace';
    if (frame.mode === 'XY') drawXYLabels(ctx, width, height, settings);
    else drawTimeLabels(ctx, width, height, settings);
}

function drawFullCanvasGrid(ctx, width, height) {
    ctx.lineWidth = 1;
    for (let division = 0; division <= TIME_DIVISIONS_X; division++) {
        const x = (width / TIME_DIVISIONS_X) * division;
        drawGridLine(ctx, x, 0, x, height, division === TIME_DIVISIONS_X / 2);
    }
    for (let division = 0; division <= VOLTAGE_DIVISIONS_Y; division++) {
        const y = (height / VOLTAGE_DIVISIONS_Y) * division;
        drawGridLine(ctx, 0, y, width, y, division === VOLTAGE_DIVISIONS_Y / 2);
    }
}

function drawSpectrumGrid(ctx, width, height, frame) {
    const plot = getSpectrumPlotRect(width, height);
    ctx.lineWidth = 1;
    for (let division = 0; division <= TIME_DIVISIONS_X; division++) {
        const x = plot.left + (plot.width / TIME_DIVISIONS_X) * division;
        drawGridLine(ctx, x, plot.top, x, plot.top + plot.height, division === TIME_DIVISIONS_X / 2);
    }
    for (let division = 0; division <= VOLTAGE_DIVISIONS_Y; division++) {
        const y = plot.top + (plot.height / VOLTAGE_DIVISIONS_Y) * division;
        drawGridLine(ctx, plot.left, y, plot.left + plot.width, y, division === VOLTAGE_DIVISIONS_Y / 2);
    }

    ctx.fillStyle = 'rgba(0, 255, 0, 0.78)';
    ctx.font = '11px monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    for (let division = 0; division <= VOLTAGE_DIVISIONS_Y; division++) {
        const dbv = frame.ceilingDbv -
            ((frame.ceilingDbv - frame.floorDbv) * division) / VOLTAGE_DIVISIONS_Y;
        const y = plot.top + (plot.height / VOLTAGE_DIVISIONS_Y) * division;
        ctx.fillText(`${dbv.toFixed(0)}`, plot.left - 9, y);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Amplitude (dBV re 1 Vrms)', 8, 17);

    ctx.textAlign = 'center';
    for (let division = 0; division <= TIME_DIVISIONS_X; division++) {
        const frequency = (frame.maxFrequencyHz * division) / TIME_DIVISIONS_X;
        const x = plot.left + (plot.width / TIME_DIVISIONS_X) * division;
        ctx.textAlign = division === 0 ? 'left' : division === TIME_DIVISIONS_X ? 'right' : 'center';
        ctx.fillText(formatFrequencyTick(frequency), x, plot.top + plot.height + 17);
    }
    ctx.textAlign = 'center';
    ctx.fillText('Frequency (Hz)', plot.left + plot.width / 2, height - 5);
    ctx.textAlign = 'left';
}

function drawGridLine(ctx, x1, y1, x2, y2, isMajor) {
    ctx.strokeStyle = isMajor ? 'rgba(0, 255, 0, 0.5)' : 'rgba(0, 255, 0, 0.15)';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
}

function formatFrequencyTick(hz) {
    if (hz >= 1000) {
        const khz = hz / 1000;
        return `${khz.toFixed(khz % 1 === 0 ? 0 : 1)}k`;
    }
    return hz.toFixed(0);
}

function drawXYLabels(ctx, width, height, settings) {
    for (let division = 1; division < TIME_DIVISIONS_X; division++) {
        const x = (width / TIME_DIVISIONS_X) * division;
        const volts = settings.xyXOffset + (division - TIME_DIVISIONS_X / 2) * settings.xyXVoltsPerDiv;
        ctx.fillText(`${volts.toFixed(2)}V`, x + 2, height - 5);
    }
    for (let division = 1; division < VOLTAGE_DIVISIONS_Y; division++) {
        const y = (height / VOLTAGE_DIVISIONS_Y) * division;
        const volts = settings.xyYOffset + (VOLTAGE_DIVISIONS_Y / 2 - division) * settings.xyYVoltsPerDiv;
        ctx.fillText(`${volts.toFixed(2)}V`, 5, y - 5);
    }
}

function drawTimeLabels(ctx, width, height, settings) {
    for (let division = 1; division < TIME_DIVISIONS_X; division++) {
        const x = (width / TIME_DIVISIONS_X) * division;
        const seconds = (division - TIME_DIVISIONS_X / 2) * settings.timePerDiv;
        const label = Math.abs(seconds) < 1e-3 ? `${(seconds * 1e6).toFixed(0)}µs` :
            Math.abs(seconds) < 1 ? `${(seconds * 1e3).toFixed(1)}ms` : `${seconds.toFixed(2)}s`;
        ctx.fillText(label, x + 2, height - 5);
    }

    const pixelsPerVolt = height / (VOLTAGE_DIVISIONS_Y * settings.voltsPerDiv);
    for (let division = 1; division < VOLTAGE_DIVISIONS_Y; division++) {
        const y = (height / VOLTAGE_DIVISIONS_Y) * division;
        const volts = settings.vOffset + ((height / 2 - y) / pixelsPerVolt);
        ctx.fillText(`${volts.toFixed(2)}V`, 5, y - 5);
    }
}
