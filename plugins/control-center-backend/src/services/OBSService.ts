import { createHash } from 'node:crypto';
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

const OP_HELLO = 0;
const OP_IDENTIFY = 1;
const OP_IDENTIFIED = 2;
const OP_REQUEST = 6;
const OP_REQUEST_RESPONSE = 7;

const RPC_VERSION = 1;
const REQUEST_TIMEOUT_MS = 5000;

export interface OBSSceneEntry {
  id: string;
  label: string;
  icon?: string;
  scene: string;
}

interface ObsConfig {
  url: string;
  password?: string;
  scenes: OBSSceneEntry[];
}

type WebSocketLike = {
  readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  send(data: string): void;
  close(): void;
};

export type WebSocketFactory = (url: string) => WebSocketLike;

const defaultWebSocketFactory: WebSocketFactory = url => {
  const Ctor = (
    globalThis as { WebSocket?: new (url: string) => WebSocketLike }
  ).WebSocket;
  if (!Ctor) {
    throw new Error('Global WebSocket is not available (requires Node 22+).');
  }
  return new Ctor(url);
};

export class OBSService {
  readonly #logger: LoggerService;
  readonly #config: ObsConfig;
  readonly #wsFactory: WebSocketFactory;

  static create(options: {
    logger: LoggerService;
    config: RootConfigService;
    wsFactory?: WebSocketFactory;
  }) {
    const obsConfig = OBSService.#loadConfig(options.config, options.logger);
    const service = new OBSService(
      options.logger,
      obsConfig,
      options.wsFactory ?? defaultWebSocketFactory,
    );
    service.#probe();
    return service;
  }

  static #loadConfig(
    config: RootConfigService,
    logger: LoggerService,
  ): ObsConfig {
    const url = config.getOptionalString('obs.url') ?? 'ws://localhost:4455';
    const password = config.getOptionalString('obs.password') || undefined;
    const rawScenes = config.getOptionalConfigArray('obs.scenes') ?? [];
    const scenes: OBSSceneEntry[] = [];
    const seen = new Set<string>();
    for (const item of rawScenes) {
      const id = item.getOptionalString('id');
      const label = item.getOptionalString('label');
      const scene = item.getOptionalString('scene');
      const icon = item.getOptionalString('icon');
      if (!id || !label || !scene) {
        logger.warn(
          'Skipping OBS scene entry: id, label, and scene are required.',
          { id, label },
        );
        continue;
      }
      if (!VALID_ID.test(id)) {
        logger.warn(
          `Skipping OBS scene entry "${id}": id must match ${VALID_ID}.`,
        );
        continue;
      }
      if (seen.has(id)) {
        logger.warn(`Skipping OBS scene entry with duplicate id "${id}".`);
        continue;
      }
      seen.add(id);
      scenes.push({ id, label, icon, scene });
    }
    return { url, password, scenes };
  }

  private constructor(
    logger: LoggerService,
    config: ObsConfig,
    wsFactory: WebSocketFactory,
  ) {
    this.#logger = logger;
    this.#config = config;
    this.#wsFactory = wsFactory;
  }

  #probe() {
    if (!this.#config.password) {
      this.#logger.warn(
        'obs.password is not configured; OBS buttons will fail unless ' +
          'the obs-websocket server runs with authentication disabled. ' +
          'Set obs.password (e.g. via OBS_WEBSOCKET_PASSWORD).',
      );
    }
  }

  listScenes(): OBSSceneEntry[] {
    return this.#config.scenes.map(s => ({ ...s }));
  }

  async setScene(id: string): Promise<void> {
    const entry = this.#config.scenes.find(s => s.id === id);
    if (!entry) {
      throw new NotFoundError(`Unknown OBS scene "${id}"`);
    }
    await this.#request('SetCurrentProgramScene', { sceneName: entry.scene });
    this.#logger.info('Set OBS scene', { id: entry.id, scene: entry.scene });
  }

  async toggleRecording(): Promise<void> {
    await this.#request('ToggleRecord', {});
  }

  async toggleStreaming(): Promise<void> {
    await this.#request('ToggleStream', {});
  }

  async toggleVirtualCam(): Promise<void> {
    await this.#request('ToggleVirtualCam', {});
  }

  async #request(
    requestType: string,
    requestData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const ws = this.#wsFactory(this.#config.url);
    return await new Promise<Record<string, unknown>>((resolve, reject) => {
      const requestId = `req-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;
      const closeWs = () => {
        try {
          ws.close();
        } catch {
          // ignore
        }
      };
      const timer = setTimeout(() => {
        closeWs();
        reject(new Error(`OBS ${requestType} timed out`));
      }, REQUEST_TIMEOUT_MS);
      const cleanup = () => {
        clearTimeout(timer);
        closeWs();
      };
      ws.onerror = () => {
        cleanup();
        reject(new Error(`OBS WebSocket error talking to ${this.#config.url}`));
      };
      ws.onclose = () => {
        clearTimeout(timer);
      };
      ws.onmessage = ev => {
        let msg: { op: number; d: Record<string, unknown> };
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (msg.op === OP_HELLO) {
          const auth = msg.d.authentication as
            | { challenge: string; salt: string }
            | undefined;
          const identifyData: Record<string, unknown> = {
            rpcVersion: RPC_VERSION,
          };
          if (auth) {
            if (!this.#config.password) {
              cleanup();
              reject(
                new Error(
                  'OBS requested authentication but obs.password is unset',
                ),
              );
              return;
            }
            identifyData.authentication = OBSService.#authToken(
              this.#config.password,
              auth.salt,
              auth.challenge,
            );
          }
          ws.send(JSON.stringify({ op: OP_IDENTIFY, d: identifyData }));
        } else if (msg.op === OP_IDENTIFIED) {
          ws.send(
            JSON.stringify({
              op: OP_REQUEST,
              d: { requestType, requestId, requestData },
            }),
          );
        } else if (msg.op === OP_REQUEST_RESPONSE) {
          if (msg.d.requestId !== requestId) return;
          const status = msg.d.requestStatus as
            | { result: boolean; comment?: string; code?: number }
            | undefined;
          cleanup();
          if (status?.result) {
            resolve((msg.d.responseData as Record<string, unknown>) ?? {});
          } else {
            reject(
              new Error(
                `OBS ${requestType} failed: ${status?.comment ?? 'unknown'}`,
              ),
            );
          }
        }
      };
    });
  }

  static #authToken(password: string, salt: string, challenge: string): string {
    const secret = createHash('sha256')
      .update(password + salt)
      .digest('base64');
    return createHash('sha256')
      .update(secret + challenge)
      .digest('base64');
  }
}

export const obsServiceRef = createServiceRef<Expand<OBSService>>({
  id: 'control-center.obs',
  defaultFactory: async service =>
    createServiceFactory({
      service,
      deps: {
        logger: coreServices.logger,
        config: coreServices.rootConfig,
      },
      async factory(deps) {
        return OBSService.create(deps);
      },
    }),
});
