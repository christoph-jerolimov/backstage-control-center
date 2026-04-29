import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  coreServices,
  createServiceFactory,
  createServiceRef,
  LoggerService,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import { NotFoundError } from '@backstage/errors';
import { Expand } from '@backstage/types';

const VALID_ID = /^[a-zA-Z0-9._-]+$/;
const DEFAULT_TIMEOUT_MS = 5000;

export interface ScriptEntry {
  id: string;
  label: string;
  icon?: string;
  command: string;
  args: string[];
  timeoutMs: number;
}

export type RunCmd = (
  file: string,
  args: readonly string[],
  options: { timeout: number },
) => Promise<{ stdout: string; stderr: string }>;

const defaultRunCmd: RunCmd = (file, args, options) => {
  const exec = promisify(execFile);
  return exec(file, args as string[], { timeout: options.timeout });
};

export class ScriptsService {
  readonly #logger: LoggerService;
  readonly #runCmd: RunCmd;
  readonly #entries: ScriptEntry[];

  static create(options: {
    logger: LoggerService;
    config: RootConfigService;
    runCmd?: RunCmd;
  }) {
    const entries = ScriptsService.#loadEntries(
      options.config,
      options.logger,
    );
    const service = new ScriptsService(
      options.logger,
      options.runCmd ?? defaultRunCmd,
      entries,
    );
    service.#probe();
    return service;
  }

  static #loadEntries(
    config: RootConfigService,
    logger: LoggerService,
  ): ScriptEntry[] {
    const raw = config.getOptionalConfigArray('scripts') ?? [];
    const entries: ScriptEntry[] = [];
    const seen = new Set<string>();
    for (const item of raw) {
      const id = item.getOptionalString('id');
      const label = item.getOptionalString('label');
      const command = item.getOptionalString('command');
      const icon = item.getOptionalString('icon');
      const args =
        item.getOptionalStringArray('args')?.map(String) ?? [];
      const timeoutMs =
        item.getOptionalNumber('timeoutMs') ?? DEFAULT_TIMEOUT_MS;
      if (!id || !label || !command) {
        logger.warn(
          'Skipping script entry: id, label, and command are required.',
          { id, label },
        );
        continue;
      }
      if (!VALID_ID.test(id)) {
        logger.warn(
          `Skipping script entry "${id}": id must match ${VALID_ID}.`,
        );
        continue;
      }
      if (seen.has(id)) {
        logger.warn(`Skipping script entry with duplicate id "${id}".`);
        continue;
      }
      seen.add(id);
      entries.push({ id, label, icon, command, args, timeoutMs });
    }
    return entries;
  }

  private constructor(
    logger: LoggerService,
    runCmd: RunCmd,
    entries: ScriptEntry[],
  ) {
    this.#logger = logger;
    this.#runCmd = runCmd;
    this.#entries = entries;
  }

  #probe() {
    if (this.#entries.length === 0) {
      this.#logger.warn(
        'No scripts configured; the script buttons row will be hidden. ' +
          'Add a `scripts:` array to app-config.yaml to enable it.',
      );
    }
  }

  list(): Array<Pick<ScriptEntry, 'id' | 'label' | 'icon'>> {
    return this.#entries.map(({ id, label, icon }) => ({ id, label, icon }));
  }

  async run(id: string): Promise<void> {
    const entry = this.#entries.find(e => e.id === id);
    if (!entry) {
      throw new NotFoundError(`Unknown script "${id}"`);
    }
    try {
      await this.#runCmd(entry.command, entry.args, {
        timeout: entry.timeoutMs,
      });
    } catch (err) {
      this.#logger.warn(
        `script "${entry.id}" (${entry.command} ${entry.args.join(' ')}) failed`,
        { error: String(err) },
      );
      throw new Error(`script "${entry.id}" failed`);
    }
    this.#logger.info('Ran script', { id: entry.id });
  }
}

export const scriptsServiceRef = createServiceRef<Expand<ScriptsService>>({
  id: 'control-center.scripts',
  defaultFactory: async service =>
    createServiceFactory({
      service,
      deps: {
        logger: coreServices.logger,
        config: coreServices.rootConfig,
      },
      async factory(deps) {
        return ScriptsService.create(deps);
      },
    }),
});
