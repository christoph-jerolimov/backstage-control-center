import os from 'node:os';
import {
  coreServices,
  createServiceFactory,
  createServiceRef,
  LoggerService,
} from '@backstage/backend-plugin-api';
import { Expand } from '@backstage/types';

export type SystemStats = {
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

export type OsLike = {
  cpus: () => os.CpuInfo[];
  totalmem: () => number;
  freemem: () => number;
};

type CpuSample = { idle: number; total: number };

const sampleCpu = (osLike: OsLike): CpuSample => {
  let idle = 0;
  let total = 0;
  for (const cpu of osLike.cpus()) {
    idle += cpu.times.idle;
    total +=
      cpu.times.user +
      cpu.times.nice +
      cpu.times.sys +
      cpu.times.idle +
      cpu.times.irq;
  }
  return { idle, total };
};

export class SystemStatsService {
  readonly #logger: LoggerService;
  readonly #os: OsLike;
  #lastCpuSample: CpuSample | undefined;

  static create(options: { logger: LoggerService; osLike?: OsLike }) {
    return new SystemStatsService(options.logger, options.osLike ?? os);
  }

  private constructor(logger: LoggerService, osLike: OsLike) {
    this.#logger = logger;
    this.#os = osLike;
  }

  async getStats(): Promise<SystemStats> {
    const sample = sampleCpu(this.#os);
    let usagePercent: number | null = null;
    if (this.#lastCpuSample) {
      const idleDelta = sample.idle - this.#lastCpuSample.idle;
      const totalDelta = sample.total - this.#lastCpuSample.total;
      if (totalDelta > 0) {
        usagePercent = Math.max(
          0,
          Math.min(100, (1 - idleDelta / totalDelta) * 100),
        );
      }
    }
    this.#lastCpuSample = sample;

    const totalBytes = this.#os.totalmem();
    const freeBytes = this.#os.freemem();
    const usedBytes = totalBytes - freeBytes;
    const memUsagePercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

    this.#logger.debug('Reported system stats', {
      cpuUsagePercent: usagePercent ?? -1,
      memUsagePercent,
    });

    return {
      cpu: {
        usagePercent,
        cores: this.#os.cpus().length,
      },
      memory: {
        totalBytes,
        usedBytes,
        freeBytes,
        usagePercent: memUsagePercent,
      },
      timestamp: new Date().toISOString(),
    };
  }
}

export const systemStatsServiceRef = createServiceRef<
  Expand<SystemStatsService>
>({
  id: 'control-center.system-stats',
  defaultFactory: async service =>
    createServiceFactory({
      service,
      deps: {
        logger: coreServices.logger,
      },
      async factory(deps) {
        return SystemStatsService.create(deps);
      },
    }),
});
