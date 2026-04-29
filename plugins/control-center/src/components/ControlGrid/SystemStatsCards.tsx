import { fetchApiRef, useApi } from '@backstage/frontend-plugin-api';
import { Flex, Grid } from '@backstage/ui';
import { useEffect, useRef, useState } from 'react';

const REFRESH_INTERVAL_MS = 10_000;

type SystemStats = {
  cpu: {
    usagePercent: number | null;
    cores: number;
  };
  memory: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usagePercent: number;
  };
  timestamp: string;
};

const StatCard = ({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) => (
  <Flex direction="column" align="center" gap="4" p="4">
    <div style={{ fontSize: '2em', fontWeight: 'bold' }}>{value}</div>
    <div style={{ fontSize: '1em', fontWeight: 'bold' }}>{label}</div>
    <div style={{ fontSize: '0.85em', opacity: 0.7 }}>{detail}</div>
  </Flex>
);

const formatGB = (bytes: number) => (bytes / 1024 ** 3).toFixed(1);

export const SystemStatsCards = () => {
  const { fetch } = useApi(fetchApiRef);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    const load = async () => {
      try {
        const response = await fetch('plugin://control-center/system/stats');
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        const data = (await response.json()) as SystemStats;
        if (!cancelledRef.current) {
          setStats(data);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('Failed to load system stats', err);
      }
    };

    load();
    const handle = setInterval(load, REFRESH_INTERVAL_MS);
    return () => {
      cancelledRef.current = true;
      clearInterval(handle);
    };
  }, [fetch]);

  const cpuValue =
    stats?.cpu.usagePercent != null
      ? `${stats.cpu.usagePercent.toFixed(1)}%`
      : '—';
  const cpuDetail = stats ? `${stats.cpu.cores} cores` : ' ';

  const memValue = stats ? `${stats.memory.usagePercent.toFixed(1)}%` : '—';
  const memDetail = stats
    ? `${formatGB(stats.memory.usedBytes)} / ${formatGB(
        stats.memory.totalBytes,
      )} GB`
    : ' ';

  return (
    <Grid.Root columns="8" gap="4">
      <StatCard label="CPU" value={cpuValue} detail={cpuDetail} />
      <StatCard label="Memory" value={memValue} detail={memDetail} />
    </Grid.Root>
  );
};
