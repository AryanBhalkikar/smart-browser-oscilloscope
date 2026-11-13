"""Local signal summaries and anomaly candidates for the oscilloscope agent."""

from __future__ import annotations

import math
from typing import Any

import numpy as np


def analyze_capture(channels: list[np.ndarray], sample_rate: float, window_seconds: float) -> dict[str, Any]:
    channel_results = []
    for index, samples in enumerate(channels):
        channel_results.append(_analyze_channel(samples, sample_rate, index + 1))

    return {
        "sample_rate_hz": sample_rate,
        "window_seconds": window_seconds,
        "channel_count": len(channel_results),
        "channels": channel_results,
    }


def _analyze_channel(samples: np.ndarray, sample_rate: float, channel_number: int) -> dict[str, Any]:
    values = np.asarray(samples, dtype=np.float64)
    values = values[np.isfinite(values)]
    if values.size < 32:
        return {"channel": f"CH{channel_number}", "sample_count": int(values.size), "insufficient_data": True}

    mean = float(np.mean(values))
    centered = values - mean
    peak = float(np.max(values))
    trough = float(np.min(values))
    vpp = peak - trough
    ac_rms = float(np.sqrt(np.mean(centered * centered)))
    total_rms = float(np.sqrt(np.mean(values * values)))

    # Limit the FFT size to the latest power-of-two window to bound CPU and payload size.
    fft_size = min(65536, 1 << int(math.floor(math.log2(values.size))))
    fft_values = centered[-fft_size:]
    window = np.hanning(fft_size)
    spectrum = np.fft.rfft(fft_values * window)
    coherent_gain = max(float(np.sum(window)), 1e-12)
    amplitudes_peak = np.abs(spectrum) * (2.0 / coherent_gain)
    amplitudes_peak[0] *= 0.5
    if fft_size % 2 == 0:
        amplitudes_peak[-1] *= 0.5
    amplitudes_rms = amplitudes_peak / math.sqrt(2.0)
    frequencies = np.fft.rfftfreq(fft_size, d=1.0 / sample_rate)
    magnitude_dbv = 20.0 * np.log10(np.maximum(amplitudes_rms, 1e-12))

    if amplitudes_rms.size > 1:
        fundamental_bin = int(np.argmax(amplitudes_rms[1:]) + 1)
        fundamental_hz = float(frequencies[fundamental_bin])
        fundamental_rms = float(amplitudes_rms[fundamental_bin])
    else:
        fundamental_bin = 0
        fundamental_hz = 0.0
        fundamental_rms = 0.0

    harmonics = []
    harmonic_power = 0.0
    for harmonic_number in range(2, 11):
        target_hz = fundamental_hz * harmonic_number
        if fundamental_hz <= 0 or target_hz >= sample_rate / 2:
            break
        center_bin = int(round(target_hz / (sample_rate / fft_size)))
        low = max(1, center_bin - 1)
        high = min(amplitudes_rms.size, center_bin + 2)
        bin_index = low + int(np.argmax(amplitudes_rms[low:high]))
        harmonic_rms = float(amplitudes_rms[bin_index])
        relative_db = 20.0 * math.log10(max(harmonic_rms, 1e-12) / max(fundamental_rms, 1e-12))
        harmonic_power += harmonic_rms * harmonic_rms
        harmonics.append({
            "order": harmonic_number,
            "frequency_hz": round(float(frequencies[bin_index]), 4),
            "rms_v": round(harmonic_rms, 8),
            "relative_to_fundamental_db": round(relative_db, 2),
        })

    thd_percent = (math.sqrt(harmonic_power) / fundamental_rms * 100.0) if fundamental_rms > 0 else None
    peaks = _find_peaks(frequencies, magnitude_dbv, sample_rate)
    noise_bins = magnitude_dbv.copy()
    noise_bins[:max(2, fundamental_bin - 2)] = np.nan
    noise_bins[max(0, fundamental_bin - 2):fundamental_bin + 3] = np.nan
    noise_floor_dbv = float(np.nanmedian(noise_bins)) if np.any(np.isfinite(noise_bins)) else None
    noise_relative_db = (
        noise_floor_dbv - 20.0 * math.log10(max(fundamental_rms, 1e-12))
        if noise_floor_dbv is not None and fundamental_rms > 0 else None
    )

    # A stream has no ADC full-scale metadata, so flag flat repeated extrema as a
    # clipping candidate rather than claiming a calibrated clipping percentage.
    tolerance = max(vpp * 1e-5, 1e-9)
    repeated_extrema_fraction = float(np.mean((np.abs(values - peak) <= tolerance) | (np.abs(values - trough) <= tolerance)))

    preview_indices = np.linspace(0, values.size - 1, min(512, values.size), dtype=np.int64)
    return {
        "channel": f"CH{channel_number}",
        "sample_count": int(values.size),
        "mean_v": round(mean, 8),
        "vmax_v": round(peak, 8),
        "vmin_v": round(trough, 8),
        "vpp_v": round(vpp, 8),
        "vrms_v": round(total_rms, 8),
        "ac_rms_v": round(ac_rms, 8),
        "fundamental_hz": round(fundamental_hz, 5),
        "fundamental_rms_v": round(fundamental_rms, 8),
        "fundamental_dbv": round(20.0 * math.log10(max(fundamental_rms, 1e-12)), 2),
        "thd_percent_h2_to_h10": round(thd_percent, 4) if thd_percent is not None else None,
        "harmonics": harmonics,
        "prominent_spectrum_peaks": peaks,
        "estimated_noise_floor_dbv": round(noise_floor_dbv, 2) if noise_floor_dbv is not None else None,
        "estimated_noise_relative_to_fundamental_db": round(noise_relative_db, 2) if noise_relative_db is not None else None,
        "repeated_extrema_fraction": round(repeated_extrema_fraction, 6),
        "waveform_preview_v": np.round(values[preview_indices], 6).tolist(),
        "spectrum_preview": _spectrum_preview(frequencies, magnitude_dbv),
    }


