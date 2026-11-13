import { TIME_DIVISIONS_X, VOLTAGE_DIVISIONS_Y } from '../constants/scope';

export function drawXYFrame(ctx, frame, width, height, settings) {
    if (frame.x.length <= 1) {
        drawNoXYData(ctx, width, height);
        return;
    }

    const pixelsPerVoltX = width / (TIME_DIVISIONS_X * settings.xyXVoltsPerDiv);
    const pixelsPerVoltY = height / (VOLTAGE_DIVISIONS_Y * settings.xyYVoltsPerDiv);
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < frame.x.length; i++) {
        const x = width / 2 + (frame.x[i] - settings.xyXOffset) * pixelsPerVoltX;
        const y = height / 2 - (frame.y[i] - settings.xyYOffset) * pixelsPerVoltY;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
}

function drawNoXYData(ctx, width, height) {
    ctx.fillStyle = 'rgba(0, 255, 0, 0.75)';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('X-Y mode needs paired xSamples and ySamples from Simulink', width / 2, height / 2);
    ctx.textAlign = 'left';
}
