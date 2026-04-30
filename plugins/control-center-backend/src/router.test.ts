import {
  mockCredentials,
  mockErrorHandler,
  mockServices,
} from '@backstage/backend-test-utils';
import express from 'express';
import request from 'supertest';

import { createRouter } from './router';
import { todoListServiceRef } from './services/TodoListService';
import { audioControlServiceRef } from './services/AudioControlService';
import { windowControlServiceRef } from './services/WindowControlService';
import { slackStatusServiceRef } from './services/SlackStatusService';
import { whisperServiceRef } from './services/WhisperService';
import { systemStatsServiceRef } from './services/SystemStatsService';
import { playlistServiceRef } from './services/PlaylistService';
import { obsServiceRef } from './services/OBSService';
import { hueServiceRef } from './services/HueService';
import { scriptsServiceRef } from './services/ScriptsService';

const mockTodoItem = {
  title: 'Do the thing',
  id: '123',
  createdBy: mockCredentials.user().principal.userEntityRef,
  createdAt: new Date().toISOString(),
};

// TEMPLATE NOTE:
// Testing the router directly allows you to write a unit test that mocks the provided options.
describe('createRouter', () => {
  let app: express.Express;
  let todoList: jest.Mocked<typeof todoListServiceRef.T>;
  let audioControl: jest.Mocked<typeof audioControlServiceRef.T>;
  let windowControl: jest.Mocked<typeof windowControlServiceRef.T>;
  let slackStatus: jest.Mocked<typeof slackStatusServiceRef.T>;
  let whisper: jest.Mocked<typeof whisperServiceRef.T>;
  let systemStats: jest.Mocked<typeof systemStatsServiceRef.T>;
  let playlist: jest.Mocked<typeof playlistServiceRef.T>;
  let obs: jest.Mocked<typeof obsServiceRef.T>;
  let hue: jest.Mocked<typeof hueServiceRef.T>;
  let scripts: jest.Mocked<typeof scriptsServiceRef.T>;

  beforeEach(async () => {
    todoList = {
      createTodo: jest.fn(),
      listTodos: jest.fn(),
      getTodo: jest.fn(),
    };
    audioControl = {
      volumeUp: jest.fn(),
      volumeDown: jest.fn(),
      toggleSinkMute: jest.fn(),
      micOn: jest.fn(),
      micOff: jest.fn(),
      play: jest.fn(),
      pause: jest.fn(),
      previous: jest.fn(),
      next: jest.fn(),
    };
    windowControl = {
      tileLeft: jest.fn(),
      tileRight: jest.fn(),
    };
    slackStatus = {
      setPreset: jest.fn(),
    };
    whisper = {
      transcribe: jest.fn(),
    };
    systemStats = {
      getStats: jest.fn(),
    };
    playlist = {
      list: jest.fn().mockReturnValue([]),
      play: jest.fn(),
    };
    obs = {
      listScenes: jest.fn().mockReturnValue([]),
      setScene: jest.fn(),
      toggleRecording: jest.fn(),
      toggleStreaming: jest.fn(),
      toggleVirtualCam: jest.fn(),
    };
    hue = {
      listScenes: jest.fn().mockReturnValue([]),
      activateScene: jest.fn(),
    };
    scripts = {
      list: jest.fn().mockReturnValue([]),
      run: jest.fn(),
    };
    const router = await createRouter({
      httpAuth: mockServices.httpAuth(),
      todoList,
      audioControl,
      windowControl,
      slackStatus,
      whisper,
      systemStats,
      playlist,
      obs,
      hue,
      scripts,
    });
    app = express();
    app.use(router);
    app.use(mockErrorHandler());
  });

  it('should create a TODO', async () => {
    todoList.createTodo.mockResolvedValue(mockTodoItem);

    const response = await request(app).post('/todos').send({
      title: 'Do the thing',
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(mockTodoItem);
  });

  it.each([['online'], ['afk'], ['focus'], ['lunch'], ['meeting']])(
    'should set the Slack %s status',
    async preset => {
      slackStatus.setPreset.mockResolvedValue();

      const response = await request(app).post(`/slack/status/${preset}`);

      expect(response.status).toBe(204);
      expect(slackStatus.setPreset).toHaveBeenCalledWith(preset);
    },
  );

  it('should return system stats', async () => {
    const stats = {
      cpu: { usagePercent: 12.5, cores: 8 },
      memory: {
        totalBytes: 16_000_000_000,
        usedBytes: 8_000_000_000,
        freeBytes: 8_000_000_000,
        usagePercent: 50,
      },
      timestamp: new Date().toISOString(),
    };
    systemStats.getStats.mockResolvedValue(stats);

    const response = await request(app).get('/system/stats');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(stats);
    expect(systemStats.getStats).toHaveBeenCalled();
  });

  it.each([
    ['recording', 'toggleRecording'],
    ['streaming', 'toggleStreaming'],
    ['virtualcam', 'toggleVirtualCam'],
  ] as const)('should toggle OBS %s', async (target, method) => {
    obs[method].mockResolvedValue();

    const response = await request(app).post(`/obs/${target}/toggle`);

    expect(response.status).toBe(204);
    expect(obs[method]).toHaveBeenCalled();
  });

  it('should activate an OBS scene by id', async () => {
    obs.setScene.mockResolvedValue();

    const response = await request(app).post('/obs/scenes/live');

    expect(response.status).toBe(204);
    expect(obs.setScene).toHaveBeenCalledWith('live');
  });

  it('should activate a Hue scene by id', async () => {
    hue.activateScene.mockResolvedValue();

    const response = await request(app).post('/hue/scenes/focus');

    expect(response.status).toBe(204);
    expect(hue.activateScene).toHaveBeenCalledWith('focus');
  });

  it('should run a script by id', async () => {
    scripts.run.mockResolvedValue();

    const response = await request(app).post('/scripts/deploy/run');

    expect(response.status).toBe(204);
    expect(scripts.run).toHaveBeenCalledWith('deploy');
  });

  it('should not allow unauthenticated requests to create a TODO', async () => {
    todoList.createTodo.mockResolvedValue(mockTodoItem);

    // TEMPLATE NOTE:
    // The HttpAuth mock service considers all requests to be authenticated as a
    // mock user by default. In order to test other cases we need to explicitly
    // pass an authorization header with mock credentials.
    const response = await request(app)
      .post('/todos')
      .set('Authorization', mockCredentials.none.header())
      .send({
        title: 'Do the thing',
      });

    expect(response.status).toBe(401);
  });
});
