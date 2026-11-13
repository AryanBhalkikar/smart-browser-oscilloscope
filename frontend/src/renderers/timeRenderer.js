import { CHANNEL_COLORS, VOLTAGE_DIVISIONS_Y } from '../constants/scope';

export function drawTimeFrame(ctx, frame, width, height, settings) {
    if (frame.pair?.x?.length > 1) {
        drawWaveform(ctx, frame.pair.x, width, height, settings, CHANNEL_COLORS[0]);
        drawWaveform(ctx, frame.pair.y, width, height, settings, CHANNEL_COLORS[1]);
        drawChannelLegend(ctx, width);
    } else if (frame.samples?.length > 1) {
        drawWaveform(ctx, frame.samples, width, height, settings, CHANNEL_COLORS[0]);
    }
    drawTriggerOverlay(ctx, width, height, settings);
}

function drawWaveform(ctx, data, width, height, settings, color) {
    const count = data.length;
    const pixelsPerVolt = height / (VOLTAGE_DIVISIONS_Y * settings.voltsPerDiv);
    const centerY = height / 2 + (settings.vOffset * pixelsPerVolt);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();

    if (count > width * 2) {
        const samplesPerPixel = count / width;
        for (let pixel = 0; pixel < width; pixel++) {
            const start = Math.floor(pixel * samplesPerPixel);
            const end = Math.floor((pixel + 1) * samplesPerPixel);
            let min = Infinity;
            let max = -Infinity;
            for (let i = start; i < end && i < count; i++) {
                if (data[i] < min) min = data[i];
                if (data[i] > max) max = data[i];
            }
            const yMin = clamp(centerY - max * pixelsPerVolt, 0, height);
            const yMax = clamp(centerY - min * pixelsPerVolt, 0, height);
            if (pixel === 0) ctx.moveTo(pixel, yMin);
            else ctx.lineTo(pixel, yMin);
            ctx.lineTo(pixel, yMax);
        }
    } else {
        for (let i = 0; i < count; i++) {
            const x = (i / (count - 1)) * width;
            const y = clamp(centerY - data[i] * pixelsPerVolt, 0, height);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
    }
    ctx.stroke();
}

function drawChannelLegend(ctx, width) {
    ctx.font = '12px monospace';
    ctx.lineWidth = 2;
    ctx.strokeStyle = CHANNEL_COLORS[0];
    ctx.beginPath(); ctx.moveTo(width - 180, 20); ctx.lineTo(width - 160, 20); ctx.stroke();
    ctx.fillStyle = CHANNEL_COLORS[0];
    ctx.fillText('CH1 / X', width - 155, 24);

    ctx.strokeStyle = CHANNEL_COLORS[1];
    ctx.beginPath(); ctx.moveTo(width - 95, 20); ctx.lineTo(width - 75, 20); ctx.stroke();
    ctx.fillStyle = CHANNEL_COLORS[1];
    ctx.fillText('CH2 / Y', width - 70, 24);
}

function drawTriggerOverlay(ctx, width, height, settings) {
    const pixelsPerVolt = height / (VOLTAGE_DIVISIONS_Y * settings.voltsPerDiv);
    const triggerY = (height / 2 + settings.vOffset * pixelsPerVolt) - settings.trigLevel * pixelsPerVolt;
    if (triggerY >= 0 && triggerY <= height) {
        ctx.fillStyle = '#ffbb33';
        ctx.beginPath();
        ctx.moveTo(width, triggerY);
        ctx.lineTo(width - 10, triggerY - 5);
        ctx.lineTo(width - 10, triggerY + 5);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 187, 51, 0.3)';
        ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(0, triggerY); ctx.lineTo(width, triggerY); ctx.stroke();
        ctx.setLineDash([]);
    }
    ctx.fillStyle = '#ffbb33';
    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2 - 5, 10);
    ctx.lineTo(width / 2 + 5, 10);
    ctx.fill();
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
