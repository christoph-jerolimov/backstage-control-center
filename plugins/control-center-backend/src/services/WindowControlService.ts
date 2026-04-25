import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  coreServices,
  createServiceFactory,
  createServiceRef,
  LoggerService,
} from '@backstage/backend-plugin-api';
import { Expand } from '@backstage/types';

export type RunCmd = (
  file: string,
  args: readonly string[],
) => Promise<{ stdout: string; stderr: string }>;

const defaultRunCmd: RunCmd = (file, args) => {
  const exec = promisify(execFile);
  return exec(file, args as string[], { timeout: 2000 });
};

// Linux input event codes (linux/input-event-codes.h).
const KEY_LEFTMETA = 125;
const KEY_LEFT = 105;
const KEY_RIGHT = 106;

export class WindowControlService {
  readonly #logger: LoggerService;
  readonly #runCmd: RunCmd;

  static create(options: { logger: LoggerService; runCmd?: RunCmd }) {
    const service = new WindowControlService(
      options.logger,
      options.runCmd ?? defaultRunCmd,
    );
    service.#probe();
    return service;
  }

  private constructor(logger: LoggerService, runCmd: RunCmd) {
    this.#logger = logger;
    this.#runCmd = runCmd;
  }

  async #probe() {
    try {
      await this.#runCmd('ydotool', ['--help']);
    } catch (err) {
      this.#logger.warn(
        'ydotool --help failed at startup; window controls will not work. ' +
          'Install ydotool, start the ydotoold daemon (e.g. ' +
          '`systemctl --user start ydotoold`), and ensure the backend ' +
          'process can reach /dev/uinput (typically via the `input` group) ' +
          'and the ydotool socket (YDOTOOL_SOCKET).',
        { error: String(err) },
      );
    }
  }

  async #run(file: string, args: readonly string[]): Promise<void> {
    try {
      await this.#runCmd(file, args);
    } catch (err) {
      this.#logger.warn(`${file} ${args.join(' ')} failed`, {
        error: String(err),
      });
      throw new Error(`${file} command failed`);
    }
  }

  async #pressMetaPlus(key: number): Promise<void> {
    await this.#run('ydotool', [
      'key',
      `${KEY_LEFTMETA}:1`,
      `${key}:1`,
      `${key}:0`,
      `${KEY_LEFTMETA}:0`,
    ]);
  }

  async tileLeft(): Promise<void> {
    await this.#pressMetaPlus(KEY_LEFT);
  }

  async tileRight(): Promise<void> {
    await this.#pressMetaPlus(KEY_RIGHT);
  }
}

export const windowControlServiceRef = createServiceRef<
  Expand<WindowControlService>
>({
  id: 'control-center.window',
  defaultFactory: async service =>
    createServiceFactory({
      service,
      deps: {
        logger: coreServices.logger,
      },
      async factory(deps) {
        return WindowControlService.create(deps);
      },
    }),
});
