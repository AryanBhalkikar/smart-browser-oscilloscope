import { useEffect, useRef } from 'react';
import { buildScopeFrame, createScopeFrameState } from '../utils/ScopeFrame';
import { renderScopeFrame } from '../renderers';

export default function OscilloscopeCanvas({
    settings,
    dataBuffer,
    xyDataBuffer,
    onMeasurementsUpdate,
    onSingleTriggered
}) {
    const canvasRef = useRef(null);
    const frameStateRef = useRef(createScopeFrameState());
    const settingsRef = useRef(settings);
    const callbacksRef = useRef({ onMeasurementsUpdate, onSingleTriggered });

    useEffect(() => {
        settingsRef.current = settings;
        callbacksRef.current = { onMeasurementsUpdate, onSingleTriggered };
    }, [settings, onMeasurementsUpdate, onSingleTriggered]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d', { alpha: false });
        if (!canvas || !ctx) return undefined;

        let animationFrameId;
        const resizeCanvas = () => {
            const pixelRatio = window.devicePixelRatio || 1;
            const rect = canvas.parentElement.getBoundingClientRect();
            canvas.width = Math.max(1, Math.floor(rect.width * pixelRatio));
            canvas.height = Math.max(1, Math.floor(rect.height * pixelRatio));
            ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
            canvas.style.width = `${rect.width}px`;
            canvas.style.height = `${rect.height}px`;
        };

        const render = (time) => {
            const settingsNow = settingsRef.current;
            const width = canvas.width / (window.devicePixelRatio || 1);
            const height = canvas.height / (window.devicePixelRatio || 1);
            const frame = buildScopeFrame({
                dataBuffer: dataBuffer.current,
                pairedBuffer: xyDataBuffer.current,
                settings: settingsNow,
                time,
                width,
                state: frameStateRef.current
            });

            renderScopeFrame(ctx, frame, width, height, settingsNow);
            if (frame.measurements) callbacksRef.current.onMeasurementsUpdate(frame.measurements);
            if (frame.singleTriggered) callbacksRef.current.onSingleTriggered();
            animationFrameId = window.requestAnimationFrame(render);
        };

        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();
        animationFrameId = window.requestAnimationFrame(render);

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            window.cancelAnimationFrame(animationFrameId);
        };
    }, [dataBuffer, xyDataBuffer]);

    return <canvas ref={canvasRef} id="dso-canvas" />;
}
