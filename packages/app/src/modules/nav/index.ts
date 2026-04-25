import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { SidebarContent } from './Sidebar';
import { AppLayout } from './AppLayout';

export const navModule = createFrontendModule({
  pluginId: 'app',
  extensions: [SidebarContent, AppLayout],
});
