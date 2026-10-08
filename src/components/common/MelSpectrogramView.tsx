import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Activity, AlertCircle, Info, Sliders, Maximize2, Sparkles, Eye } from 'lucide-react';
import { computeRealMelSpectrogram, decodeAudioToBuffer } from '../../services/audioDsp';

interface MelSpectrogramProps {
  data?: {
    frequencies?: number[];
    time_frames?: number;
    mel_bins?: number;
    matrix?: number[][];
    available?: boolean;
    minDb?: number;
    maxDb?: number;
  } | null;
  audioBlob?: Blob | null;
  audioUrl?: string | null;
  duration?: number;
  verdict?: 'GENUINE' | 'SUSPICIOUS' | 'AI-GENERATED';
}

export const MelSpectrogramView: React.FC<MelSpectrogramProps> = ({
  data: initialData,
  audioBlob,
  audioUrl,
  duration = 2.5,
  verdict = 'GENUINE'
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [activeData, setActiveData] = useState(initialData);
  const [isComputingClientSpectrogram, setIsComputingClientSpectrogram] = useState(false);
  const [colormapMode, setColormapMode] = useState<'thermal' | 'inferno' | 'cyan'>('thermal');
  const [showCrosshair, setShowCrosshair] = useState(false);
  const [hoverCoords, setHoverCoords] = useState<{ x: number; y: number; time: number; freqHz: number; valDb: number } | null>(null);

  // If initialData is missing matrix or if audioBlob is provided, compute real Mel spectrogram directly from decoded PCM
  useEffect(() => {
    if (initialData && initialData.matrix && initialData.matrix.length > 0) {
      setActiveData(initialData);
    } else if (audioBlob) {
      setIsComputingClientSpectrogram(true);
      decodeAudioToBuffer(audioBlob)
        .then(audioBuffer => {
          const result = computeRealMelSpectrogram(audioBuffer, 32, 48);
          setActiveData(result);
        })
        .catch(err => {
          console.warn('[MelSpectrogram] Client computation note:', err);
        })
        .finally(() => {
          setIsComputingClientSpectrogram(false);
        });
    } else if (audioUrl) {
      setIsComputingClientSpectrogram(true);
      fetch(audioUrl)
        .then(r => r.blob())
        .then(blob => decodeAudioToBuffer(blob))
        .then(audioBuffer => {
          const result = computeRealMelSpectrogram(audioBuffer, 32, 48);
          setActiveData(result);
        })
        .catch(() => {})
        .finally(() => {
          setIsComputingClientSpectrogram(false);
        });
    }
  }, [initialData, audioBlob, audioUrl]);

  const isAvailable = Boolean(activeData && activeData.available && Array.isArray(activeData.matrix) && activeData.matrix.length > 0);

  // Colormap color mapper
  const getColor = (val: number, mode: 'thermal' | 'inferno' | 'cyan'): string => {
    const v = Math.max(0, Math.min(1, val));
    if (mode === 'thermal') {
      // Perceptual thermal colormap: deep navy -> royal blue -> cyan -> gold -> bright white
      if (v < 0.15) {
        const t = v / 0.15;
        const r = Math.floor(6 + t * 10);
        const g = Math.floor(10 + t * 20);
        const b = Math.floor(22 + t * 60);
        return `rgb(${r}, ${g}, ${b})`;
      } else if (v < 0.4) {
        const t = (v - 0.15) / 0.25;
        const r = Math.floor(16 + t * 2);
        const g = Math.floor(30 + t * 140);
        const b = Math.floor(82 + t * 120);
        return `rgb(${r}, ${g}, ${b})`;
      } else if (v < 0.75) {
        const t = (v - 0.4) / 0.35;
        const r = Math.floor(18 + t * 227);
        const g = Math.floor(170 + t * -10);
        const b = Math.floor(202 + t * -190);
        return `rgb(${r}, ${g}, ${b})`;
      } else {
        const t = (v - 0.75) / 0.25;
        const r = Math.floor(245 + t * 10);
        const g = Math.floor(160 + t * 95);
        const b = Math.floor(12 + t * 243);
        return `rgb(${r}, ${g}, ${b})`;
      }
    } else if (mode === 'inferno') {
      // Classic inferno: black -> dark purple -> reddish orange -> yellow
      if (v < 0.33) {
        const t = v / 0.33;
        return `rgb(${Math.floor(10 + t * 80)}, ${Math.floor(5 + t * 10)}, ${Math.floor(20 + t * 70)})`;
      } else if (v < 0.66) {
        const t = (v - 0.33) / 0.33;
        return `rgb(${Math.floor(90 + t * 140)}, ${Math.floor(15 + t * 70)}, ${Math.floor(90 - t * 70)})`;
      } else {
        const t = (v - 0.66) / 0.34;
        return `rgb(${Math.floor(230 + t * 25)}, ${Math.floor(85 + t * 170)}, ${Math.floor(20 + t * 80)})`;
      }
    } else {
      // Cyber cyan: black -> deep teal -> bright cyan
      const r = Math.floor(v * v * 120);
      const g = Math.floor(v * 240);
      const b = Math.floor(Math.min(255, 30 + v * 225));
      return `rgb(${r}, ${g}, ${b})`;
    }
  };

  // Render high-DPI canvas
  useEffect(() => {
    if (!isAvailable || !canvasRef.current || !activeData?.matrix) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const matrix = activeData.matrix; // columns = time frames, rows = mel bins
    const numFrames = matrix.length;
    const numBins = matrix[0]?.length || 32;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const cellWidth = width / numFrames;
    const cellHeight = height / numBins;

    // Draw spectrogram cells
    for (let f = 0; f < numFrames; f++) {
      const column = matrix[f];
      for (let b = 0; b < numBins; b++) {
        const val = column[b] ?? 0;
        ctx.fillStyle = getColor(val, colormapMode);
        // Low frequencies at bottom, high at top
        const y = height - (b + 1) * cellHeight;
        ctx.fillRect(f * cellWidth, y, Math.ceil(cellWidth) + 0.5, Math.ceil(cellHeight) + 0.5);
      }
    }

    // Draw subtle frequency guide lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach(fraction => {
      const y = Math.floor(height * fraction);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    });

    // Draw speech formant resonance band markers (300 Hz - 3.4 kHz human speech band)
    const voiceBandTop = height * (1 - 3400 / 8000);
    const voiceBandBottom = height * (1 - 300 / 8000);
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.25)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, voiceBandTop);
    ctx.lineTo(width, voiceBandTop);
    ctx.moveTo(0, voiceBandBottom);
    ctx.lineTo(width, voiceBandBottom);
    ctx.stroke();
    ctx.setLineDash([]);
  }, [isAvailable, activeData, colormapMode]);

  // Handle canvas hover crosshair inspector
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !activeData?.matrix) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const matrix = activeData.matrix;
    const numFrames = matrix.length;
    const numBins = matrix[0]?.length || 32;

    const frameIdx = Math.max(0, Math.min(numFrames - 1, Math.floor((x / rect.width) * numFrames)));
    const binIdx = Math.max(0, Math.min(numBins - 1, Math.floor(((rect.height - y) / rect.height) * numBins)));

    const timeAtPoint = (frameIdx / numFrames) * duration;
    // Map bin index to approximate Hz (0 - 8000 Hz)
    const freqHz = Math.round(700 * (Math.pow(10, ((binIdx / numBins) * 2840) / 2595) - 1));
    const normalizedVal = matrix[frameIdx]?.[binIdx] ?? 0;
    const valDb = Math.round(-80 + normalizedVal * 80);

    setHoverCoords({
      x,
      y,
      time: parseFloat(timeAtPoint.toFixed(2)),
      freqHz: Math.max(50, Math.min(8000, freqHz)),
      valDb
    });
    setShowCrosshair(true);
  };

  const handleMouseLeave = () => {
    setShowCrosshair(false);
    setHoverCoords(null);
  };

  return (
    <div className="rounded-xl border border-white/10 bg-[#11161D] p-5">
      {/* Section Header */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-cyan-400" />
            <h4 className="text-sm font-semibold tracking-wide text-white">
              MEL SPECTROGRAM (TIME-FREQUENCY ACOUSTIC SURFACE)
            </h4>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            Time-frequency log-energy representation used by the VoxSentra detection model to isolate biological formants from vocoder artifacts.
          </p>
        </div>

        {/* View Controls & Colormap Selector */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center rounded-lg border border-white/10 bg-[#0B0F14] p-0.5 text-[11px] font-mono text-slate-300">
            <button
              type="button"
              onClick={() => setColormapMode('thermal')}
              className={`rounded px-2 py-0.5 transition-colors ${colormapMode === 'thermal' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-white'}`}
            >
              Thermal
            </button>
            <button
              type="button"
              onClick={() => setColormapMode('inferno')}
              className={`rounded px-2 py-0.5 transition-colors ${colormapMode === 'inferno' ? 'bg-amber-500/20 text-amber-300 font-semibold' : 'text-slate-400 hover:text-white'}`}
            >
              Inferno
            </button>
            <button
              type="button"
              onClick={() => setColormapMode('cyan')}
              className={`rounded px-2 py-0.5 transition-colors ${colormapMode === 'cyan' ? 'bg-emerald-500/20 text-emerald-300 font-semibold' : 'text-slate-400 hover:text-white'}`}
            >
              Spectral
            </button>
          </div>
        </div>
      </div>

      {isAvailable ? (
        <div ref={containerRef} className="space-y-3">
          {/* Main Spectrogram Canvas with Axes */}
          <div className="relative overflow-hidden rounded-lg border border-white/10 bg-[#0B0F14] p-3">
            <div className="relative flex">
              {/* Frequency Y-Axis Labels (0 Hz to 8 kHz) */}
              <div className="flex w-14 shrink-0 flex-col justify-between py-1 pr-2 text-right font-mono text-[10px] text-slate-400 select-none">
                <span>8.0 kHz</span>
                <span>4.0 kHz</span>
                <span>2.0 kHz</span>
                <span>1.0 kHz</span>
                <span>500 Hz</span>
                <span>0 Hz</span>
              </div>

              {/* High-DPI Spectrogram Canvas */}
              <div className="relative flex-1">
                <canvas
                  ref={canvasRef}
                  width={640}
                  height={180}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                  className="h-44 w-full cursor-crosshair rounded bg-[#080C14] border border-white/5"
                />

                {/* Interactive Crosshair & Tooltip */}
                {showCrosshair && hoverCoords && (
                  <>
                    <div
                      style={{ left: `${hoverCoords.x}px` }}
                      className="pointer-events-none absolute top-0 bottom-0 w-[1px] bg-white/60"
                    />
                    <div
                      style={{ top: `${hoverCoords.y}px` }}
                      className="pointer-events-none absolute left-0 right-0 h-[1px] bg-white/60"
                    />
                    <div
                      style={{
                        left: `${Math.min(hoverCoords.x + 12, (containerRef.current?.clientWidth || 500) - 180)}px`,
                        top: `${Math.max(8, hoverCoords.y - 36)}px`
                      }}
                      className="pointer-events-none absolute z-30 flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-slate-950/95 px-2.5 py-1 text-[11px] font-mono shadow-xl text-white"
                    >
                      <span className="text-cyan-400">{hoverCoords.time}s</span>
                      <span className="text-slate-500">·</span>
                      <span className="text-amber-300">{hoverCoords.freqHz} Hz</span>
                      <span className="text-slate-500">·</span>
                      <span className="text-emerald-400">{hoverCoords.valDb} dB</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Time X-Axis Labels (Seconds) */}
            <div className="ml-14 mt-1 flex items-center justify-between text-[10px] font-mono text-slate-500">
              <span>0.00s</span>
              <span>{(duration * 0.25).toFixed(2)}s</span>
              <span>{(duration * 0.5).toFixed(2)}s</span>
              <span>{(duration * 0.75).toFixed(2)}s</span>
              <span className="text-slate-300 font-semibold">{duration.toFixed(2)}s</span>
            </div>
          </div>

          {/* Color Scale Legend and Acoustic Inspection Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-white/5 pt-3 text-xs">
            {/* Intensity dB Scale */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-slate-500">-80 dB (Noise Floor)</span>
              <div className="h-2 w-28 rounded-full bg-gradient-to-r from-[#080c18] via-[#06b6d4] to-[#fef08a] border border-white/10" />
              <span className="text-[10px] font-mono text-slate-300">0 dB (Peak Energy)</span>
            </div>

            {/* Acoustic Signature Characteristics callout */}
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-400">
              <span className="inline-flex items-center gap-1 rounded bg-cyan-500/10 px-2 py-0.5 text-cyan-300 border border-cyan-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                32 Mel Filterbanks
              </span>
              <span className="inline-flex items-center gap-1 rounded bg-white/5 px-2 py-0.5 text-slate-300 border border-white/10">
                16 kHz STFT (512-pt FFT)
              </span>
              <span className="inline-flex items-center gap-1 rounded bg-white/5 px-2 py-0.5 text-slate-300 border border-white/10">
                Hanning Windowed
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/10 bg-[#0B0F14]/50 py-10 text-center">
          <Activity className="h-8 w-8 text-slate-600 mb-2" />
          <h5 className="text-xs font-semibold text-slate-300">
            {isComputingClientSpectrogram ? 'Computing Time-Frequency Mel Surface...' : 'Awaiting Audio Signal for Spectrogram Processing'}
          </h5>
          <p className="mt-1 text-[11px] text-slate-500 max-w-sm">
            {isComputingClientSpectrogram
              ? 'Executing 512-point FFT windowing and 32-bin triangular Mel-scale filterbank analysis...'
              : 'Upload or record an audio file to view the real-time Mel Spectrogram representation.'}
          </p>
        </div>
      )}
    </div>
  );
};
