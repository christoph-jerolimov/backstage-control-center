import { toastApiRef, useApi } from '@backstage/frontend-plugin-api';
import { Button, Flex } from '@backstage/ui';
import { useCallback, useRef } from 'react';
import { useVoiceTranscription } from './useVoiceTranscription';

export type MicAiMode = 'toggle' | 'hold' | 'vad';

interface MicAiButtonProps {
  mode: MicAiMode;
  icon: React.ReactElement;
  label: string;
}

function downloadTranscript(text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'text/plain;charset=utf-8' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `transcript-${new Date()
    .toISOString()
    .replace(/[:.]/g, '-')}.txt`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

async function copyTranscript(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard access may be blocked (e.g. permissions, insecure context);
    // we still surface the transcript via the toast and the file download,
    // so silently ignore.
  }
}

export const MicAiButton = ({ mode, icon, label }: MicAiButtonProps) => {
  const toastApi = useApi(toastApiRef);

  const onTranscript = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        toastApi.post({
          title: 'No speech detected',
          status: 'warning',
          timeout: 3000,
        });
        return;
      }
      void copyTranscript(trimmed);
      downloadTranscript(trimmed);
      toastApi.post({
        title: 'Transcript',
        description: trimmed,
        status: 'success',
        timeout: 6000,
      });
    },
    [toastApi],
  );

  const onError = useCallback(
    (error: Error) => {
      toastApi.post({
        title: 'Mic AI failed',
        description: error.message,
        status: 'danger',
        timeout: 4000,
      });
    },
    [toastApi],
  );

  const { state, start, stop } = useVoiceTranscription({
    onTranscript,
    onError,
  });

  const recording = state === 'recording';
  const visualLabel = recording
    ? mode === 'hold'
      ? `${label} (release)`
      : `${label} (stop)`
    : state === 'transcribing'
      ? `${label} …`
      : label;

  if (mode === 'hold') {
    return (
      <HoldButton
        label={visualLabel}
        icon={icon}
        recording={recording}
        busy={state === 'transcribing'}
        onStart={() => void start()}
        onStop={stop}
      />
    );
  }

  const handlePress = () => {
    if (recording) {
      stop();
    } else if (state === 'idle') {
      void start({ vad: mode === 'vad' });
    }
  };

  return (
    <Button
      aria-label={visualLabel}
      size="medium"
      style={{ height: 'auto' }}
      onPress={handlePress}
      loading={state === 'transcribing'}
    >
      <Flex direction="column" align="center" gap="4" p="4">
        {icon}
        {visualLabel}
      </Flex>
    </Button>
  );
};

interface HoldButtonProps {
  label: string;
  icon: React.ReactElement;
  recording: boolean;
  busy: boolean;
  onStart: () => void;
  onStop: () => void;
}

const HoldButton = ({
  label,
  icon,
  recording,
  busy,
  onStart,
  onStop,
}: HoldButtonProps) => {
  const activeRef = useRef(false);

  const handleDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (busy || activeRef.current) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    activeRef.current = true;
    onStart();
  };

  const handleUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!activeRef.current) {
      return;
    }
    activeRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onStop();
  };

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={recording}
      disabled={busy}
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      onContextMenu={event => event.preventDefault()}
      style={{
        all: 'unset',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        padding: 8,
        minHeight: 64,
        cursor: busy ? 'progress' : 'pointer',
        borderRadius: 6,
        border: '1px solid var(--bui-border, #ccc)',
        background: recording
          ? 'var(--bui-bg-pressed, rgba(255,0,0,0.15))'
          : 'var(--bui-bg, transparent)',
        textAlign: 'center',
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      {icon}
      {label}
    </button>
  );
};
