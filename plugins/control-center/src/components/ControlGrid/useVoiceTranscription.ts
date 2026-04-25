import { fetchApiRef, useApi } from '@backstage/frontend-plugin-api';
import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderState = 'idle' | 'recording' | 'transcribing';

export interface StartOptions {
  vad?: boolean;
}

export interface UseVoiceTranscriptionOptions {
  onTranscript: (text: string) => void;
  onError: (error: Error) => void;
}

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

const VAD_SILENCE_MS = 1500;
const VAD_MIN_SPEECH_MS = 500;
const VAD_SILENCE_RMS = 0.01;
const VAD_SPEECH_RMS = 0.04;
const MAX_RECORDING_MS = 60_000;

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') {
    return '';
  }
  for (const type of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

export function useVoiceTranscription({
  onTranscript,
  onError,
}: UseVoiceTranscriptionOptions) {
  const { fetch } = useApi(fetchApiRef);

  const [state, setState] = useState<RecorderState>('idle');

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const vadFrameRef = useRef<number | null>(null);
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const stopRequestedRef = useRef(false);

  const cleanupCapture = useCallback(() => {
    if (vadFrameRef.current !== null) {
      cancelAnimationFrame(vadFrameRef.current);
      vadFrameRef.current = null;
    }
    if (maxDurationTimerRef.current !== null) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    recorderRef.current = null;
  }, []);

  useEffect(() => {
    return () => cleanupCapture();
  }, [cleanupCapture]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || stopRequestedRef.current) {
      return;
    }
    stopRequestedRef.current = true;
    if (recorder.state !== 'inactive') {
      recorder.stop();
    }
  }, []);

  const startVad = useCallback(
    (stream: MediaStream) => {
      const AudioCtx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) {
        return;
      }
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const buffer = new Float32Array(analyser.fftSize);

      const startedAt = performance.now();
      let firstSpeechAt: number | null = null;
      let lastSpeechAt: number | null = null;

      const tick = () => {
        if (!recorderRef.current) {
          return;
        }
        analyser.getFloatTimeDomainData(buffer);
        let sumSquares = 0;
        for (let i = 0; i < buffer.length; i++) {
          sumSquares += buffer[i] * buffer[i];
        }
        const rms = Math.sqrt(sumSquares / buffer.length);
        const now = performance.now();

        if (rms > VAD_SPEECH_RMS) {
          if (firstSpeechAt === null) {
            firstSpeechAt = now;
          }
          lastSpeechAt = now;
        }

        const spokeLongEnough =
          firstSpeechAt !== null && now - firstSpeechAt >= VAD_MIN_SPEECH_MS;
        const silentLongEnough =
          lastSpeechAt !== null &&
          rms < VAD_SILENCE_RMS &&
          now - lastSpeechAt >= VAD_SILENCE_MS;

        if (spokeLongEnough && silentLongEnough) {
          stop();
          return;
        }
        if (now - startedAt >= MAX_RECORDING_MS) {
          stop();
          return;
        }

        vadFrameRef.current = requestAnimationFrame(tick);
      };
      vadFrameRef.current = requestAnimationFrame(tick);
    },
    [stop],
  );

  const upload = useCallback(
    async (blob: Blob) => {
      const response = await fetch(
        'plugin://control-center/ai/transcribe',
        {
          method: 'POST',
          headers: { 'Content-Type': blob.type || 'audio/webm' },
          body: blob,
        },
      );
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(
          `${response.status} ${response.statusText}${
            detail ? `: ${detail}` : ''
          }`,
        );
      }
      const payload = (await response.json()) as { text?: unknown };
      if (typeof payload.text !== 'string') {
        throw new Error('Backend response missing "text"');
      }
      return payload.text;
    },
    [fetch],
  );

  const start = useCallback(
    async (options: StartOptions = {}) => {
      if (state !== 'idle') {
        return;
      }
      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === 'undefined'
      ) {
        onError(new Error('Audio recording is not supported in this browser'));
        return;
      }

      stopRequestedRef.current = false;
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        onError(
          err instanceof Error
            ? err
            : new Error('Could not access the microphone'),
        );
        return;
      }
      streamRef.current = stream;

      const mimeType = pickMimeType();
      let recorder: MediaRecorder;
      try {
        recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);
      } catch (err) {
        cleanupCapture();
        onError(
          err instanceof Error ? err : new Error('Could not start recording'),
        );
        return;
      }
      recorderRef.current = recorder;

      const chunks: Blob[] = [];
      recorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const recordedType = recorder.mimeType || mimeType || 'audio/webm';
        cleanupCapture();
        if (chunks.length === 0) {
          setState('idle');
          onError(new Error('No audio was recorded'));
          return;
        }
        const blob = new Blob(chunks, { type: recordedType });
        setState('transcribing');
        try {
          const text = await upload(blob);
          onTranscript(text);
        } catch (err) {
          onError(
            err instanceof Error ? err : new Error('Transcription failed'),
          );
        } finally {
          setState('idle');
        }
      };

      recorder.onerror = event => {
        const err = (event as unknown as { error?: Error }).error;
        cleanupCapture();
        setState('idle');
        onError(err ?? new Error('MediaRecorder error'));
      };

      maxDurationTimerRef.current = setTimeout(stop, MAX_RECORDING_MS);
      recorder.start();
      setState('recording');

      if (options.vad) {
        startVad(stream);
      }
    },
    [state, cleanupCapture, onError, onTranscript, startVad, stop, upload],
  );

  return { state, start, stop };
}
