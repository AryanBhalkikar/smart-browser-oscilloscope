import { drawGrid } from './gridRenderer';
import { drawTimeFrame } from './timeRenderer';
import { drawXYFrame } from './xyRenderer';
import { drawSpectrumFrame } from './spectrumRenderer';

export function renderScopeFrame(ctx, frame, width, height, settings) {
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, width, height);
    drawGrid(ctx, width, height, settings, frame);

    if (frame.mode === 'XY') drawXYFrame(ctx, frame, width, height, settings);
    else if (frame.mode === 'FFT') drawSpectrumFrame(ctx, frame, width, height);
    else drawTimeFrame(ctx, frame, width, height, settings);
}
