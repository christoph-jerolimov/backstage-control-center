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

export interface DiscordWebhookEntry {
  id: string;
  label: string;
  icon?: string;
  url: string;
  content?: string;
  username?: string;
  avatarUrl?: string;
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export class DiscordService {
  readonly #logger: LoggerService;
  readonly #fetch: FetchLike;
  readonly #webhooks: DiscordWebhookEntry[];

  static create(options: {
    logger: LoggerService;
    config: RootConfigService;
    fetch?: FetchLike;
  }) {
    const webhooks = DiscordService.#loadWebhooks(
      options.config,
      options.logger,
    );
    const service = new DiscordService(
      options.logger,
      options.fetch ?? (globalThis.fetch as unknown as FetchLike),
      webhooks,
    );
    service.#probe();
    return service;
  }

  static #loadWebhooks(
    config: RootConfigService,
    logger: LoggerService,
  ): DiscordWebhookEntry[] {
    const raw = config.getOptionalConfigArray('discord.webhooks') ?? [];
    const entries: DiscordWebhookEntry[] = [];
    const seen = new Set<string>();
    for (const item of raw) {
      const id = item.getOptionalString('id');
      const label = item.getOptionalString('label');
      const url = item.getOptionalString('url');
      const icon = item.getOptionalString('icon');
      const content = item.getOptionalString('content');
      const username = item.getOptionalString('username');
      const avatarUrl = item.getOptionalString('avatarUrl');
      if (!id || !label || !url) {
        logger.warn(
          'Skipping Discord webhook entry: id, label, and url are required.',
          { id, label },
        );
        continue;
      }
      if (!VALID_ID.test(id)) {
        logger.warn(
          `Skipping Discord webhook entry "${id}": id must match ${VALID_ID}.`,
        );
        continue;
      }
      if (!url.startsWith('https://discord.com/api/webhooks/') &&
          !url.startsWith('https://discordapp.com/api/webhooks/')) {
        logger.warn(
          `Skipping Discord webhook entry "${id}": url must be a discord.com webhook URL.`,
        );
        continue;
      }
      if (seen.has(id)) {
        logger.warn(`Skipping Discord webhook entry with duplicate id "${id}".`);
        continue;
      }
      seen.add(id);
      entries.push({ id, label, icon, url, content, username, avatarUrl });
    }
    return entries;
  }

  private constructor(
    logger: LoggerService,
    fetchImpl: FetchLike,
    webhooks: DiscordWebhookEntry[],
  ) {
    this.#logger = logger;
    this.#fetch = fetchImpl;
    this.#webhooks = webhooks;
  }

  #probe() {
    if (this.#webhooks.length === 0) {
      this.#logger.warn(
        'No Discord webhooks configured; the Discord button row will be hidden. ' +
          'Add a `discord.webhooks` array to app-config.yaml to enable it.',
      );
    }
  }

  listWebhooks(): Array<Pick<DiscordWebhookEntry, 'id' | 'label' | 'icon'>> {
    return this.#webhooks.map(({ id, label, icon }) => ({ id, label, icon }));
  }

  async sendWebhook(id: string): Promise<void> {
    const entry = this.#webhooks.find(w => w.id === id);
    if (!entry) {
      throw new NotFoundError(`Unknown Discord webhook "${id}"`);
    }
    const body: Record<string, unknown> = {
      content: entry.content ?? entry.label,
    };
    if (entry.username) body.username = entry.username;
    if (entry.avatarUrl) body.avatar_url = entry.avatarUrl;

    const response = await this.#fetch(entry.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `Discord webhook "${entry.id}" returned HTTP ${response.status}: ${text}`,
      );
    }
    this.#logger.info('Sent Discord webhook', { id: entry.id });
  }
}

export const discordServiceRef = createServiceRef<Expand<DiscordService>>({
  id: 'control-center.discord',
  defaultFactory: async service =>
    createServiceFactory({
      service,
      deps: {
        logger: coreServices.logger,
        config: coreServices.rootConfig,
      },
      async factory(deps) {
        return DiscordService.create(deps);
      },
    }),
});
