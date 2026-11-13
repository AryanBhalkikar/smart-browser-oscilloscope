import { findTrigger } from './TriggerProcessing.js';
import { calculateMeasurements, downsamplePairedSamples } from './WaveformProcessing.js';
import { calculateAmplitudeSpectrum } from './SpectrumProcessing.js';
import { TIME_DIVISIONS_X } from '../constants/scope.js';

export function createScopeFrameState() {
    return {
        sourceGeneration: null,
        lastTriggerData: null,
        lastTriggerPair: null,
        lastTriggerNotified: false,
        xyCache: null,
        spectrumCache: null,
        lastMeasurementTime: 0
    };
}

/** Selects and prepares display data; it does not draw or update React state. */
export function buildScopeFrame({ dataBuffer, pairedBuffer, settings, time, width, state }) {
    const hasPairedData = pairedBuffer.totalSamplesReceived > 0;
    const sourceGeneration = hasPairedData
        ? `paired:${pairedBuffer.generation}`
        : `single:${dataBuffer.generation}`;

    if (state.sourceGeneration !== sourceGeneration) {
        state.sourceGeneration = sourceGeneration;
        state.lastTriggerData = null;
        state.lastTriggerPair = null;
        state.xyCache = null;
        state.spectrumCache = null;
        state.lastTriggerNotified = false;
    }

    if (settings.acqState !== 'SINGLE_WAIT') state.lastTriggerNotified = false;

    const visibleSamples = Math.max(1, Math.floor(settings.sampleRate * settings.timePerDiv * TIME_DIVISIONS_X));
    let frame;

    if (settings.displayMode === 'FFT') {
        frame = buildSpectrumFrame(dataBuffer, pairedBuffer, settings, state);
    } else if (settings.displayMode === 'XY') {
        frame = buildXYFrame(pairedBuffer, settings, visibleSamples, width, state);
    } else {
        frame = buildTimeFrame(dataBuffer, pairedBuffer, settings, visibleSamples, state);
    }

    if (
        settings.acqState === 'SINGLE_WAIT' &&
        !frame.singleTriggered &&
        !state.lastTriggerNotified &&
        hasFrameForSingleAcquisition(frame, visibleSamples)
    ) {
        state.lastTriggerNotified = true;
        frame.singleTriggered = true;
    }

    let measurements = null;
    if (time - state.lastMeasurementTime > 250) {
        const measurementSamples = Math.min(
            dataBuffer.buffer.length,
            Math.max(visibleSamples, Math.ceil(settings.sampleRate * 2))
        );
        if (hasPairedData) {
            const pair = pairedBuffer.extractLatest(measurementSamples);
            if (pair.x.length > 0) {
                measurements = {
                    channels: [
                        calculateMeasurements(pair.x, settings.sampleRate),
                        calculateMeasurements(pair.y, settings.sampleRate)
                    ]
                };
            }
        } else {
            const measurementData = dataBuffer.extractLatest(measurementSamples);
            if (measurementData.length > 0) {
                measurements = { channels: [calculateMeasurements(measurementData, settings.sampleRate)] };
            }
        }
        state.lastMeasurementTime = time;
    }

    return { ...frame, measurements };
}

function hasFrameForSingleAcquisition(frame, visibleSamples) {
    if (frame.mode === 'FFT') return frame.channels.length > 0;
    if (frame.mode === 'XY') return frame.x.length >= visibleSamples;
    return false;
}

