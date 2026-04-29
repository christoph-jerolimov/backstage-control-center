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

export type PlaylistProvider = 'spotify' | 'qobuz';

export interface PlaylistEntry {
  id: string;
  label: string;
  icon?: string;
  provider: PlaylistProvider;
  uri: string;
}

export type RunCmd = (
  file: string,
  args: readonly string[],
) => Promise<{ stdout: string; stderr: string }>;

const defaultRunCmd: RunCmd = (file, args) => {
  const exec = promisify(execFile);
  return exec(file, args as string[], { timeout: 2000 });
};

const PROVIDER_PLAYERS: Record<PlaylistProvider, string> = {
  spotify: 'spotify',
  qobuz: 'qobuz',
};

const VALID_ID = /^[a-zA-Z0-9._-]+$/;

export class PlaylistService {
  readonly #logger: LoggerService;
  readonly #runCmd: RunCmd;
  readonly #entries: PlaylistEntry[];

  static create(options: {
    logger: LoggerService;
    config: RootConfigService;
    runCmd?: RunCmd;
  }) {
    const entries = PlaylistService.#loadEntries(
      options.config,
      options.logger,
    );
    const service = new PlaylistService(
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
  ): PlaylistEntry[] {
    const raw = config.getOptionalConfigArray('playlists') ?? [];
    const entries: PlaylistEntry[] = [];
    const seen = new Set<string>();
    for (const item of raw) {
      const id = item.getOptionalString('id');
      const label = item.getOptionalString('label');
      const provider = item.getOptionalString('provider');
      const uri = item.getOptionalString('uri');
      const icon = item.getOptionalString('icon');
      if (!id || !label || !provider || !uri) {
        logger.warn(
          'Skipping playlist entry: id, label, provider and uri are required.',
          { id, label, provider },
        );
        continue;
      }
      if (!VALID_ID.test(id)) {
        logger.warn(
          `Skipping playlist entry "${id}": id must match ${VALID_ID}.`,
        );
        continue;
      }
      if (provider !== 'spotify' && provider !== 'qobuz') {
        logger.warn(
          `Skipping playlist entry "${id}": provider must be 'spotify' or 'qobuz' (got "${provider}").`,
        );
        continue;
      }
      if (seen.has(id)) {
        logger.warn(`Skipping playlist entry with duplicate id "${id}".`);
        continue;
      }
      seen.add(id);
      entries.push({ id, label, icon, provider, uri });
    }
    return entries;
  }

  private constructor(
    logger: LoggerService,
    runCmd: RunCmd,
    entries: PlaylistEntry[],
  ) {
    this.#logger = logger;
    this.#runCmd = runCmd;
    this.#entries = entries;
  }

  #probe() {
    if (this.#entries.length === 0) {
      this.#logger.warn(
        'No playlists configured; the playlist buttons row will be hidden. ' +
          'Add a `playlists:` array to app-config.yaml to enable it.',
      );
    }
  }

  list(): PlaylistEntry[] {
    return this.#entries.map(entry => ({ ...entry }));
  }

  async play(id: string): Promise<void> {
    const entry = this.#entries.find(e => e.id === id);
    if (!entry) {
      throw new NotFoundError(`Unknown playlist "${id}"`);
    }
    const player = PROVIDER_PLAYERS[entry.provider];
    const args = ['--player', player, 'open', entry.uri];
    try {
      await this.#runCmd('playerctl', args);
    } catch (err) {
      this.#logger.warn(`playerctl ${args.join(' ')} failed`, {
        error: String(err),
      });
      throw new Error('playerctl command failed');
    }
    this.#logger.info('Switched playlist', {
      id: entry.id,
      provider: entry.provider,
    });
  }
}

export const playlistServiceRef = createServiceRef<Expand<PlaylistService>>({
  id: 'control-center.playlist',
  defaultFactory: async service =>
    createServiceFactory({
      service,
      deps: {
        logger: coreServices.logger,
        config: coreServices.rootConfig,
      },
      async factory(deps) {
        return PlaylistService.create(deps);
      },
    }),
});
