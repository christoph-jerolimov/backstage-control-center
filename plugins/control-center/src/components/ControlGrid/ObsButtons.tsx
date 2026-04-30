import { fetchApiRef, useApi } from '@backstage/frontend-plugin-api';
import { Grid } from '@backstage/ui';
import { useEffect, useState } from 'react';
import { MyButton } from './MyButton';

export type ObsSceneEntry = {
  id: string;
  label: string;
  icon?: string;
  scene: string;
};

export function useObsScenes(): ObsSceneEntry[] {
  const { fetch } = useApi(fetchApiRef);
  const [entries, setEntries] = useState<ObsSceneEntry[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch('plugin://control-center/obs/scenes')
      .then(res => (res.ok ? res.json() : []))
      .then(data => {
        if (!cancelled && Array.isArray(data)) {
          setEntries(data);
        }
      })
      .catch(() => {
        // Silently ignore: empty list just hides the row.
      });
    return () => {
      cancelled = true;
    };
  }, [fetch]);
  return entries;
}

export const ObsButtons = () => {
  const scenes = useObsScenes();
  return (
    <>
      <Grid.Root columns="8" gap="4">
        <MyButton icon={<div>⏺️</div>} label="OBS Record" path="/obs/recording/toggle" />
        <MyButton icon={<div>📡</div>} label="OBS Stream" path="/obs/streaming/toggle" />
        <MyButton icon={<div>📷</div>} label="OBS Virtual Cam" path="/obs/virtualcam/toggle" />
      </Grid.Root>
      {scenes.length > 0 && (
        <Grid.Root columns="8" gap="4">
          {scenes.map(s => (
            <MyButton
              key={s.id}
              icon={<div>{s.icon ?? '🎬'}</div>}
              label={s.label}
              path={`/obs/scenes/${s.id}`}
            />
          ))}
        </Grid.Root>
      )}
    </>
  );
};
