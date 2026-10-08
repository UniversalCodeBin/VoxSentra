import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Activity, AlertCircle } from 'lucide-react';
import { decodeAudioToBuffer, extractRealWaveform } from '../../services/audioDsp';

interface WaveformPlayerProps {
  peaks?: number[];
  audioUrl?: string | null;
  audioBlob?: Blob | null;
  duration?: number;
  compact?: boolean;
}

export const WaveformPlayer: React.FC<WaveformPlayerProps> = ({
  peaks: initialPeaks,
  audioUrl,
  audioBlob,
  duration = 0,
  compact = false
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(audioUrl || null);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

  // Real extracted peaks
  const [realPeaks, setRealPeaks] = useState<number[]>(initialPeaks || []);
  const [isExtractingPeaks, setIsExtractingPeaks] = useState(false);
  const [peakStats, setPeakStats] = useState<{ maxPeak: number; avgRms: number } | null>(null);

  // Resolve Audio URL from Blob or direct string
  useEffect(() => {
    if (audioBlob) {
      const url = URL.createObjectURL(audioBlob);
      setResolvedUrl(url);

      // Decode real PCM samples from audioBlob for authentic waveform
      setIsExtractingPeaks(true);
      decodeAudioToBuffer(audioBlob)
        .then(audioBuffer => {
          const extracted = extractRealWaveform(audioBuffer, 64);
          setRealPeaks(extracted.peaks);
          setPeakStats({ maxPeak: extracted.maxPeak, avgRms: extracted.avgRms });
          if (extracted.duration > 0) {
            setTotalDuration(extracted.duration);
          }
        })
        .catch(err => {
          console.warn('[WaveformPlayer] Local audio decode note:', err);
          if (initialPeaks && initialPeaks.length > 0) {
            setRealPeaks(initialPeaks);
          }
        })
        .finally(() => {
          setIsExtractingPeaks(false);
        });

      return () => URL.revokeObjectURL(url);
    } else if (audioUrl) {
      setResolvedUrl(audioUrl);
      if (initialPeaks && initialPeaks.length > 0) {
        setRealPeaks(initialPeaks);
      } else {
        // Fetch and decode url
        fetch(audioUrl)
          .then(res => res.blob())
          .then(blob => decodeAudioToBuffer(blob))
          .then(audioBuffer => {
            const extracted = extractRealWaveform(audioBuffer, 64);
            setRealPeaks(extracted.peaks);
            setPeakStats({ maxPeak: extracted.maxPeak, avgRms: extracted.avgRms });
            if (extracted.duration > 0) {
              setTotalDuration(extracted.duration);
            }
          })
          .catch(() => {
            if (initialPeaks) setRealPeaks(initialPeaks);
          });
      }
    } else if (initialPeaks && initialPeaks.length > 0) {
      setRealPeaks(initialPeaks);
    }
  }, [audioBlob, audioUrl, initialPeaks]);

  useEffect(() => {
    if (duration > 0) {
      setTotalDuration(duration);
    }
  }, [duration]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(err => {
        console.warn('Playback error:', err);
      });
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      if (audioRef.current.duration && (!totalDuration || totalDuration <= 0)) {
        setTotalDuration(audioRef.current.duration);
      }
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = pos * (totalDuration || 1);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
    setCurrentTime(newTime);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const fraction = Math.max(0, Math.min(1, x / rect.width));
    setHoverTime(fraction * (totalDuration || 1));
    setHoverX(x);
  };

  const handleMouseLeave = () => {
    setHoverTime(null);
    setHoverX(null);
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    const next = !isMuted;
    audioRef.current.muted = next;
    setIsMuted(next);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
      audioRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const handleReset = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.pause();
    }
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const displayPeaks = realPeaks.length > 0 ? realPeaks : [0.1, 0.2, 0.4, 0.6, 0.7, 0.5, 0.3, 0.2];
  const progressFraction = totalDuration > 0 ? Math.min(1, currentTime / totalDuration) : 0;

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}.${ms}`;
  };

  const formatSimpleTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className={`rounded-xl border border-white/10 bg-[#11161D] p-4 ${compact ? 'py-3' : ''}`}>
      {resolvedUrl && (
        <audio
          ref={audioRef}
          src={resolvedUrl}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onLoadedMetadata={() => {
            if (audioRef.current?.duration) {
              setTotalDuration(audioRef.current.duration);
            }
          }}
        />
      )}

      {/* Top Header: Amplitude over Time Title + Stats */}
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-cyan-400" />
          <span className="text-[11px] font-mono tracking-wider text-slate-300">
            TIME-DOMAIN AMPLITUDE ENVELOPE
          </span>
          {isExtractingPeaks && (
            <span className="text-[10px] font-mono text-cyan-400 animate-pulse">
              (Decoding PCM...)
            </span>
          )}
        </div>

        {peakStats && (
          <div className="flex items-center gap-3 text-[10px] font-mono text-slate-400">
            <span>Peak: {(peakStats.maxPeak * 100).toFixed(0)}% FS</span>
            <span className="text-slate-600">·</span>
            <span>RMS: {(peakStats.avgRms * 100).toFixed(0)}%</span>
          </div>
        )}
      </div>

      {/* Interactive Waveform Bar Container */}
      <div
        ref={containerRef}
        onClick={handleSeek}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="group relative flex h-16 w-full cursor-pointer items-center gap-[2px] rounded-lg bg-[#0B0F14] px-2.5 py-1.5 transition-colors border border-white/5 hover:border-cyan-500/30 select-none overflow-hidden"
      >
        {/* Hover scrub line and tooltip */}
        {hoverX !== null && hoverTime !== null && (
          <>
            <div
              style={{ left: `${hoverX}px` }}
              className="pointer-events-none absolute top-0 bottom-0 z-20 w-[1px] bg-cyan-400/80 shadow-[0_0_8px_rgba(6,182,212,0.8)]"
            />
            <div
              style={{ left: `${Math.min(hoverX + 8, (containerRef.current?.clientWidth || 300) - 60)}px` }}
              className="pointer-events-none absolute top-1.5 z-30 rounded bg-slate-900/90 px-1.5 py-0.5 text-[10px] font-mono text-cyan-300 border border-cyan-500/30"
            >
              {formatTime(hoverTime)}
            </div>
          </>
        )}

        {/* Current Playhead indicator */}
        <div
          style={{ left: `${progressFraction * 100}%` }}
          className="pointer-events-none absolute top-0 bottom-0 z-10 w-[2px] bg-white transition-all duration-75 shadow-[0_0_10px_rgba(255,255,255,0.9)]"
        />

        {/* Real Waveform Bars */}
        {displayPeaks.map((peak, idx) => {
          const barFraction = idx / displayPeaks.length;
          const isPassed = barFraction <= progressFraction;
          // Calculate symmetrical amplitude height
          const heightPercent = Math.max(8, Math.min(96, peak * 100));

          return (
            <div
              key={idx}
              className="relative flex h-full flex-1 items-center justify-center"
            >
              <div
                style={{ height: `${heightPercent}%` }}
                className={`w-full rounded-xs transition-all duration-75 ${
                  isPassed
                    ? 'bg-cyan-400 shadow-[0_0_4px_rgba(6,182,212,0.4)]'
                    : 'bg-slate-600/60 group-hover:bg-slate-500/70'
                }`}
              />
            </div>
          );
        })}
      </div>

      {/* Time Axis Bar: 00:00 to Duration with intermediate tick markers */}
      <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono text-slate-500">
        <span>00:00.0</span>
        {totalDuration > 2 && (
          <span>{formatSimpleTime(totalDuration * 0.25)}</span>
        )}
        {totalDuration > 1 && (
          <span>{formatSimpleTime(totalDuration * 0.5)}</span>
        )}
        {totalDuration > 2 && (
          <span>{formatSimpleTime(totalDuration * 0.75)}</span>
        )}
        <span className="text-slate-300 font-semibold">{formatTime(totalDuration)}</span>
      </div>

      {/* Control Strip: Play/Pause, Position, Mute, Volume */}
      <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2.5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={togglePlay}
            disabled={!resolvedUrl}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 transition-all hover:bg-cyan-500/30 hover:text-white active:scale-95 disabled:opacity-40"
            title={isPlaying ? 'Pause' : 'Play audio'}
          >
            {isPlaying ? (
              <Pause className="h-3.5 w-3.5 fill-current" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current translate-x-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={handleReset}
            disabled={!resolvedUrl}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10 hover:text-white transition-colors"
            title="Reset position"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          {/* Time Counter */}
          <div className="font-mono text-xs tabular-nums text-slate-200">
            <span className="font-semibold text-cyan-400">{formatTime(currentTime)}</span>
            <span className="text-slate-500"> / </span>
            <span className="text-slate-400">{formatTime(totalDuration)}</span>
          </div>
        </div>

        {/* Volume & Audio Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleMute}
            className="text-slate-400 hover:text-white transition-colors p-1"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="h-4 w-4 text-red-400" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </button>

          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="h-1.5 w-16 cursor-pointer accent-cyan-400 bg-white/10 rounded-lg"
            title="Volume"
          />
        </div>
      </div>
    </div>
  );
};
