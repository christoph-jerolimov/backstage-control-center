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

export class AudioControlService {
  readonly #logger: LoggerService;
  readonly #runCmd: RunCmd;

  static create(options: { logger: LoggerService; runCmd?: RunCmd }) {
    const service = new AudioControlService(
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
      await this.#runCmd('pactl', ['info']);
    } catch (err) {
      this.#logger.warn(
        'pactl info failed at startup; audio controls will not work. ' +
          'The backend must run inside a desktop session with ' +
          'DBUS_SESSION_BUS_ADDRESS and XDG_RUNTIME_DIR set.',
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

  async volumeUp(): Promise<void> {
    await this.#run('pactl', ['set-sink-volume', '@DEFAULT_SINK@', '+5%']);
  }

  async volumeDown(): Promise<void> {
    await this.#run('pactl', ['set-sink-volume', '@DEFAULT_SINK@', '-5%']);
  }

  async toggleSinkMute(): Promise<void> {
    await this.#run('pactl', ['set-sink-mute', '@DEFAULT_SINK@', 'toggle']);
  }

  async micOn(): Promise<void> {
    await this.#run('pactl', ['set-source-mute', '@DEFAULT_SOURCE@', '0']);
  }

  async micOff(): Promise<void> {
    await this.#run('pactl', ['set-source-mute', '@DEFAULT_SOURCE@', '1']);
  }

  async play(): Promise<void> {
    await this.#run('playerctl', ['play']);
  }

  async pause(): Promise<void> {
    await this.#run('playerctl', ['pause']);
  }

  async previous(): Promise<void> {
    await this.#run('playerctl', ['previous']);
  }

  async next(): Promise<void> {
    await this.#run('playerctl', ['next']);
  }
}

export const audioControlServiceRef = createServiceRef<
  Expand<AudioControlService>
>({
  id: 'control-center.audio',
  defaultFactory: async service =>
    createServiceFactory({
      service,
      deps: {
        logger: coreServices.logger,
      },
      async factory(deps) {
        return AudioControlService.create(deps);
      },
    }),
});
