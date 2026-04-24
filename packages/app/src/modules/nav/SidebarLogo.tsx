import {
  Link,
  sidebarConfig,
  useSidebarOpenState,
} from '@backstage/core-components';
import { LogoFull } from './LogoFull';
import { LogoIcon } from './LogoIcon';

export const SidebarLogo = () => {
  const { isOpen } = useSidebarOpenState();

  return (
    <div style={{ width: sidebarConfig.drawerWidthClosed, height: 3 * sidebarConfig.logoHeight, display: 'flex', flexFlow: 'row nowrap', alignItems: 'center', marginBottom: -14 }}>
      <Link to="/" underline="none" aria-label="Home" style={{ width: sidebarConfig.drawerWidthClosed, marginLeft: 24 }}>
        {isOpen ? <LogoFull /> : <LogoIcon />}
      </Link>
    </div>
  );
};