def _find_peaks(frequencies: np.ndarray, magnitude_dbv: np.ndarray, sample_rate: float) -> list[dict[str, float]]:
    if magnitude_dbv.size < 3:
        return []
    is_peak = (magnitude_dbv[1:-1] >= magnitude_dbv[:-2]) & (magnitude_dbv[1:-1] > magnitude_dbv[2:])
    indexes = np.flatnonzero(is_peak) + 1
    indexes = indexes[frequencies[indexes] > 0]
    if indexes.size == 0:
        return []
    strongest = indexes[np.argsort(magnitude_dbv[indexes])[-12:][::-1]]
    return [
        {"frequency_hz": round(float(frequencies[i]), 4), "magnitude_dbv": round(float(magnitude_dbv[i]), 2)}
        for i in strongest
        if frequencies[i] <= sample_rate / 2
    ]


def _spectrum_preview(frequencies: np.ndarray, magnitude_dbv: np.ndarray) -> list[dict[str, float]]:
    if frequencies.size <= 2:
        return []
    # A small log-frequency summary preserves both fundamental and higher-frequency context.
    max_frequency = float(frequencies[-1])
    selected = np.unique(np.geomspace(1, max(2, frequencies.size - 1), min(128, frequencies.size - 1)).astype(int))
    return [
        {"frequency_hz": round(float(frequencies[i]), 3), "magnitude_dbv": round(float(magnitude_dbv[i]), 2)}
        for i in selected
        if frequencies[i] <= max_frequency
    ]


def anomaly_candidates(summary: dict[str, Any], context: dict[str, Any] | None = None) -> list[str]:
    candidates = []
    expected_frequency = (context or {}).get("expected_frequency_hz")
    for channel in summary.get("channels", []):
        if channel.get("insufficient_data"):
            continue
        name = channel["channel"]
        for harmonic in channel.get("harmonics", []):
            if harmonic["relative_to_fundamental_db"] > -35:
                if harmonic["order"] == 3:
                    candidates.append(f"{name}:significant-H3")
                elif harmonic["order"] % 2 == 0:
                    candidates.append(f"{name}:significant-even-H{harmonic['order']}")
        if channel.get("estimated_noise_relative_to_fundamental_db") is not None and channel["estimated_noise_relative_to_fundamental_db"] > -35:
            candidates.append(f"{name}:elevated-noise-candidate")
        if channel.get("repeated_extrema_fraction", 0) > 0.01:
            candidates.append(f"{name}:flat-extrema-candidate")
        if channel.get("fundamental_rms_v", 0) > 0 and channel.get("mean_v", 0) > channel["fundamental_rms_v"] * 0.5:
            candidates.append(f"{name}:large-dc-offset-candidate")
        if expected_frequency and channel.get("fundamental_hz", 0) > 0:
            relative_error = abs(channel["fundamental_hz"] - expected_frequency) / expected_frequency
            if relative_error > 0.05:
                candidates.append(f"{name}:frequency-outside-5-percent-of-expected")
    return candidates
