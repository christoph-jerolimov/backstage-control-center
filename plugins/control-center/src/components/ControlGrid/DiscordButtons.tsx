import { fetchApiRef, useApi } from '@backstage/frontend-plugin-api';
import { Grid } from '@backstage/ui';
import { useEffect, useState } from 'react';
import { MyButton } from './MyButton';

export type DiscordWebhookEntry = {
  id: string;
  label: string;
  icon?: string;
};

export function useDiscordWebhooks(): DiscordWebhookEntry[] {
  const { fetch } = useApi(fetchApiRef);
  const [entries, setEntries] = useState<DiscordWebhookEntry[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch('plugin://control-center/discord/webhooks')
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

export const DiscordButtons = () => {
  const webhooks = useDiscordWebhooks();
  if (webhooks.length === 0) return null;
  return (
    <Grid.Root columns="8" gap="4">
      {webhooks.map(w => (
        <MyButton
          key={w.id}
          icon={<div>{w.icon ?? '💬'}</div>}
          label={w.label}
          path={`/discord/webhooks/${w.id}/send`}
        />
      ))}
    </Grid.Root>
  );
};