function buildSpectrumFrame(dataBuffer, pairedBuffer, settings, state) {
    const fftSize = settings.fftSize;
    const hasPairedData = pairedBuffer.totalSamplesReceived > 0;
    const sourceVersion = hasPairedData
        ? `paired:${pairedBuffer.version}:${pairedBuffer.totalSamplesReceived}`
        : `single:${dataBuffer.version}:${dataBuffer.totalSamplesReceived}`;
    const key = `${sourceVersion}:${settings.sampleRate}:${fftSize}`;

    if (state.spectrumCache?.key !== key) {
        if (hasPairedData) {
            const pair = pairedBuffer.extractLatest(fftSize);
            state.spectrumCache = {
                key,
                sampleCount: pair.x.length,
                channels: [pair.x, pair.y]
                    .map((samples) => calculateAmplitudeSpectrum(samples, settings.sampleRate, fftSize))
                    .filter(Boolean)
            };
        } else {
            const samples = dataBuffer.extractLatest(fftSize);
            const spectrum = calculateAmplitudeSpectrum(samples, settings.sampleRate, fftSize);
            state.spectrumCache = {
                key,
                sampleCount: samples.length,
                channels: spectrum ? [spectrum] : []
            };
        }
    }

    const channels = state.spectrumCache.channels;
    const nyquistHz = settings.sampleRate / 2;
    const requestedMaximum = settings.fftMaxFrequency ?? nyquistHz;
    const maxFrequencyHz = Math.max(1, Math.min(requestedMaximum, nyquistHz));
    const dbRange = [40, 80, 120].includes(settings.fftDbRange) ? settings.fftDbRange : 80;
    let highestPeakDbv = -Infinity;

    for (const channel of channels) {
        for (let bin = 0; bin < channel.frequencies.length && channel.frequencies[bin] <= maxFrequencyHz; bin++) {
            highestPeakDbv = Math.max(highestPeakDbv, channel.magnitudeDbv[bin]);
        }
    }

    const ceilingDbv = Number.isFinite(highestPeakDbv)
        ? Math.max(-120, Math.min(60, Math.ceil((highestPeakDbv + 10) / 10) * 10))
        : 0;

    return {
        mode: 'FFT',
        channels,
        sampleCount: state.spectrumCache.sampleCount,
        fftSize,
        maxFrequencyHz,
        ceilingDbv,
        floorDbv: ceilingDbv - dbRange
    };
}

function buildXYFrame(pairedBuffer, settings, visibleSamples, width, state) {
    const maxPoints = Math.max(1000, Math.floor(width * 4));
    const key = `${pairedBuffer.version}:${visibleSamples}:${maxPoints}`;
    if (state.xyCache?.key !== key) {
        const pair = pairedBuffer.extractLatest(visibleSamples);
        const reduced = downsamplePairedSamples(pair.x, pair.y, maxPoints);
        state.xyCache = { key, x: reduced.x, y: reduced.y };
    }
    return { mode: 'XY', x: state.xyCache.x, y: state.xyCache.y };
}

function buildTimeFrame(dataBuffer, pairedBuffer, settings, visibleSamples, state) {
    const hasPairedData = pairedBuffer.totalSamplesReceived > 0;
    let pair = null;
    let samples = null;
    let singleTriggered = false;

    if (settings.acqState === 'RUN' || settings.acqState === 'SINGLE_WAIT') {
        const triggerBuffer = hasPairedData ? pairedBuffer.xBuffer : dataBuffer.buffer;
        const receivedSamples = hasPairedData ? pairedBuffer.totalSamplesReceived : dataBuffer.totalSamplesReceived;
        const head = hasPairedData ? pairedBuffer.head : dataBuffer.head;
        const startIndex = findTrigger(
            triggerBuffer,
            receivedSamples,
            head,
            visibleSamples,
            settings.sampleRate,
            settings.trigLevel,
            settings.trigEdge === 'RISING'
        );

        if (startIndex !== null) {
            if (hasPairedData) {
                pair = pairedBuffer.extractWindow(startIndex, visibleSamples);
                state.lastTriggerPair = pair;
            } else {
                samples = dataBuffer.extractWindow(startIndex, visibleSamples);
                state.lastTriggerData = samples;
            }
            if (settings.acqState === 'SINGLE_WAIT' && !state.lastTriggerNotified) {
                state.lastTriggerNotified = true;
                singleTriggered = true;
            }
        } else if (settings.trigMode === 'AUTO') {
            if (hasPairedData) pair = pairedBuffer.extractLatest(visibleSamples);
            else samples = dataBuffer.extractLatest(visibleSamples);
        } else if (settings.trigMode === 'NORMAL' || settings.trigMode === 'SINGLE') {
            if (hasPairedData) pair = state.lastTriggerPair;
            else samples = state.lastTriggerData;
        }
    } else if (hasPairedData) {
        pair = state.lastTriggerPair || pairedBuffer.extractLatest(visibleSamples);
    } else {
        samples = state.lastTriggerData || dataBuffer.extractLatest(visibleSamples);
    }

    return { mode: 'TIME', pair, samples, singleTriggered };
}
