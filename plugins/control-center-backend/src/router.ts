import { HttpAuthService } from '@backstage/backend-plugin-api';
import { InputError } from '@backstage/errors';
import { z } from 'zod/v3';
import express from 'express';
import Router from 'express-promise-router';
import { todoListServiceRef } from './services/TodoListService';
import { audioControlServiceRef } from './services/AudioControlService';

export async function createRouter({
  httpAuth,
  todoList,
  audioControl,
}: {
  httpAuth: HttpAuthService;
  todoList: typeof todoListServiceRef.T;
  audioControl: typeof audioControlServiceRef.T;
}): Promise<express.Router> {
  const router = Router();
  router.use(express.json());

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

  const audioActions: Record<string, () => Promise<void>> = {
    '/audio/volume-up': () => audioControl.volumeUp(),
    '/audio/volume-down': () => audioControl.volumeDown(),
    '/audio/volume-mute': () => audioControl.toggleSinkMute(),
    '/audio/mic-on': () => audioControl.micOn(),
    '/audio/mic-off': () => audioControl.micOff(),
    '/media/play': () => audioControl.play(),
    '/media/pause': () => audioControl.pause(),
  };

  for (const [path, run] of Object.entries(audioActions)) {
    router.post(path, async (req, res) => {
      await httpAuth.credentials(req, { allow: ['user'] });
      await run();
      res.status(204).end();
    });
  }

  return router;
}
