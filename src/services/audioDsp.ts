/**
 * VoxSentra Real Audio DSP & Acoustic Feature Extraction Engine
 * Provides deterministic Web Audio decoding, real waveform peaks extraction,
 * and genuine Short-Time Fourier Transform (STFT) Mel Spectrogram computation.
 */

// In-browser AudioContext singleton helper
let sharedAudioContext: AudioContext | null = null;
function getAudioContext(): AudioContext {
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    sharedAudioContext = new AudioCtx();
  }
  if (sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume().catch(() => {});
  }
  return sharedAudioContext;
}

/**
 * Decodes any browser-supported audio format (WAV, MP3, M4A, FLAC, OGG, WebM, AAC)
 * into a linear uncompressed PCM AudioBuffer.
 */
export async function decodeAudioToBuffer(source: Blob | File | ArrayBuffer): Promise<AudioBuffer> {
  const ctx = getAudioContext();
  let arrayBuffer: ArrayBuffer;
  if (source instanceof ArrayBuffer) {
    arrayBuffer = source;
  } else {
    arrayBuffer = await source.arrayBuffer();
  }
  // Clone buffer slice because decodeAudioData detaches the underlying ArrayBuffer
  return await ctx.decodeAudioData(arrayBuffer.slice(0));
}

/**
 * Extracts REAL waveform amplitude peaks and RMS energy from an AudioBuffer.
 */
export function extractRealWaveform(
  audioBuffer: AudioBuffer,
  numBins = 64
): {
  peaks: number[];
  rms: number[];
  duration: number;
  maxPeak: number;
  avgRms: number;
} {
  const channelData = audioBuffer.getChannelData(0); // Primary channel (mono or left)
  const totalSamples = channelData.length;
  const duration = audioBuffer.duration;

  if (totalSamples === 0) {
    return {
      peaks: new Array(numBins).fill(0.05),
      rms: new Array(numBins).fill(0.02),
      duration: 0,
      maxPeak: 0,
      avgRms: 0
    };
  }

  const samplesPerBin = Math.max(1, Math.floor(totalSamples / numBins));
  const peaks: number[] = [];
  const rmsValues: number[] = [];
  let globalMaxPeak = 0;
  let totalRmsSum = 0;

  for (let b = 0; b < numBins; b++) {
    const start = b * samplesPerBin;
    const end = Math.min(totalSamples, (b + 1) * samplesPerBin);
    let binPeak = 0;
    let sumSquares = 0;
    const count = Math.max(1, end - start);

    for (let i = start; i < end; i++) {
      const abs = Math.abs(channelData[i]);
      if (abs > binPeak) binPeak = abs;
      sumSquares += abs * abs;
    }

    const binRms = Math.sqrt(sumSquares / count);
    if (binPeak > globalMaxPeak) globalMaxPeak = binPeak;
    totalRmsSum += binRms;

    // Normalization with speech envelope weighting
    const peakNormalized = Math.max(0.04, Math.min(1.0, binPeak));
    peaks.push(parseFloat(peakNormalized.toFixed(3)));
    rmsValues.push(parseFloat(binRms.toFixed(3)));
  }

  const avgRms = parseFloat((totalRmsSum / numBins).toFixed(3));
  return {
    peaks,
    rms: rmsValues,
    duration: parseFloat(duration.toFixed(2)),
    maxPeak: parseFloat(globalMaxPeak.toFixed(3)),
    avgRms
  };
}

// Convert frequency (Hz) to Mel scale
function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

// Convert Mel scale to frequency (Hz)
function melToHz(mel: number): number {
  return 700 * (Math.pow(10, mel / 2595) - 1);
}

/**
 * Radix-2 Fast Fourier Transform (FFT) implementation
 */
function fft(real: Float64Array, imag: Float64Array): void {
  const n = real.length;
  // Bit-reversal permutation
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      const tempR = real[i];
      real[i] = real[j];
      real[j] = tempR;
      const tempI = imag[i];
      imag[i] = imag[j];
      imag[j] = tempI;
    }
    let k = n >> 1;
    while (k <= j) {
      j -= k;
      k >>= 1;
    }
    j += k;
  }

  // Cooley-Tukey butterflies
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const angle = (-2 * Math.PI) / len;
    const wStepR = Math.cos(angle);
    const wStepI = Math.sin(angle);

    for (let i = 0; i < n; i += len) {
      let wR = 1.0;
      let wI = 0.0;
      for (let k = 0; k < half; k++) {
        const uR = real[i + k];
        const uI = imag[i + k];
        const vR = real[i + k + half] * wR - imag[i + k + half] * wI;
        const vI = real[i + k + half] * wI + imag[i + k + half] * wR;

        real[i + k] = uR + vR;
        imag[i + k] = uI + vI;
        real[i + k + half] = uR - vR;
        imag[i + k + half] = uI - vI;

        const nextWR = wR * wStepR - wI * wStepI;
        const nextWI = wR * wStepI + wI * wStepR;
        wR = nextWR;
        wI = nextWI;
      }
    }
  }
}

export interface MelSpectrogramResult {
  matrix: number[][]; // [timeFrameIndex][melBinIndex] normalized 0-1
  frequencies: number[];
  time_frames: number;
  mel_bins: number;
  available: boolean;
  minDb: number;
  maxDb: number;
}

