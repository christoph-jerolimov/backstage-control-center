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
    };
    windowControl = {
      tileLeft: jest.fn(),
      tileRight: jest.fn(),
    };
    slackStatus = {
      setPreset: jest.fn(),
    };
    const router = await createRouter({
      httpAuth: mockServices.httpAuth(),
      todoList,
      audioControl,
      windowControl,
      slackStatus,
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

  it.each([
    ['online'],
    ['afk'],
    ['focus'],
    ['lunch'],
    ['meeting'],
  ])('should set the Slack %s status', async preset => {
    slackStatus.setPreset.mockResolvedValue();

    const response = await request(app).post(`/slack/status/${preset}`);

    expect(response.status).toBe(204);
    expect(slackStatus.setPreset).toHaveBeenCalledWith(preset);
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
