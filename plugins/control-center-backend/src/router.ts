import { HttpAuthService } from '@backstage/backend-plugin-api';
import { InputError } from '@backstage/errors';
import { z } from 'zod/v3';
import express from 'express';
import Router from 'express-promise-router';
import { todoListServiceRef } from './services/TodoListService';
import { audioControlServiceRef } from './services/AudioControlService';
import { windowControlServiceRef } from './services/WindowControlService';
import { slackStatusServiceRef } from './services/SlackStatusService';
import { whisperServiceRef } from './services/WhisperService';
import { systemStatsServiceRef } from './services/SystemStatsService';
import { playlistServiceRef } from './services/PlaylistService';

const AUDIO_FILENAMES: Array<[string, string]> = [
  ['webm', 'audio.webm'],
  ['ogg', 'audio.ogg'],
  ['mp4', 'audio.mp4'],
  ['wav', 'audio.wav'],
];

function pickAudioFilename(mimeType: string): string {
  for (const [needle, name] of AUDIO_FILENAMES) {
    if (mimeType.includes(needle)) return name;
  }
  return 'audio.bin';
}

export async function createRouter({
  httpAuth,
  todoList,
  audioControl,
  windowControl,
  slackStatus,
  whisper,
  systemStats,
  playlist,
}: {
  httpAuth: HttpAuthService;
  todoList: typeof todoListServiceRef.T;
  audioControl: typeof audioControlServiceRef.T;
  windowControl: typeof windowControlServiceRef.T;
  slackStatus: typeof slackStatusServiceRef.T;
  whisper: typeof whisperServiceRef.T;
  systemStats: typeof systemStatsServiceRef.T;
  playlist: typeof playlistServiceRef.T;
}): Promise<express.Router> {
  const router = Router();
  router.use(express.json());

  router.post(
    '/ai/transcribe',
    express.raw({ type: 'audio/*', limit: '25mb' }),
    async (req, res) => {
      await httpAuth.credentials(req, { allow: ['user'] });
      const audio = req.body as Buffer;
      if (!Buffer.isBuffer(audio) || audio.length === 0) {
        throw new InputError(
          'Request body must be a non-empty audio/* payload',
        );
      }
      const mimeType =
        (req.headers['content-type'] as string | undefined) ?? 'audio/webm';
      const filename = pickAudioFilename(mimeType);
      const text = await whisper.transcribe(audio, filename, mimeType);
      res.json({ text });
    },
  );

  // TEMPLATE NOTE:
  // Zod is a powerful library for data validation and recommended in particular
  // for user-defined schemas. In this case we use it for input validation too.
  //
  // If you want to define a schema for your API we recommend using Backstage's
  // OpenAPI tooling: https://backstage.io/docs/next/openapi/01-getting-started
  const todoSchema = z.object({
    title: z.string(),
    entityRef: z.string().optional(),
  });

  router.post('/todos', async (req, res) => {
    const parsed = todoSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const result = await todoList.createTodo(parsed.data, {
      credentials: await httpAuth.credentials(req, { allow: ['user'] }),
    });

    res.status(201).json(result);
  });

  router.get('/todos', async (_req, res) => {
    res.json(await todoList.listTodos());
  });

  router.get('/todos/:id', async (req, res) => {
    res.json(await todoList.getTodo({ id: req.params.id }));
  });

  router.get('/system/stats', async (req, res) => {
    await httpAuth.credentials(req, { allow: ['user'] });
    res.json(await systemStats.getStats());
  });

  router.get('/playlists', async (req, res) => {
    await httpAuth.credentials(req, { allow: ['user'] });
    res.json(playlist.list());
  });

  router.post('/playlists/:id/play', async (req, res) => {
    await httpAuth.credentials(req, { allow: ['user'] });
    await playlist.play(req.params.id);
    res.status(204).end();
  });

  const commandActions: Record<string, () => Promise<void>> = {
    '/audio/volume-up': () => audioControl.volumeUp(),
    '/audio/volume-down': () => audioControl.volumeDown(),
    '/audio/volume-mute': () => audioControl.toggleSinkMute(),
    '/audio/mic-on': () => audioControl.micOn(),
    '/audio/mic-off': () => audioControl.micOff(),
    '/media/play': () => audioControl.play(),
    '/media/pause': () => audioControl.pause(),
    '/media/previous': () => audioControl.previous(),
    '/media/next': () => audioControl.next(),
    '/window/tile-left': () => windowControl.tileLeft(),
    '/window/tile-right': () => windowControl.tileRight(),
    '/slack/status/online': () => slackStatus.setPreset('online'),
    '/slack/status/afk': () => slackStatus.setPreset('afk'),
    '/slack/status/focus': () => slackStatus.setPreset('focus'),
    '/slack/status/lunch': () => slackStatus.setPreset('lunch'),
    '/slack/status/meeting': () => slackStatus.setPreset('meeting'),
  };

  for (const [path, run] of Object.entries(commandActions)) {
    router.post(path, async (req, res) => {
      await httpAuth.credentials(req, { allow: ['user'] });
      await run();
      res.status(204).end();
    });
  }

  return router;
}
