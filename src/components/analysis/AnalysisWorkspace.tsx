import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  Mic, 
  MicOff, 
  FileAudio, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  ArrowRight, 
  Music, 
  Radio, 
  Square,
  Volume2
} from 'lucide-react';
import { ContextType, AnalysisRecord } from '../../types';
import { ContextSelector } from './ContextSelector';
import { WaveformPlayer } from '../common/WaveformPlayer';
import { AnalysisResult } from './AnalysisResult';
import { AudioPreprocessingPipeline } from './AudioPreprocessingPipeline';
import { api } from '../../services/api';

interface AnalysisWorkspaceProps {
  onAnalysisComplete?: (record: AnalysisRecord) => void;
  onNavigateToLive?: () => void;
  onNavigateToHistory?: () => void;
}

export const AnalysisWorkspace: React.FC<AnalysisWorkspaceProps> = ({
  onAnalysisComplete,
  onNavigateToLive,
  onNavigateToHistory
}) => {
  const [workspaceMode, setWorkspaceMode] = useState<'upload' | 'mic'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileAudioBlob, setFileAudioBlob] = useState<Blob | null>(null);
  const [fileDuration, setFileDuration] = useState<number>(0);
  const [context, setContext] = useState<ContextType>('unknown');
  const [isDragging, setIsDragging] = useState(false);
  
  // Microphone Capture States
  const [isMicRecording, setIsMicRecording] = useState(false);
  const [micDuration, setMicDuration] = useState(0);
  const [micVolume, setMicVolume] = useState(0);

  // Processing states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [processingStage, setProcessingStage] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentResult, setCurrentResult] = useState<AnalysisRecord | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micTimerRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micAnimRef = useRef<number | null>(null);

  // Clean up mic recording on unmount
  useEffect(() => {
    return () => {
      stopMicRecordingClean();
    };
  }, []);

  const stopMicRecordingClean = () => {
    if (micTimerRef.current) clearInterval(micTimerRef.current);
    if (micAnimRef.current) cancelAnimationFrame(micAnimRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setIsMicRecording(false);
    setMicVolume(0);
  };

  const startMicRecording = async () => {
    setErrorMsg(null);
    setCurrentResult(null);
    setSelectedFile(null);
    setFileAudioBlob(null);
    setMicDuration(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          sampleRate: 16000
        }
      });
      micStreamRef.current = stream;

      // Audio level analyser
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        micAnimRef.current = requestAnimationFrame(updateLevel);
        analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const val = (dataArray[i] - 128) / 128;
          sum += val * val;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        setMicVolume(Math.min(100, Math.round(rms * 300)));
      };
      updateLevel();

      const chunks: BlobPart[] = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunks, { type: 'audio/wav' });
        const generatedFile = new File([audioBlob], `microphone_capture_${Date.now()}.wav`, { type: 'audio/wav' });
        setSelectedFile(generatedFile);
        setFileAudioBlob(audioBlob);
        setFileDuration(micDuration || 2.5);
      };

      mediaRecorder.start();
      setIsMicRecording(true);

      micTimerRef.current = setInterval(() => {
        setMicDuration(d => d + 1);
      }, 1000);

    } catch (err: any) {
      console.error('Mic access error:', err);
      setErrorMsg('Microphone access denied: ' + (err.message || 'Please check microphone permissions.'));
      stopMicRecordingClean();
    }
  };

  const stopMicRecording = () => {
    stopMicRecordingClean();
  };

  const handleFileSelect = (file: File) => {
    setErrorMsg(null);
    setCurrentResult(null);

    if (file.size > 25 * 1024 * 1024) {
      setErrorMsg('File exceeds 25 MB maximum allowed limit.');
      return;
    }

    setSelectedFile(file);
    setFileAudioBlob(file);

    const audio = new Audio();
    audio.src = URL.createObjectURL(file);
    audio.onloadedmetadata = () => {
      setFileDuration(audio.duration || 0);
    };
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  // Hackathon instant sample loader
  const handleLoadSample = async (sampleType: 'genuine' | 'spoof') => {
    setErrorMsg(null);
    setCurrentResult(null);
    try {
      const url = sampleType === 'genuine' ? '/samples/genuine_sample.wav' : '/samples/spoof_sample.wav';
      const filename = sampleType === 'genuine' ? 'genuine_executive_call_sample.wav' : 'synthetic_voice_clone_sample.wav';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Could not fetch sample audio');
      const blob = await res.blob();
      const file = new File([blob], filename, { type: 'audio/wav' });
      setSelectedFile(file);
      setFileAudioBlob(blob);
      setFileDuration(2.5);
      if (sampleType === 'spoof') {
        setContext('high_value_transfer');
      } else {
        setContext('unknown');
      }
    } catch (err: any) {
      setErrorMsg('Failed to load sample: ' + err.message);
    }
  };

  const handleStartAnalysis = async () => {
    if (!selectedFile && !fileAudioBlob) {
      setErrorMsg('Please select or record an audio recording first.');
      return;
    }

    setIsAnalyzing(true);
    setErrorMsg(null);
    setProcessingStage(1);

    const stage1 = setTimeout(() => setProcessingStage(2), 350);
    const stage2 = setTimeout(() => setProcessingStage(3), 700);
    const stage3 = setTimeout(() => setProcessingStage(4), 1100);

    try {
      let record: AnalysisRecord;
      if (selectedFile) {
        record = await api.analyzeFile(selectedFile, context);
      } else if (fileAudioBlob) {
        record = await api.analyzeBlob(fileAudioBlob, 'audio_recording.wav', context);
      } else {
        throw new Error('No audio data available.');
      }

      setProcessingStage(5);
      setTimeout(() => {
        setIsAnalyzing(false);
        setCurrentResult(record);
        if (onAnalysisComplete) onAnalysisComplete(record);
      }, 400);
    } catch (err: any) {
      clearTimeout(stage1);
      clearTimeout(stage2);
      clearTimeout(stage3);
      setIsAnalyzing(false);
      setErrorMsg(err.message || 'Audio analysis failed. Verify file integrity and backend connection.');
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setFileAudioBlob(null);
    setFileDuration(0);
    setCurrentResult(null);
    setErrorMsg(null);
    setProcessingStage(0);
    setMicDuration(0);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-xs font-mono tracking-widest text-slate-400">ANALYSIS WORKSPACE</span>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            ANALYZE VOICE
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-400">
            Evaluate voice authenticity, acoustic signatures, and interaction risk.
          </p>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex items-center gap-1 self-start rounded-lg border border-white/10 bg-[#11161D] p-1">
          <button
            type="button"
            onClick={() => {
              if (isMicRecording) stopMicRecordingClean();
              setWorkspaceMode('upload');
            }}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              workspaceMode === 'upload'
                ? 'bg-white/15 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Upload Audio</span>
          </button>

          <button
            type="button"
            onClick={() => setWorkspaceMode('mic')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              workspaceMode === 'mic'
                ? 'bg-white/15 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Mic className="h-3.5 w-3.5" />
            <span>Live Microphone</span>
          </button>
        </div>
      </div>

      {/* If Result Available, Show Full Security Analysis Report */}
      {currentResult ? (
        <AnalysisResult
          record={currentResult}
          audioBlob={fileAudioBlob}
          onReset={handleReset}
          onViewHistory={onNavigateToHistory}
        />
      ) : (
        <div className="space-y-6">
          {workspaceMode === 'upload' ? (
            /* Upload Mode: Dropzone */
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`group relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-all cursor-pointer ${
                isDragging
                  ? 'border-cyan-400 bg-cyan-950/20'
                  : 'border-white/15 bg-[#11161D]/70 hover:border-white/30 hover:bg-[#11161D]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".wav,.mp3,.m4a,.flac,.ogg,.webm,audio/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
              />

              <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-[#0B0F14] text-cyan-400 group-hover:scale-105 transition-transform shadow-xs">
                <Upload className="h-6 w-6" />
              </div>

              <div className="mt-4">
                <span className="text-sm font-semibold tracking-wide text-white">
                  DROP AUDIO FILE HERE
                </span>
                <p className="mt-1 text-xs text-slate-400">
                  or <span className="text-cyan-400 underline underline-offset-2">browse files</span> on your system
                </p>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px] font-mono text-slate-400">
                <span>WAV</span>
                <span>·</span>
                <span>MP3</span>
                <span>·</span>
                <span>M4A</span>
                <span>·</span>
                <span>FLAC</span>
                <span>·</span>
                <span>MAX 25 MB</span>
              </div>
            </div>
          ) : (
            /* Live Microphone Mode: Dedicated Inline Capture */
            <div className="rounded-xl border border-white/10 bg-[#11161D] p-6 text-center space-y-5">
              <div className="flex flex-col items-center justify-center">
                <div className={`relative flex h-20 w-20 items-center justify-center rounded-full border-2 transition-all ${
                  isMicRecording
                    ? 'border-red-500 bg-red-950/30 text-red-400 animate-pulse'
                    : 'border-cyan-500/40 bg-cyan-950/20 text-cyan-400'
                }`}>
                  <Mic className="h-8 w-8" />
                  {isMicRecording && (
                    <span className="absolute -inset-1 rounded-full border border-red-500/40 animate-ping" />
                  )}
                </div>

                <div className="mt-4">
                  <h3 className="text-base font-bold text-white">
                    {isMicRecording ? 'LISTENING TO MICROPHONE...' : 'RECORD LIVE VOICE SAMPLE'}
                  </h3>
                  <p className="mt-1 text-xs text-slate-400 max-w-md mx-auto">
                    {isMicRecording
                      ? `Recording speech stream... ${micDuration}s elapsed. Speak clearly into the microphone.`
                      : 'Capture a live voice sample from your device for deepfake & voice spoof inspection.'}
                  </p>
                </div>

                {/* Level VU Meter */}
                {isMicRecording && (
                  <div className="mt-4 flex items-center gap-3 text-xs font-mono text-slate-400">
                    <Volume2 className="h-4 w-4" />
                    <div className="h-2 w-36 overflow-hidden rounded-full bg-[#0B0F14] border border-white/10">
                      <div
                        style={{ width: `${micVolume}%` }}
                        className={`h-full transition-all duration-75 ${
                          micVolume > 75 ? 'bg-red-400' : micVolume > 40 ? 'bg-amber-400' : 'bg-cyan-400'
                        }`}
                      />
                    </div>
                    <span className="tabular-nums w-8">{micVolume}%</span>
                  </div>
                )}
              </div>

              {/* Record / Stop Button */}
              <div className="flex items-center justify-center gap-3 pt-2">
                {isMicRecording ? (
                  <button
                    type="button"
                    onClick={stopMicRecording}
                    className="flex items-center gap-2 rounded-xl bg-red-500 px-6 py-2.5 text-xs font-bold text-white hover:bg-red-600 active:scale-95 transition-all shadow-md cursor-pointer"
                  >
                    <Square className="h-3.5 w-3.5 fill-white" />
                    <span>Stop & Process Recording</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startMicRecording}
                    className="flex items-center gap-2 rounded-xl bg-cyan-500 px-6 py-2.5 text-xs font-bold text-slate-950 hover:bg-cyan-400 active:scale-95 transition-all shadow-[0_0_15px_rgba(6,182,212,0.3)] cursor-pointer"
                  >
                    <Mic className="h-4 w-4" />
                    <span>Start Recording</span>
                  </button>
                )}

                {onNavigateToLive && (
                  <button
                    type="button"
                    onClick={onNavigateToLive}
                    className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <Radio className="h-3.5 w-3.5 text-cyan-400" />
                    <span>Open Live Stream Monitor</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Quick Demo Test Samples (Hackathon Evaluation) */}
          <div className="rounded-xl border border-white/10 bg-[#0F141B] p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <span className="text-[11px] font-mono tracking-wider text-slate-400">EVALUATION TEST SAMPLES</span>
                <p className="text-xs text-slate-400">
                  Instant real-model evaluation fixtures for verification and judging.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleLoadSample('genuine')}
                  className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-950/40 active:scale-95 transition-all"
                >
                  <Music className="h-3.5 w-3.5" />
                  <span>Load Genuine Sample</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleLoadSample('spoof')}
                  className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-950/40 active:scale-95 transition-all"
                >
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span>Load Spoof / Clone Sample</span>
                </button>
              </div>
            </div>
          </div>

          {/* Selected File Details & Waveform Preview */}
          {selectedFile && (
            <div className="rounded-xl border border-white/10 bg-[#11161D] p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    <FileAudio className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white truncate max-w-[280px] sm:max-w-md">
                      {selectedFile.name}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                      <span>{(selectedFile.size / 1024).toFixed(1)} KB</span>
                      <span>·</span>
                      <span>{fileDuration > 0 ? `${fileDuration.toFixed(1)}s` : 'Captured audio'}</span>
                      <span>·</span>
                      <span>16 kHz PCM</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Remove
                </button>
              </div>

              {/* Waveform Player */}
              <div>
                <span className="text-[11px] font-mono text-slate-400 mb-1.5 block">AUDIO PREVIEW</span>
                <WaveformPlayer
                  audioBlob={fileAudioBlob}
                  duration={fileDuration}
                />
              </div>
            </div>
          )}

          {/* Contextual Risk Selector */}
          <ContextSelector
            value={context}
            onChange={setContext}
            disabled={isAnalyzing}
          />

          {/* Error Banner */}
          {errorMsg && (
            <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-950/30 p-4 text-xs text-red-200">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Interactive Audio Preprocessing Pipeline */}
          {(selectedFile || isAnalyzing) && (
            <AudioPreprocessingPipeline
              currentStageIndex={isAnalyzing ? Math.min(9, processingStage * 2 - 1) : 0}
              isProcessing={isAnalyzing}
              uploadedFile={selectedFile}
              audioDuration={fileDuration}
            />
          )}

          {/* Primary CTA Button */}
          <div className="pt-2">
            <button
              type="button"
              disabled={!selectedFile || isAnalyzing}
              onClick={handleStartAnalysis}
              className={`flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold tracking-wide transition-all shadow-md ${
                !selectedFile || isAnalyzing
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5'
                  : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400 active:scale-[0.99] cursor-pointer shadow-[0_0_20px_rgba(6,182,212,0.3)]'
              }`}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Executing Pipeline...</span>
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4" />
                  <span>Analyze Voice</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
