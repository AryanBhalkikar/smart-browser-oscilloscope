import React, { useEffect, useRef } from 'react';
import { findTrigger, calculateMeasurements } from '../utils/SignalProcessing';

const CANVAS_DIVS_X = 10;
const CANVAS_DIVS_Y = 8;

export default function OscilloscopeCanvas({ 
    settings, 
    dataBuffer, 
    onMeasurementsUpdate 
}) {
    const canvasRef = useRef(null);
    const requestRef = useRef();
    const settingsRef = useRef(settings);
    const lastTriggerDataRef = useRef(null);
    const lastMeasTimeRef = useRef(0);

    // Sync React state to mutable ref for the animation loop
    useEffect(() => {
        settingsRef.current = settings;
        if (settings.acqState === 'RUN' && settings.trigMode === 'NORMAL') {
            lastTriggerDataRef.current = null;
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
            
            ctx.fillStyle = '#050505';
            ctx.fillRect(0, 0, w, h);
            drawGrid(ctx, w, h, cfg);

            const visibleSamples = Math.floor(cfg.sampleRate * cfg.timePerDiv * CANVAS_DIVS_X);
            let displayData = null;

            if (cfg.acqState === 'RUN' || cfg.acqState === 'SINGLE_WAIT') {
                const tStartIdx = findTrigger(
                    dataBuffer.current.buffer, 
                    dataBuffer.current.totalSamplesReceived,
                    dataBuffer.current.head,
                    visibleSamples,
                    cfg.sampleRate,
                    cfg.trigLevel,
                    cfg.trigEdge === 'RISING'
                );

                if (tStartIdx !== null) {
                    displayData = dataBuffer.current.extractWindow(tStartIdx, visibleSamples);
                    lastTriggerDataRef.current = displayData;
                    if (cfg.acqState === 'SINGLE_WAIT') cfg.onSingleTriggered();
                } else {
                    if (cfg.trigMode === 'AUTO') {
                        displayData = dataBuffer.current.extractLatest(visibleSamples);
                    } else if ((cfg.trigMode === 'NORMAL' || cfg.trigMode === 'SINGLE') && lastTriggerDataRef.current) {
                        displayData = lastTriggerDataRef.current;
                    }
                }
            } else {
                displayData = lastTriggerDataRef.current || dataBuffer.current.extractLatest(visibleSamples);
            }

            if (displayData && displayData.length > 0) {
                drawWaveform(ctx, displayData, w, h, cfg);
                
                // Throttle React measurement updates to 4 times a second to prevent UI lag
                if (time - lastMeasTimeRef.current > 250) {
                    onMeasurementsUpdate(calculateMeasurements(displayData, cfg.sampleRate));
                    lastMeasTimeRef.current = time;
                }
            }

            drawOverlays(ctx, w, h, cfg);
            requestRef.current = requestAnimationFrame(render);
        };

        requestRef.current = requestAnimationFrame(render);
        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(requestRef.current);
        };
    }, [dataBuffer, onMeasurementsUpdate]);

    const drawGrid = (ctx, w, h, cfg) => {
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
        for(let i = 1; i < CANVAS_DIVS_X; i++) {
             const x = (w / CANVAS_DIVS_X) * i;
             let sec = (i - CANVAS_DIVS_X/2) * cfg.timePerDiv;
             let timeStr = Math.abs(sec) < 1e-3 ? (sec*1e6).toFixed(0) + 'µs' : 
                           Math.abs(sec) < 1 ? (sec*1e3).toFixed(1) + 'ms' : sec.toFixed(2) + 's';
             ctx.fillText(timeStr, x + 2, h - 5);
        }
        const pixelsPerVolt = h / (CANVAS_DIVS_Y * cfg.voltsPerDiv);
        for(let i = 1; i < CANVAS_DIVS_Y; i++) {
             const y = (h / CANVAS_DIVS_Y) * i;
             let vVal = cfg.vOffset + ((h/2 - y) / pixelsPerVolt);
             ctx.fillText(vVal.toFixed(2) + 'V', 5, y - 5);
        }
    };

    const drawWaveform = (ctx, data, w, h, cfg) => {
        const N = data.length;
        const pixelsPerVolt = h / (CANVAS_DIVS_Y * cfg.voltsPerDiv);
        const centerY = h / 2 + (cfg.vOffset * pixelsPerVolt);

        ctx.strokeStyle = '#00ff00';
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