import { fetchApiRef, useApi } from '@backstage/frontend-plugin-api';
import { Grid } from '@backstage/ui';
import { useEffect, useState } from 'react';
import { MyButton } from './MyButton';

export type HueSceneEntry = {
  id: string;
  label: string;
  icon?: string;
  group: string;
  scene: string;
};

export function useHueScenes(): HueSceneEntry[] {
  const { fetch } = useApi(fetchApiRef);
  const [entries, setEntries] = useState<HueSceneEntry[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch('plugin://control-center/hue/scenes')
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

export const HueButtons = () => {
  const scenes = useHueScenes();
  if (scenes.length === 0) return null;
  return (
    <Grid.Root columns="8" gap="4">
      {scenes.map(s => (
        <MyButton
          key={s.id}
          icon={<div>{s.icon ?? '💡'}</div>}
          label={s.label}
          path={`/hue/scenes/${s.id}`}
        />
      ))}
    </Grid.Root>
  );
};
