import { CHANNEL_COLORS } from '../constants/scope';
import { getSpectrumPlotRect } from './gridRenderer';

export function drawSpectrumFrame(ctx, frame, width, height) {
    if (frame.channels.length === 0) {
        drawWaitingMessage(ctx, width, height, frame.sampleCount, frame.fftSize);
        return;
    }

    const plot = getSpectrumPlotRect(width, height);
    const dbRange = frame.ceilingDbv - frame.floorDbv;
    frame.channels.forEach((spectrum, channelIndex) => {
        ctx.strokeStyle = CHANNEL_COLORS[channelIndex % CHANNEL_COLORS.length];
        ctx.lineWidth = 1.5;
        ctx.lineJoin = 'round';
        ctx.save();
        ctx.beginPath();
        ctx.rect(plot.left, plot.top, plot.width, plot.height);
        ctx.clip();
        for (let bin = 0; bin < spectrum.frequencies.length && spectrum.frequencies[bin] <= frame.maxFrequencyHz; bin++) {
            const x = plot.left + (spectrum.frequencies[bin] / frame.maxFrequencyHz) * plot.width;
            const level = Math.max(frame.floorDbv, Math.min(frame.ceilingDbv, spectrum.magnitudeDbv[bin]));
            const y = plot.top + ((frame.ceilingDbv - level) / dbRange) * plot.height;
            if (bin === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
    });

    if (frame.channels.length > 1) drawSpectrumLegend(ctx, width, frame.channels.length);
}

function drawSpectrumLegend(ctx, width, channelCount) {
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
        const x = width - 116;
        const y = 15 + channelIndex * 17;
        ctx.fillStyle = CHANNEL_COLORS[channelIndex % CHANNEL_COLORS.length];
        ctx.fillRect(x, y - 3, 12, 3);
        ctx.fillText(`CH${channelIndex + 1}`, x + 18, y);
    }
}

function drawWaitingMessage(ctx, width, height, sampleCount, fftSize) {
    ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`Waiting for samples (${sampleCount}/${fftSize})`, width / 2, height / 2);
    ctx.textAlign = 'left';
}
