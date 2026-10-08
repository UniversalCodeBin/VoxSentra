import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Mic, 
  MicOff, 
  Radio, 
  AlertCircle, 
  ShieldCheck, 
  ShieldAlert, 
  AlertTriangle, 
  Activity, 
  Loader2, 
  Volume2, 
  Clock, 
  Layers, 
  CheckCircle2, 
  Sparkles,
  RefreshCw,
  HelpCircle
} from 'lucide-react';
import { ContextType, LiveDetectionItem, VerdictType } from '../../types';
import { ContextSelector } from '../analysis/ContextSelector';
import { api } from '../../services/api';

// Helper: Convert Float32Array PCM samples to a 16 kHz 16-bit Mono WAV Blob
function exportWavBlob(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  // RIFF Chunk Descriptor
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');

  // "fmt " Sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // SubChunk1Size (16 for PCM)
  view.setUint16(20, 1, true);  // AudioFormat (1 = PCM)
  view.setUint16(22, 1, true);  // NumChannels (1 = Mono)
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * 2, true); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
  view.setUint16(32, 2, true);  // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample (16-bit)

  // "data" Sub-chunk
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  // Write 16-bit PCM samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

// Helper: Convert Blob to Base64 String
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export const LiveMonitor: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [volumeLevel, setVolumeLevel] = useState(0); // 0 to 100
  const [context, setContext] = useState<ContextType>('unknown');
  const [currentDetection, setCurrentDetection] = useState<LiveDetectionItem | null>(null);
  const [recentDetections, setRecentDetections] = useState<LiveDetectionItem[]>([]);
  const [chunkCount, setChunkCount] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [isProcessingChunk, setIsProcessingChunk] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<any>(null);
  const chunkIntervalRef = useRef<any>(null);

  // Buffer to accumulate raw PCM samples across the current chunk window (2.5 seconds)
  const sampleAccumulatorRef = useRef<number[]>([]);

  // Stop recording cleanup
  const stopRecording = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current);
      chunkIntervalRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    sampleAccumulatorRef.current = [];
    setIsRecording(false);
    setVolumeLevel(0);
  }, []);

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  // Dispatch chunk analysis to real backend
  const dispatchChunkAnalysis = async (pcmSamples: Float32Array, sampleRate: number) => {
    if (pcmSamples.length === 0) return;
    setIsProcessingChunk(true);
    try {
      const wavBlob = exportWavBlob(pcmSamples, sampleRate);
      const base64 = await blobToBase64(wavBlob);
      const result = await api.analyzeChunk(base64, context);
      
      setCurrentDetection(result);
      setRecentDetections(prev => [result, ...prev.slice(0, 24)]);
      setChunkCount(c => c + 1);
    } catch (err: any) {
      console.warn('[LiveMonitor] Chunk analysis error:', err.message);
    } finally {
      setIsProcessingChunk(false);
    }
  };

  // Start real microphone capture
  const startRecording = async () => {
    setMicError(null);
    sampleAccumulatorRef.current = [];
    setElapsedSeconds(0);

    try {
      // Request audio stream with browser permissions
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: true,
          channelCount: 1
        }
      });

      mediaStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);

      // Analyser for real-time oscilloscope & volume level
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyserRef.current = analyser;

      // ScriptProcessor to collect PCM samples directly from microphone feed
      const bufferSize = 4096;
      const scriptProcessor = audioCtx.createScriptProcessor(bufferSize, 1, 1);
      scriptProcessorRef.current = scriptProcessor;

      scriptProcessor.onaudioprocess = (e) => {
        const inputBuffer = e.inputBuffer.getChannelData(0);
        // Accumulate samples
        for (let i = 0; i < inputBuffer.length; i++) {
          sampleAccumulatorRef.current.push(inputBuffer[i]);
        }
      };

      source.connect(scriptProcessor);
      scriptProcessor.connect(audioCtx.destination);

      setIsRecording(true);
      drawOscilloscope();

      // Running stopwatch
      timerIntervalRef.current = setInterval(() => {
        setElapsedSeconds(s => s + 1);
      }, 1000);

      // Periodic Chunk Evaluation Timer (every 2.5 seconds)
      chunkIntervalRef.current = setInterval(() => {
        if (!audioContextRef.current) return;
        const currentRate = audioContextRef.current.sampleRate || 16000;
        const captured = sampleAccumulatorRef.current;
        sampleAccumulatorRef.current = []; // flush accumulator for next segment

        if (captured.length > 2000) {
          const floatArray = new Float32Array(captured);
          dispatchChunkAnalysis(floatArray, currentRate);
        }
      }, 2500);

    } catch (err: any) {
      console.error('[LiveMonitor] Microphone initialization error:', err);
      setMicError(
        err.name === 'NotAllowedError'
          ? 'Microphone permission was denied by the browser. Please allow microphone access in your browser settings.'
          : `Unable to access microphone: ${err.message || 'Unknown device error'}`
      );
      stopRecording();
    }
  };

  // Oscilloscope Canvas Visualizer
  const drawOscilloscope = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      animationFrameRef.current = requestAnimationFrame(render);
      analyser.getByteTimeDomainData(dataArray);

      // Compute RMS volume for VU meter
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        const normalized = (dataArray[i] - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / bufferLength);
      setVolumeLevel(Math.min(100, Math.round(rms * 250)));

      const width = canvas.width;
      const height = canvas.height;

      // Dark background
      ctx.fillStyle = '#0B0F14';
      ctx.fillRect(0, 0, width, height);

      // Subtle horizontal centerline
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      // Oscilloscope wave trace
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = '#22d3ee'; // Cyan accent
      ctx.shadowColor = 'rgba(34, 211, 238, 0.5)';
      ctx.shadowBlur = 6;
      ctx.beginPath();

      const sliceWidth = (width * 1.0) / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(width, height / 2);
      ctx.stroke();
      ctx.shadowBlur = 0; // reset
    };

    render();
  };

  // Test simulation for environments without microphone input
  const handleSimulateChunk = async (type: 'genuine' | 'spoof') => {
    setIsProcessingChunk(true);
    try {
      const sampleRate = 16000;
      const duration = 2.0;
      const samples = new Float32Array(Math.floor(sampleRate * duration));
      let phase = 0;

      for (let i = 0; i < samples.length; i++) {
        const t = i / sampleRate;
        if (type === 'spoof') {
          // Synthetic vocoder tones
          const f0 = 175;
          phase += (2 * Math.PI * f0) / sampleRate;
          samples[i] = 0.5 * Math.sin(phase) + 0.3 * Math.sin(2 * phase) + 0.1 * Math.sin(4 * phase);
        } else {
          // Natural speech harmonic modulation
          const f0 = 130 + 12 * Math.sin(t * 4);
          phase += (2 * Math.PI * f0) / sampleRate;
          samples[i] = (0.5 * Math.sin(phase) + 0.25 * Math.sin(2 * phase) + (Math.random() - 0.5) * 0.05);
        }
      }

      await dispatchChunkAnalysis(samples, sampleRate);
    } catch (err: any) {
      console.warn('Simulation error:', err.message);
    } finally {
      setIsProcessingChunk(false);
    }
  };

  const getVerdictStyle = (verdict?: VerdictType) => {
    switch (verdict) {
      case 'GENUINE':
        return {
          text: 'text-emerald-400',
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/30',
          dot: 'bg-emerald-400'
        };
      case 'SUSPICIOUS':
        return {
          text: 'text-amber-400',
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/30',
          dot: 'bg-amber-400'
        };
      case 'AI-GENERATED':
        return {
          text: 'text-red-400',
          bg: 'bg-red-500/10',
          border: 'border-red-500/30',
          dot: 'bg-red-400'
        };
      default:
        return {
          text: 'text-slate-400',
          bg: 'bg-white/5',
          border: 'border-white/10',
          dot: 'bg-slate-500'
        };
    }
  };

  const vStyle = getVerdictStyle(currentDetection?.verdict);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-xs font-mono tracking-widest text-slate-400">REAL-TIME TELEMETRY</span>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            LIVE VOICE INTEGRITY
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-400">
            Analyze incoming microphone audio in short real-time segments.
          </p>
        </div>

        {/* Action Controls & Listening Indicator */}
        <div className="flex items-center gap-3">
          {/* Status Badge */}
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#11161D] px-3 py-1.5 text-xs font-mono">
            <span className={`h-2.5 w-2.5 rounded-full ${isRecording ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
            <span className={isRecording ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
              {isRecording ? 'LISTENING' : 'STANDBY'}
            </span>
            {isRecording && (
              <>
                <span className="text-slate-600">·</span>
                <span className="text-slate-300 tabular-nums">{formatTimer(elapsedSeconds)}</span>
              </>
            )}
          </div>

          {/* Start / Stop Stream Toggle */}
          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all active:scale-95 shadow-sm ${
              isRecording
                ? 'bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30'
                : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400 cursor-pointer shadow-[0_0_15px_rgba(6,182,212,0.3)]'
            }`}
          >
            {isRecording ? (
              <>
                <MicOff className="h-4 w-4" />
                <span>Stop Stream</span>
              </>
            ) : (
              <>
                <Mic className="h-4 w-4" />
                <span>Start Microphone</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Permission or Hardware Error Banner */}
      {micError && (
        <div className="rounded-xl border border-red-500/30 bg-red-950/30 p-4 text-xs text-red-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
            <div className="space-y-1">
              <strong className="text-red-300 block">Microphone Access Error</strong>
              <p>{micError}</p>
              <p className="text-slate-400 text-[11px] pt-1">
                You can still test real chunk detection using the test buttons below.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Live Waveform Oscilloscope & Volume Meter */}
      <div className="rounded-xl border border-white/10 bg-[#11161D] p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-cyan-400" />
            <span className="text-xs font-mono tracking-wider text-slate-300">LIVE OSCILLOSCOPE STREAM</span>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            {/* Real-time VU Volume Level */}
            <div className="flex items-center gap-2 text-slate-400">
              <Volume2 className="h-3.5 w-3.5" />
              <div className="h-2 w-16 overflow-hidden rounded-full bg-[#0B0F14] border border-white/10">
                <div
                  style={{ width: `${volumeLevel}%` }}
                  className={`h-full transition-all duration-75 ${
                    volumeLevel > 75 ? 'bg-red-400' : volumeLevel > 40 ? 'bg-amber-400' : 'bg-cyan-400'
                  }`}
                />
              </div>
              <span className="tabular-nums text-[10px] w-6">{volumeLevel}%</span>
            </div>

            {isProcessingChunk && (
              <div className="flex items-center gap-1.5 text-cyan-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="text-[11px]">Evaluating chunk...</span>
              </div>
            )}
          </div>
        </div>

        {/* Canvas Display */}
        <div className="relative overflow-hidden rounded-lg border border-white/10 bg-[#0B0F14]">
          <canvas
            ref={canvasRef}
            width={800}
            height={150}
            className="h-32 sm:h-36 w-full"
          />

          {!isRecording && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0B0F14]/85 p-6 text-center">
              <Mic className="h-8 w-8 text-slate-600 mb-2" />
              <span className="text-xs font-bold text-slate-300">WAITING FOR AUDIO STREAM</span>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Click &quot;Start Microphone&quot; to begin continuous real-time analysis.
              </p>
            </div>
          )}
        </div>

        {/* Live Stream Telemetry Bar */}
        <div className="mt-3 flex flex-wrap items-center justify-between text-[11px] font-mono text-slate-400 border-t border-white/5 pt-2.5">
          <div className="flex items-center gap-3">
            <span>Segment Interval: <strong className="text-slate-300">2.5s</strong></span>
            <span className="text-slate-600">·</span>
            <span>Sampling: <strong className="text-slate-300">16,000 Hz Mono</strong></span>
            <span className="text-slate-600">·</span>
            <span>Analyzed Chunks: <strong className="text-cyan-400 tabular-nums">{chunkCount}</strong></span>
          </div>

          {/* Quick Simulation Trigger for Sandbox/Judge verification */}
          <div className="flex items-center gap-2 mt-2 sm:mt-0">
            <span className="text-slate-500 text-[10px]">Test Chunk:</span>
            <button
              type="button"
              disabled={isProcessingChunk}
              onClick={() => handleSimulateChunk('genuine')}
              className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-emerald-300 hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              + Human Speech
            </button>
            <button
              type="button"
              disabled={isProcessingChunk}
              onClick={() => handleSimulateChunk('spoof')}
              className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-red-300 hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              + AI Clone
            </button>
          </div>
        </div>
      </div>

      {/* Real-Time Assessment Cards */}
      <div className={`rounded-xl border ${vStyle.border} ${vStyle.bg} p-6 transition-all`}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Current Verdict */}
          <div>
            <span className="text-xs font-mono tracking-wider text-slate-400">CURRENT VERDICT</span>
            <div className="mt-1 flex items-center gap-2">
              <span className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${vStyle.text}`}>
                {currentDetection?.verdict || 'AWAITING SPEECH'}
              </span>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">
              {currentDetection
                ? `Last evaluated at ${new Date(currentDetection.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                : 'Awaiting audio activity from stream'}
            </p>
          </div>

          {/* AI Probability */}
          <div>
            <span className="text-xs font-mono tracking-wider text-slate-400">AI PROBABILITY</span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className={`font-mono text-2xl sm:text-3xl font-bold tabular-nums ${
                currentDetection ? (currentDetection.ai_probability >= 50 ? 'text-red-400' : 'text-emerald-400') : 'text-slate-500'
              }`}>
                {currentDetection ? currentDetection.ai_probability.toFixed(1) : '—'}
              </span>
              {currentDetection && <span className="text-xs font-mono text-slate-500">%</span>}
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">
              {currentDetection ? (currentDetection.ai_probability >= 50 ? 'Synthetic acoustic artifacts detected' : 'Organic human acoustic signature') : 'Awaiting data'}
            </p>
          </div>

          {/* Risk Score */}
          <div>
            <span className="text-xs font-mono tracking-wider text-slate-400">RISK SCORE</span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="font-mono text-2xl sm:text-3xl font-bold tabular-nums text-white">
                {currentDetection ? currentDetection.risk_score : '—'}
              </span>
              <span className="text-xs font-mono text-slate-500">/ 100</span>
              {currentDetection && (
                <span className={`ml-2 text-xs font-mono font-bold ${vStyle.text}`}>
                  ({currentDetection.risk_level})
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">
              Composite threat rating with context modifier
            </p>
          </div>
        </div>

        {/* Live Recommendation Badge */}
        {currentDetection?.recommendation && (
          <div className="mt-4 border-t border-white/10 pt-3 flex items-start gap-2 text-xs text-slate-300">
            <span className="font-mono text-[11px] text-slate-400 uppercase tracking-wider shrink-0">RECOMMENDATION:</span>
            <span>{currentDetection.recommendation.action}</span>
          </div>
        )}
      </div>

      {/* Context Modifier Selector */}
      <ContextSelector
        value={context}
        onChange={setContext}
      />

      {/* RECENT DETECTIONS TABLE */}
      <div className="rounded-xl border border-white/10 bg-[#11161D] p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-xs font-mono tracking-wider text-slate-400">STREAM AUDIT LOG</span>
            <h3 className="text-sm font-bold text-white">RECENT DETECTIONS</h3>
          </div>
          <span className="text-xs font-mono text-slate-400">
            {recentDetections.length} recorded events
          </span>
        </div>

        {recentDetections.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500">
            No live detections yet. Start the microphone to begin analyzing voice segments.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/10 font-mono text-[11px] text-slate-400 bg-[#0E131A]">
                <tr>
                  <th className="py-2.5 px-3 font-normal">TIME</th>
                  <th className="py-2.5 px-3 font-normal">VERDICT</th>
                  <th className="py-2.5 px-3 font-normal">AI PROBABILITY</th>
                  <th className="py-2.5 px-3 font-normal">RISK SCORE</th>
                  <th className="py-2.5 px-3 font-normal">CONFIDENCE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {recentDetections.map((det) => {
                  const style = getVerdictStyle(det.verdict);
                  return (
                    <tr key={det.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-2.5 px-3 text-slate-400">
                        {new Date(det.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center gap-1.5 font-bold ${style.text}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                          {det.verdict}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 tabular-nums text-slate-300">
                        {det.ai_probability.toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-3 tabular-nums">
                        <span className={`font-semibold ${
                          det.risk_score >= 60 ? 'text-red-400' : det.risk_score >= 30 ? 'text-amber-400' : 'text-emerald-400'
                        }`}>
                          {det.risk_score} / 100 ({det.risk_level})
                        </span>
                      </td>
                      <td className="py-2.5 px-3 tabular-nums text-slate-400">
                        {det.confidence.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
