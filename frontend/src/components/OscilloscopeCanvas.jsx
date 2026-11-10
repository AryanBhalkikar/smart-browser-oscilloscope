import React, { useEffect, useRef } from 'react';
import { downsamplePairedSamples, findTrigger, calculateMeasurements } from '../utils/SignalProcessing';

const CANVAS_DIVS_X = 10;
const CANVAS_DIVS_Y = 8;

export default function OscilloscopeCanvas({ 
    settings, 
    dataBuffer, 
    xyDataBuffer,
    onMeasurementsUpdate 
}) {
    const canvasRef = useRef(null);
    const requestRef = useRef();
    const settingsRef = useRef(settings);
    const lastTriggerDataRef = useRef(null);
    const lastTriggerPairRef = useRef(null);
    const lastPairGenerationRef = useRef(-1);
    const lastMeasTimeRef = useRef(0);
    const xyRenderDataRef = useRef({ version: -1, visibleSamples: 0, maxPoints: 0, x: new Float32Array(0), y: new Float32Array(0) });

    // Sync React state to mutable ref for the animation loop
    useEffect(() => {
        settingsRef.current = settings;
        if (settings.acqState === 'RUN' && settings.trigMode === 'NORMAL') {
            lastTriggerDataRef.current = null;
            lastTriggerPairRef.current = null;
        }
    }, [settings]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { alpha: false });

        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.parentElement.getBoundingClientRect();
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.scale(dpr, dpr);
            canvas.style.width = `${rect.width}px`;
            canvas.style.height = `${rect.height}px`;
        };
        
        window.addEventListener('resize', resize);
        resize();

        const render = (time) => {
            const w = canvas.width / (window.devicePixelRatio || 1);
            const h = canvas.height / (window.devicePixelRatio || 1);
            const cfg = settingsRef.current;
            const isXYMode = cfg.displayMode === 'XY';
            const pairedBuffer = xyDataBuffer.current;
            if (lastPairGenerationRef.current !== pairedBuffer.generation) {
                lastTriggerPairRef.current = null;
                lastPairGenerationRef.current = pairedBuffer.generation;
            }
            
            ctx.fillStyle = '#050505';
            ctx.fillRect(0, 0, w, h);
            drawGrid(ctx, w, h, cfg, isXYMode);

            const visibleSamples = Math.floor(cfg.sampleRate * cfg.timePerDiv * CANVAS_DIVS_X);
            let displayData = null;
            let displayPair = null;

            if (isXYMode) {
                const maxPoints = Math.max(1000, Math.floor(w * 4));
                let renderData = xyRenderDataRef.current;
                if (
                    renderData.version !== pairedBuffer.version ||
                    renderData.visibleSamples !== visibleSamples ||
                    renderData.maxPoints !== maxPoints
                ) {
                    const pairedData = pairedBuffer.extractLatest(visibleSamples);
                    const reduced = downsamplePairedSamples(
                        pairedData.x,
                        pairedData.y,
                        maxPoints
                    );
                    renderData = {
                        version: pairedBuffer.version,
                        visibleSamples,
                        maxPoints,
                        x: reduced.x,
                        y: reduced.y
                    };
                    xyRenderDataRef.current = renderData;
                }
                if (renderData.x.length > 1) {
                    drawXYWaveform(ctx, renderData.x, renderData.y, w, h, cfg);
                } else {
                    drawNoXYData(ctx, w, h);
                }
            } else if (cfg.acqState === 'RUN' || cfg.acqState === 'SINGLE_WAIT') {
                const hasPairedSamples = pairedBuffer.totalSamplesReceived > 0;
                const triggerBuffer = hasPairedSamples ? pairedBuffer.xBuffer : dataBuffer.current.buffer;
                const receivedSamples = hasPairedSamples
                    ? pairedBuffer.totalSamplesReceived
                    : dataBuffer.current.totalSamplesReceived;
                const head = hasPairedSamples ? pairedBuffer.head : dataBuffer.current.head;
                const tStartIdx = findTrigger(
                    triggerBuffer,
                    receivedSamples,
                    head,
                    visibleSamples,
                    cfg.sampleRate,
                    cfg.trigLevel,
                    cfg.trigEdge === 'RISING'
                );

                if (tStartIdx !== null) {
                    if (hasPairedSamples) {
                        displayPair = pairedBuffer.extractWindow(tStartIdx, visibleSamples);
                        lastTriggerPairRef.current = displayPair;
                    } else {
                        displayData = dataBuffer.current.extractWindow(tStartIdx, visibleSamples);
                        lastTriggerDataRef.current = displayData;
                    }
                    if (cfg.acqState === 'SINGLE_WAIT') cfg.onSingleTriggered();
                } else {
                    if (cfg.trigMode === 'AUTO') {
                        if (hasPairedSamples) displayPair = pairedBuffer.extractLatest(visibleSamples);
                        else displayData = dataBuffer.current.extractLatest(visibleSamples);
                    } else if (cfg.trigMode === 'NORMAL' || cfg.trigMode === 'SINGLE') {
                        if (hasPairedSamples) displayPair = lastTriggerPairRef.current;
                        else displayData = lastTriggerDataRef.current;
                    }
                }
            } else {
                if (pairedBuffer.totalSamplesReceived > 0) {
                    displayPair = lastTriggerPairRef.current || pairedBuffer.extractLatest(visibleSamples);
                } else {
                    displayData = lastTriggerDataRef.current || dataBuffer.current.extractLatest(visibleSamples);
                }
            }

            if (!isXYMode && displayPair && displayPair.x.length > 1) {
                drawWaveform(ctx, displayPair.x, w, h, cfg, '#00ff66');
                drawWaveform(ctx, displayPair.y, w, h, cfg, '#ffd24a');
                drawChannelLegend(ctx, w);
            } else if (!isXYMode && displayData && displayData.length > 1) {
                drawWaveform(ctx, displayData, w, h, cfg, '#00ff66');
            }

            // Measure over a longer window than the visible trace. This keeps
            // low-frequency measurements stable when the time/div is zoomed in.
            if (time - lastMeasTimeRef.current > 250) {
                const measurementSamples = Math.min(
                    dataBuffer.current.buffer.length,
                    Math.max(visibleSamples, Math.ceil(cfg.sampleRate * 2))
                );
                const measurementData = dataBuffer.current.extractLatest(measurementSamples);
                if (measurementData.length > 0) {
                    onMeasurementsUpdate(calculateMeasurements(measurementData, cfg.sampleRate));
                }
                lastMeasTimeRef.current = time;
            }

            if (!isXYMode) drawOverlays(ctx, w, h, cfg);
            requestRef.current = requestAnimationFrame(render);
        };

        requestRef.current = requestAnimationFrame(render);
        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(requestRef.current);
        };
    }, [dataBuffer, onMeasurementsUpdate]);

    const drawGrid = (ctx, w, h, cfg, isXYMode) => {
        ctx.lineWidth = 1;
        for (let i = 0; i <= CANVAS_DIVS_X; i++) {
            const x = (w / CANVAS_DIVS_X) * i;
            ctx.strokeStyle = i === CANVAS_DIVS_X / 2 ? 'rgba(0, 255, 0, 0.5)' : 'rgba(0, 255, 0, 0.15)';
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        }
        for (let i = 0; i <= CANVAS_DIVS_Y; i++) {
            const y = (h / CANVAS_DIVS_Y) * i;
            ctx.strokeStyle = i === CANVAS_DIVS_Y / 2 ? 'rgba(0, 255, 0, 0.5)' : 'rgba(0, 255, 0, 0.15)';
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }

        ctx.fillStyle = 'rgba(0, 255, 0, 0.7)';
        ctx.font = '10px monospace';
        if (isXYMode) {
            for (let i = 1; i < CANVAS_DIVS_X; i++) {
                const x = (w / CANVAS_DIVS_X) * i;
                const volts = cfg.xyXOffset + (i - CANVAS_DIVS_X / 2) * cfg.xyXVoltsPerDiv;
                ctx.fillText(`${volts.toFixed(2)}V`, x + 2, h - 5);
            }
            for (let i = 1; i < CANVAS_DIVS_Y; i++) {
                const y = (h / CANVAS_DIVS_Y) * i;
                const volts = cfg.xyYOffset + (CANVAS_DIVS_Y / 2 - i) * cfg.xyYVoltsPerDiv;
                ctx.fillText(`${volts.toFixed(2)}V`, 5, y - 5);
            }
        } else {
            for (let i = 1; i < CANVAS_DIVS_X; i++) {
                const x = (w / CANVAS_DIVS_X) * i;
                const sec = (i - CANVAS_DIVS_X / 2) * cfg.timePerDiv;
                const timeStr = Math.abs(sec) < 1e-3 ? `${(sec * 1e6).toFixed(0)}µs` :
                    Math.abs(sec) < 1 ? `${(sec * 1e3).toFixed(1)}ms` : `${sec.toFixed(2)}s`;
                ctx.fillText(timeStr, x + 2, h - 5);
            }
            const pixelsPerVolt = h / (CANVAS_DIVS_Y * cfg.voltsPerDiv);
            for (let i = 1; i < CANVAS_DIVS_Y; i++) {
                const y = (h / CANVAS_DIVS_Y) * i;
                const volts = cfg.vOffset + ((h / 2 - y) / pixelsPerVolt);
                ctx.fillText(`${volts.toFixed(2)}V`, 5, y - 5);
            }
        }
    };

    const drawXYWaveform = (ctx, xSamples, ySamples, w, h, cfg) => {
        const pixelsPerVoltX = w / (CANVAS_DIVS_X * cfg.xyXVoltsPerDiv);
        const pixelsPerVoltY = h / (CANVAS_DIVS_Y * cfg.xyYVoltsPerDiv);
        const centerX = w / 2;
        const centerY = h / 2;

        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 1.5;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i < xSamples.length; i++) {
            const px = centerX + (xSamples[i] - cfg.xyXOffset) * pixelsPerVoltX;
            const py = centerY - (ySamples[i] - cfg.xyYOffset) * pixelsPerVoltY;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.stroke();
    };

    const drawNoXYData = (ctx, w, h) => {
        ctx.fillStyle = 'rgba(0, 255, 0, 0.75)';
        ctx.font = '14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('X-Y mode needs paired xSamples and ySamples from Simulink', w / 2, h / 2);
        ctx.textAlign = 'left';
    };

    const drawWaveform = (ctx, data, w, h, cfg, color = '#00ff66') => {
        const N = data.length;
        const pixelsPerVolt = h / (CANVAS_DIVS_Y * cfg.voltsPerDiv);
        const centerY = h / 2 + (cfg.vOffset * pixelsPerVolt);

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.lineJoin = 'round';
        ctx.beginPath();

        if (N > w * 2) {
            const samplesPerPixel = N / w;
            for (let px = 0; px < w; px++) {
                const startIdx = Math.floor(px * samplesPerPixel);
                const endIdx = Math.floor((px + 1) * samplesPerPixel);
                let min = Infinity, max = -Infinity;
                for (let i = startIdx; i < endIdx && i < N; i++) {
                    if (data[i] < min) min = data[i];
                    if (data[i] > max) max = data[i];
                }
                let yMin = Math.max(0, Math.min(h, centerY - (max * pixelsPerVolt)));
                let yMax = Math.max(0, Math.min(h, centerY - (min * pixelsPerVolt)));
                px === 0 ? ctx.moveTo(px, yMin) : ctx.lineTo(px, yMin);
                ctx.lineTo(px, yMax);
            }
        } else {
            for (let i = 0; i < N; i++) {
                let px = (i / (N - 1)) * w;
                let py = Math.max(0, Math.min(h, centerY - (data[i] * pixelsPerVolt)));
                i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            }
        }
        ctx.stroke();
    };

    const drawChannelLegend = (ctx, w) => {
        ctx.font = '12px monospace';
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#00ff66';
        ctx.beginPath(); ctx.moveTo(w - 180, 20); ctx.lineTo(w - 160, 20); ctx.stroke();
        ctx.fillStyle = '#00ff66';
        ctx.fillText('CH1 / X', w - 155, 24);

        ctx.strokeStyle = '#ffd24a';
        ctx.beginPath(); ctx.moveTo(w - 95, 20); ctx.lineTo(w - 75, 20); ctx.stroke();
        ctx.fillStyle = '#ffd24a';
        ctx.fillText('CH2 / Y', w - 70, 24);
    };

    const drawOverlays = (ctx, w, h, cfg) => {
        const pixelsPerVolt = h / (CANVAS_DIVS_Y * cfg.voltsPerDiv);
        const trigY = (h / 2 + (cfg.vOffset * pixelsPerVolt)) - (cfg.trigLevel * pixelsPerVolt);
        
        if (trigY >= 0 && trigY <= h) {
            ctx.fillStyle = '#ffbb33';
            ctx.beginPath(); ctx.moveTo(w, trigY); ctx.lineTo(w - 10, trigY - 5); ctx.lineTo(w - 10, trigY + 5); ctx.fill();
            ctx.strokeStyle = 'rgba(255, 187, 51, 0.3)'; ctx.setLineDash([5, 5]);
            ctx.beginPath(); ctx.moveTo(0, trigY); ctx.lineTo(w, trigY); ctx.stroke(); ctx.setLineDash([]);
        }
        ctx.fillStyle = '#ffbb33';
        ctx.beginPath(); ctx.moveTo(w/2, 0); ctx.lineTo(w/2 - 5, 10); ctx.lineTo(w/2 + 5, 10); ctx.fill();
    };

    return <canvas ref={canvasRef} id="dso-canvas" />;
}
