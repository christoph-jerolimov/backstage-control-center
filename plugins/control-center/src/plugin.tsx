import {
  createFrontendPlugin,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import { RiDashboardLine } from '@remixicon/react';

import { rootRouteRef } from './routes';

export const page = PageBlueprint.make({
  params: {
    title: 'Control Center',
    icon: <RiDashboardLine />,
    path: '/control-center',
    routeRef: rootRouteRef,
    loader: () =>
      import('./components/TodoPage').then(m => (
        <m.TodoPage />
      )),
  },
});

export const controlCenterPlugin = createFrontendPlugin({
  pluginId: 'control-center',
  extensions: [page],
  routes: {
    root: rootRouteRef,
  }
});
