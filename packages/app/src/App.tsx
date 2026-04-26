import { createApp } from '@backstage/frontend-defaults';
import {
  ApiBlueprint,
  createFrontendModule,
  fetchApiRef,
  googleAuthApiRef,
} from '@backstage/frontend-plugin-api';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import {
  GCalendarApiClient,
  gcalendarApiRef,
} from '@backstage-community/plugin-gcalendar';
import { navModule } from './modules/nav';

const gcalendarApi = ApiBlueprint.make({
  name: 'gcalendar',
  params: defineParams =>
    defineParams({
      api: gcalendarApiRef,
      deps: { authApi: googleAuthApiRef, fetchApi: fetchApiRef },
      factory: ({ authApi, fetchApi }) =>
        new GCalendarApiClient({ authApi, fetchApi }),
    }),
});

const gcalendarModule = createFrontendModule({
  pluginId: 'app',
  extensions: [gcalendarApi],
});

export default createApp({
  features: [catalogPlugin, navModule, gcalendarModule],
});
