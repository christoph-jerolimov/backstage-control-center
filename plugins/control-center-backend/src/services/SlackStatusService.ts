import {
  coreServices,
  createServiceFactory,
  createServiceRef,
  LoggerService,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import { Expand } from '@backstage/types';

export type SlackPreset = 'online' | 'afk' | 'focus' | 'lunch' | 'meeting';

export interface SlackStatusProfile {
  status_text: string;
  status_emoji: string;
  status_expiration?: number;
}

const PRESETS: Record<SlackPreset, SlackStatusProfile> = {
  online: { status_text: '', status_emoji: '' },
  afk: { status_text: 'Away from keyboard', status_emoji: ':walking:' },
  focus: { status_text: 'Focusing', status_emoji: ':headphones:' },
  lunch: { status_text: 'Out for lunch', status_emoji: ':burrito:' },
  meeting: { status_text: 'In a meeting', status_emoji: ':spiral_calendar_pad:' },
};

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const SLACK_API = 'https://slack.com/api';

export class SlackStatusService {
  readonly #logger: LoggerService;
  readonly #token: string | undefined;
  readonly #fetch: FetchLike;

  static create(options: {
    logger: LoggerService;
    config: RootConfigService;
    fetch?: FetchLike;
  }) {
    const token = options.config.getOptionalString('slack.userToken');
    const service = new SlackStatusService(
      options.logger,
      token,
      options.fetch ?? (globalThis.fetch as unknown as FetchLike),
    );
    service.#probe();
    return service;
  }

  private constructor(
    logger: LoggerService,
    token: string | undefined,
    fetchImpl: FetchLike,
  ) {
    this.#logger = logger;
    this.#token = token;
    this.#fetch = fetchImpl;
  }

  async #probe() {
    if (!this.#token) {
      this.#logger.warn(
        'slack.userToken is not configured; Slack status buttons will not work. ' +
          'Create a Slack user token with the `users.profile:write` scope ' +
          '(plus `dnd:write` if you want Focus mode to also enable Do Not Disturb) ' +
          'and set slack.userToken (e.g. via the SLACK_USER_TOKEN env var).',
      );
      return;
    }
    try {
      await this.#call('auth.test', {});
    } catch (err) {
      this.#logger.warn(
        'Slack auth.test failed at startup; Slack status buttons will not work. ' +
          'Verify slack.userToken is a valid user token with users.profile:write.',
        { error: String(err) },
      );
    }
  }

  async #call(
    method: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!this.#token) {
      throw new Error('slack.userToken is not configured');
    }
    const response = await this.#fetch(`${SLACK_API}/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${this.#token}`,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Slack ${method} returned HTTP ${response.status}`);
    }
    const payload = (await response.json()) as Record<string, unknown>;
    if (payload.ok !== true) {
      throw new Error(
        `Slack ${method} failed: ${String(payload.error ?? 'unknown_error')}`,
      );
    }
    return payload;
  }

  async setPreset(preset: SlackPreset): Promise<void> {
    const profile = PRESETS[preset];
    await this.#call('users.profile.set', { profile });
    if (preset === 'focus') {
      try {
        await this.#call('dnd.setSnooze', { num_minutes: 60 });
      } catch (err) {
        this.#logger.warn('dnd.setSnooze failed (focus mode)', {
          error: String(err),
        });
      }
    } else if (preset === 'online') {
      try {
        await this.#call('dnd.endSnooze', {});
      } catch (err) {
        // dnd.endSnooze returns snooze_not_active when DND is already off,
        // which is the expected state when going back online.
        this.#logger.debug('dnd.endSnooze ignored', { error: String(err) });
      }
    }
    this.#logger.info('Set Slack status', { preset });
  }
}

export const slackStatusServiceRef = createServiceRef<
  Expand<SlackStatusService>
>({
  id: 'control-center.slack-status',
  defaultFactory: async service =>
    createServiceFactory({
      service,
      deps: {
        logger: coreServices.logger,
        config: coreServices.rootConfig,
      },
      async factory(deps) {
        return SlackStatusService.create(deps);
      },
    }),
});
