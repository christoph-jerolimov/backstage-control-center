import {
  coreServices,
  createServiceFactory,
  createServiceRef,
  LoggerService,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import { Expand } from '@backstage/types';

export type FetchLike = typeof globalThis.fetch;

const OPENAI_TRANSCRIPTIONS_URL =
  'https://api.openai.com/v1/audio/transcriptions';

const DEFAULT_MODEL = 'whisper-1';

export class WhisperService {
  readonly #logger: LoggerService;
  readonly #apiKey: string | undefined;
  readonly #model: string;
  readonly #language: string | undefined;
  readonly #fetch: FetchLike;

  static create(options: {
    logger: LoggerService;
    config: RootConfigService;
    fetch?: FetchLike;
  }) {
    const apiKey = options.config.getOptionalString('openai.apiKey');
    const model =
      options.config.getOptionalString('openai.transcriptionModel') ??
      DEFAULT_MODEL;
    const language = options.config.getOptionalString(
      'openai.transcriptionLanguage',
    );
    const service = new WhisperService(
      options.logger,
      apiKey,
      model,
      language,
      options.fetch ?? globalThis.fetch.bind(globalThis),
    );
    service.#probe();
    return service;
  }

  private constructor(
    logger: LoggerService,
    apiKey: string | undefined,
    model: string,
    language: string | undefined,
    fetchImpl: FetchLike,
  ) {
    this.#logger = logger;
    this.#apiKey = apiKey;
    this.#model = model;
    this.#language = language;
    this.#fetch = fetchImpl;
  }

  #probe() {
    if (!this.#apiKey) {
      this.#logger.warn(
        'openai.apiKey is not configured; the Mic AI buttons will not work. ' +
          'Create an OpenAI API key with access to audio transcriptions and ' +
          'set openai.apiKey (e.g. via the OPENAI_API_KEY env var).',
      );
    }
  }

  async transcribe(
    audio: Buffer,
    filename: string,
    mimeType: string,
  ): Promise<string> {
    if (!this.#apiKey) {
      throw new Error('openai.apiKey is not configured');
    }
    if (audio.length === 0) {
      throw new Error('Audio payload is empty');
    }

    const form = new FormData();
    form.append('file', new Blob([audio], { type: mimeType }), filename);
    form.append('model', this.#model);
    if (this.#language) {
      form.append('language', this.#language);
    }

    const response = await this.#fetch(OPENAI_TRANSCRIPTIONS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.#apiKey}` },
      body: form,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `OpenAI transcription failed: HTTP ${response.status}${
          detail ? ` ${detail}` : ''
        }`,
      );
    }

    const payload = (await response.json()) as { text?: unknown };
    if (typeof payload.text !== 'string') {
      throw new Error('OpenAI transcription response missing "text"');
    }
    this.#logger.info('Transcribed audio', {
      bytes: audio.length,
      mimeType,
      chars: payload.text.length,
    });
    return payload.text;
  }
}

export const whisperServiceRef = createServiceRef<Expand<WhisperService>>({
  id: 'control-center.whisper',
  defaultFactory: async service =>
    createServiceFactory({
      service,
      deps: {
        logger: coreServices.logger,
        config: coreServices.rootConfig,
      },
      async factory(deps) {
        return WhisperService.create(deps);
      },
    }),
});
