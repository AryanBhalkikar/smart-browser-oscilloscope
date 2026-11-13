// Compatibility barrel for existing imports. New code can import from the
// focused modules directly.
export { normalizeSampleMessage, decodeFloat32Message } from './SampleMessage.js';
export { downsamplePairedSamples, calculateMeasurements } from './WaveformProcessing.js';
export { findTrigger } from './TriggerProcessing.js';
