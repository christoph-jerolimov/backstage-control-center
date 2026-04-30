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

export interface HueSceneEntry {
  id: string;
  label: string;
  icon?: string;
  group: string;
  scene: string;
}

interface HueConfig {
  bridge?: string;
  username?: string;
  scenes: HueSceneEntry[];
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export class HueService {
  readonly #logger: LoggerService;
  readonly #config: HueConfig;
  readonly #fetch: FetchLike;

  static create(options: {
    logger: LoggerService;
    config: RootConfigService;
    fetch?: FetchLike;
  }) {
    const hueConfig = HueService.#loadConfig(options.config, options.logger);
    const service = new HueService(
      options.logger,
      hueConfig,
      options.fetch ?? (globalThis.fetch as unknown as FetchLike),
    );
    service.#probe();
    return service;
  }

  static #loadConfig(
    config: RootConfigService,
    logger: LoggerService,
  ): HueConfig {
    const bridge = config.getOptionalString('hue.bridge') || undefined;
    const username = config.getOptionalString('hue.username') || undefined;
    const rawScenes = config.getOptionalConfigArray('hue.scenes') ?? [];
    const scenes: HueSceneEntry[] = [];
    const seen = new Set<string>();
    for (const item of rawScenes) {
      const id = item.getOptionalString('id');
      const label = item.getOptionalString('label');
      const group = item.getOptionalString('group');
      const scene = item.getOptionalString('scene');
      const icon = item.getOptionalString('icon');
      if (!id || !label || !group || !scene) {
        logger.warn(
          'Skipping Hue scene entry: id, label, group, and scene are required.',
          { id, label },
        );
        continue;
      }
      if (!VALID_ID.test(id)) {
        logger.warn(
          `Skipping Hue scene entry "${id}": id must match ${VALID_ID}.`,
        );
        continue;
      }
      if (seen.has(id)) {
        logger.warn(`Skipping Hue scene entry with duplicate id "${id}".`);
        continue;
      }
      seen.add(id);
      scenes.push({ id, label, icon, group, scene });
    }
    return { bridge, username, scenes };
  }

  private constructor(
    logger: LoggerService,
    config: HueConfig,
    fetchImpl: FetchLike,
  ) {
    this.#logger = logger;
    this.#config = config;
    this.#fetch = fetchImpl;
  }

  #probe() {
    if (!this.#config.bridge || !this.#config.username) {
      this.#logger.warn(
        'hue.bridge and/or hue.username are not configured; Hue buttons will not work. ' +
          'Set hue.bridge to the Hue Bridge IP and hue.username to a Bridge API user ' +
          '(see https://developers.meethue.com/develop/get-started-2/).',
      );
    }
  }

  listScenes(): HueSceneEntry[] {
    return this.#config.scenes.map(s => ({ ...s }));
  }

  async activateScene(id: string): Promise<void> {
    const entry = this.#config.scenes.find(s => s.id === id);
    if (!entry) {
      throw new NotFoundError(`Unknown Hue scene "${id}"`);
    }
    if (!this.#config.bridge || !this.#config.username) {
      throw new Error('Hue is not configured');
    }
    await this.#put(
      `/api/${encodeURIComponent(
        this.#config.username,
      )}/groups/${encodeURIComponent(entry.group)}/action`,
      { scene: entry.scene },
    );
    this.#logger.info('Activated Hue scene', {
      id: entry.id,
      group: entry.group,
      scene: entry.scene,
    });
  }

  async #put(path: string, body: Record<string, unknown>): Promise<void> {
    const url = `http://${this.#config.bridge}${path}`;
    const response = await this.#fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Hue ${path} returned HTTP ${response.status}`);
    }
    const text = await response.text();
    if (text.includes('"error"')) {
      throw new Error(`Hue ${path} returned an error: ${text}`);
    }
  }
}

export const hueServiceRef = createServiceRef<Expand<HueService>>({
  id: 'control-center.hue',
  defaultFactory: async service =>
    createServiceFactory({
      service,
      deps: {
        logger: coreServices.logger,
        config: coreServices.rootConfig,
      },
      async factory(deps) {
        return HueService.create(deps);
      },
    }),
});
