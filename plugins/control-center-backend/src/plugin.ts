import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';
import { todoListServiceRef } from './services/TodoListService';
import { audioControlServiceRef } from './services/AudioControlService';
import { windowControlServiceRef } from './services/WindowControlService';

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
      },
      async init({ httpAuth, httpRouter, todoList, audioControl, windowControl }) {
        httpRouter.use(
          await createRouter({
            httpAuth,
            todoList,
            audioControl,
            windowControl,
          }),
        );
      },
    });
  },
});
