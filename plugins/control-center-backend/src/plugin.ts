import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';
import { todoListServiceRef } from './services/TodoListService';
import { audioControlServiceRef } from './services/AudioControlService';
import { windowControlServiceRef } from './services/WindowControlService';
import { slackStatusServiceRef } from './services/SlackStatusService';
import { whisperServiceRef } from './services/WhisperService';
import { systemStatsServiceRef } from './services/SystemStatsService';

/**
 * controlCenterPlugin backend plugin
 *
 * @public
 */
export const controlCenterPlugin = createBackendPlugin({
  pluginId: 'control-center',
  register(env) {
    env.registerInit({
      deps: {
        httpAuth: coreServices.httpAuth,
        httpRouter: coreServices.httpRouter,
        todoList: todoListServiceRef,
        audioControl: audioControlServiceRef,
        windowControl: windowControlServiceRef,
        slackStatus: slackStatusServiceRef,
        whisper: whisperServiceRef,
        systemStats: systemStatsServiceRef,
      },
      async init({
        httpAuth,
        httpRouter,
        todoList,
        audioControl,
        windowControl,
        slackStatus,
        whisper,
        systemStats,
      }) {
        httpRouter.use(
          await createRouter({
            httpAuth,
            todoList,
            audioControl,
            windowControl,
            slackStatus,
            whisper,
            systemStats,
          }),
        );
      },
    });
  },
});