/**
 * Computes a genuine Short-Time Fourier Transform (STFT) Mel-scaled Spectrogram
 * directly from the uncompressed AudioBuffer samples.
 */
export function computeRealMelSpectrogram(
  audioBuffer: AudioBuffer,
  numMelBins = 32,
  numTimeFrames = 48
): MelSpectrogramResult {
  const pcm = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const totalSamples = pcm.length;

  if (totalSamples === 0) {
    return {
      matrix: [],
      frequencies: [200, 500, 1000, 2000, 4000, 8000],
      time_frames: numTimeFrames,
      mel_bins: numMelBins,
      available: false,
      minDb: -80,
      maxDb: 0
    };
  }

  // STFT windowing parameters
  const fftSize = 512;
  const hopSize = Math.max(64, Math.floor((totalSamples - fftSize) / Math.max(1, numTimeFrames)));
  const halfFft = fftSize / 2;

  // Construct Hanning window
  const hanning = new Float64Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    hanning[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
  }

  // Build Mel Filterbank (triangular overlapping filters)
  const fMin = 40;
  const fMax = Math.min(8000, sampleRate / 2);
  const melMin = hzToMel(fMin);
  const melMax = hzToMel(fMax);

  // mel points
  const melPoints = new Float64Array(numMelBins + 2);
  for (let i = 0; i < numMelBins + 2; i++) {
    melPoints[i] = melMin + (i * (melMax - melMin)) / (numMelBins + 1);
  }

  // FFT bin indices for each mel point
  const binIndices = new Int32Array(numMelBins + 2);
  for (let i = 0; i < numMelBins + 2; i++) {
    const freq = melToHz(melPoints[i]);
    binIndices[i] = Math.floor(((fftSize + 1) * freq) / sampleRate);
  }

  // Build filterbank matrix: filterbank[m][k]
  const filterbank: Float64Array[] = [];
  for (let m = 1; m <= numMelBins; m++) {
    const filter = new Float64Array(halfFft);
    const left = binIndices[m - 1];
    const center = binIndices[m];
    const right = binIndices[m + 1];

    for (let k = left; k < center && k < halfFft; k++) {
      if (center !== left) {
        filter[k] = (k - left) / (center - left);
      }
    }
    for (let k = center; k < right && k < halfFft; k++) {
      if (right !== center) {
        filter[k] = (right - k) / (right - center);
      }
    }
    filterbank.push(filter);
  }

  // Array to collect power spectra
  const rawMelFrames: number[][] = [];
  let globalMaxVal = -Infinity;
  let globalMinVal = Infinity;

  const realBuffer = new Float64Array(fftSize);
  const imagBuffer = new Float64Array(fftSize);

  for (let frameIdx = 0; frameIdx < numTimeFrames; frameIdx++) {
    const startSample = frameIdx * hopSize;

    // Window the samples
    for (let i = 0; i < fftSize; i++) {
      const sample = startSample + i < totalSamples ? pcm[startSample + i] : 0;
      realBuffer[i] = sample * hanning[i];
      imagBuffer[i] = 0;
    }

    // Run FFT
    fft(realBuffer, imagBuffer);

    // Compute power spectrum
    const powerSpectrum = new Float64Array(halfFft);
    for (let k = 0; k < halfFft; k++) {
      const mag = realBuffer[k] * realBuffer[k] + imagBuffer[k] * imagBuffer[k];
      powerSpectrum[k] = mag / fftSize;
    }

    // Apply Mel filterbank
    const melEnergies: number[] = [];
    for (let m = 0; m < numMelBins; m++) {
      const filter = filterbank[m];
      let energy = 0;
      for (let k = 0; k < halfFft; k++) {
        energy += powerSpectrum[k] * filter[k];
      }
      // Log energy scaling (dB scale) with floor
      const db = 10 * Math.log10(Math.max(1e-9, energy));
      melEnergies.push(db);

      if (db > globalMaxVal) globalMaxVal = db;
      if (db < globalMinVal) globalMinVal = db;
    }

    rawMelFrames.push(melEnergies);
  }

  // Normalize dynamic range to [0, 1] for visual display
  const dynRange = Math.max(20, globalMaxVal - Math.max(globalMinVal, globalMaxVal - 70));
  const normalizedMatrix: number[][] = [];

  for (let f = 0; f < numTimeFrames; f++) {
    const col: number[] = [];
    for (let m = 0; m < numMelBins; m++) {
      const db = rawMelFrames[f][m];
      const norm = (db - (globalMaxVal - dynRange)) / dynRange;
      const clamped = Math.max(0.01, Math.min(1.0, norm));
      col.push(parseFloat(clamped.toFixed(3)));
    }
    normalizedMatrix.push(col);
  }

  const centerFrequencies = [200, 500, 1000, 2000, 4000, 8000];

  return {
    matrix: normalizedMatrix,
    frequencies: centerFrequencies,
    time_frames: numTimeFrames,
    mel_bins: numMelBins,
    available: true,
    minDb: parseFloat((globalMaxVal - dynRange).toFixed(1)),
    maxDb: parseFloat(globalMaxVal.toFixed(1))
  };
}
