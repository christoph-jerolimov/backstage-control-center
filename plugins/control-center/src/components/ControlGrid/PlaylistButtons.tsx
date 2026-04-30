import { fetchApiRef, useApi } from '@backstage/frontend-plugin-api';
import { Grid } from '@backstage/ui';
import { useEffect, useState } from 'react';
import { MyButton } from './MyButton';

export type PlaylistEntry = {
  id: string;
  label: string;
  icon?: string;
  provider: 'spotify' | 'qobuz';
  uri: string;
};

export function usePlaylists(): PlaylistEntry[] {
  const { fetch } = useApi(fetchApiRef);
  const [entries, setEntries] = useState<PlaylistEntry[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch('plugin://control-center/playlists')
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

export const PlaylistButtons = () => {
  const playlists = usePlaylists();
  if (playlists.length === 0) return null;
  return (
    <Grid.Root columns="8" gap="4">
      {playlists.map(p => (
        <MyButton
          key={p.id}
          icon={<div>{p.icon ?? '🎵'}</div>}
          label={p.label}
          path={`/playlists/${p.id}/play`}
        />
      ))}
    </Grid.Root>
  );
};
