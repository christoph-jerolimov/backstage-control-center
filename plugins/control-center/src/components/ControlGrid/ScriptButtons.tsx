import { fetchApiRef, useApi } from '@backstage/frontend-plugin-api';
import { Grid } from '@backstage/ui';
import { useEffect, useState } from 'react';
import { MyButton } from './MyButton';

export type ScriptEntry = {
  id: string;
  label: string;
  icon?: string;
};

export function useScripts(): ScriptEntry[] {
  const { fetch } = useApi(fetchApiRef);
  const [entries, setEntries] = useState<ScriptEntry[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch('plugin://control-center/scripts')
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

export const ScriptButtons = () => {
  const scripts = useScripts();
  if (scripts.length === 0) return null;
  return (
    <Grid.Root columns="8" gap="4">
      {scripts.map(s => (
        <MyButton
          key={s.id}
          icon={<div>{s.icon ?? '⚙️'}</div>}
          label={s.label}
          path={`/scripts/${s.id}/run`}
        />
      ))}
    </Grid.Root>
  );
};
