import { useCallback, useEffect, useRef, useState } from 'react';
import { DataBuffer } from '../utils/DataBuffer';
import { PairedDataBuffer } from '../utils/PairedDataBuffer';
import { decodeFloat32Message, normalizeSampleMessage } from '../utils/SampleMessage';
import { DEFAULT_SAMPLE_RATE_HZ } from '../constants/scope';

const WEBSOCKET_URL = 'ws://localhost:8080';
const DEMO_SAMPLES_PER_PACKET = 1000;

export function useOscilloscopeStream({
    demoMode,
    acqState,
    sampleRate,
    onSampleRateChange,
    onStreamFormatChange,
    onMeasurementsReset
}) {
    const dataBuffer = useRef(new DataBuffer());
    const xyDataBuffer = useRef(new PairedDataBuffer());
    const sampleRateRef = useRef(sampleRate);
    const streamFormatRef = useRef(null);
    const acqStateRef = useRef(acqState);
    const callbacksRef = useRef({ onSampleRateChange, onStreamFormatChange, onMeasurementsReset });
    const [wsStatus, setWsStatus] = useState('disconnected');
    const [hasPairedInput, setHasPairedInput] = useState(false);

    useEffect(() => {
        sampleRateRef.current = sampleRate;
        acqStateRef.current = acqState;
        callbacksRef.current = { onSampleRateChange, onStreamFormatChange, onMeasurementsReset };
    }, [sampleRate, acqState, onSampleRateChange, onStreamFormatChange, onMeasurementsReset]);

    const clearBuffers = useCallback(() => {
        dataBuffer.current.clear();
        xyDataBuffer.current.clear();
        callbacksRef.current.onMeasurementsReset();
    }, []);

    useEffect(() => {
        let active = true;
        let socket = null;
        let reconnectTimer = null;
        let demoInterval = null;

        const resetBuffers = () => {
            dataBuffer.current.clear();
            xyDataBuffer.current.clear();
            callbacksRef.current.onMeasurementsReset();
        };

        const updateSampleRate = (nextRate) => {
            const previousRate = sampleRateRef.current;
            const tolerance = Math.max(0.01, previousRate * 1e-6);
            if (Math.abs(nextRate - previousRate) <= tolerance) return;

            sampleRateRef.current = nextRate;
            resetBuffers();
            callbacksRef.current.onSampleRateChange(nextRate);
        };

        const selectStreamFormat = (format) => {
            if (streamFormatRef.current === format) return;
            streamFormatRef.current = format;
            setHasPairedInput(format === 'xy');
            resetBuffers();
            callbacksRef.current.onStreamFormatChange(format);
        };

        const appendJsonMessage = (rawMessage) => {
            let message;
            try {
                message = JSON.parse(rawMessage);
            } catch (error) {
                console.error(`Invalid JSON sample message: ${error.message}`);
                return;
            }

            const normalized = normalizeSampleMessage(message);
            if (normalized.error) {
                console.error(`Invalid sample message: ${normalized.error}`);
                return;
            }

            updateSampleRate(normalized.sampleRate);
            selectStreamFormat(normalized.mode);
            if (normalized.mode === 'xy') {
                dataBuffer.current.push(normalized.xSamples);
                xyDataBuffer.current.push(normalized.xSamples, normalized.ySamples);
            } else {
                dataBuffer.current.push(normalized.samples);
            }
        };

        const appendBinaryMessage = (arrayBuffer) => {
            const decoded = decodeFloat32Message(arrayBuffer);
            if (decoded.error) {
                console.error(decoded.error);
                return;
            }
            updateSampleRate(DEFAULT_SAMPLE_RATE_HZ);
            selectStreamFormat('single');
            dataBuffer.current.push(decoded.samples);
        };

        if (demoMode) {
            selectStreamFormat('xy');
            let sampleIndex = 0;
            demoInterval = window.setInterval(() => {
                if (acqStateRef.current === 'STOP' || acqStateRef.current === 'SINGLE_DONE') return;
                const xSamples = new Float32Array(DEMO_SAMPLES_PER_PACKET);
                const ySamples = new Float32Array(DEMO_SAMPLES_PER_PACKET);
                for (let i = 0; i < DEMO_SAMPLES_PER_PACKET; i++) {
                    const seconds = (sampleIndex + i) / DEFAULT_SAMPLE_RATE_HZ;
                    xSamples[i] = 1.5 * Math.sin(2 * Math.PI * 1000 * seconds);
                    ySamples[i] = 1.5 * Math.sin(2 * Math.PI * 1000 * seconds + Math.PI / 3);
                }
                sampleIndex += DEMO_SAMPLES_PER_PACKET;
                dataBuffer.current.push(xSamples);
                xyDataBuffer.current.push(xSamples, ySamples);
            }, (DEMO_SAMPLES_PER_PACKET / DEFAULT_SAMPLE_RATE_HZ) * 1000);
        } else {
            const connect = () => {
                if (!active) return;
                setWsStatus('connecting');
                const nextSocket = new WebSocket(WEBSOCKET_URL);
                socket = nextSocket;
                nextSocket.binaryType = 'arraybuffer';
                nextSocket.onopen = () => {
                    if (active) setWsStatus('connected');
                };
                nextSocket.onmessage = (event) => {
                    if (!active) return;
                    if (typeof event.data === 'string') appendJsonMessage(event.data);
                    else if (event.data instanceof ArrayBuffer) appendBinaryMessage(event.data);
                    else console.error('Expected JSON samples or binary Float32 sample data from the WebSocket.');
                };
                nextSocket.onclose = () => {
                    if (!active) return;
                    setWsStatus('disconnected');
                    reconnectTimer = window.setTimeout(connect, 3000);
                };
                nextSocket.onerror = () => {
                    if (active) setWsStatus('disconnected');
                };
            };
            connect();
        }

        return () => {
            active = false;
            if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
            if (demoInterval !== null) window.clearInterval(demoInterval);
            if (socket) {
                socket.onclose = null;
                socket.onmessage = null;
                socket.onopen = null;
                socket.onerror = null;
                socket.close();
            }
        };
    }, [demoMode]);

    return { dataBuffer, xyDataBuffer, wsStatus, hasPairedInput, clearBuffers };
}
