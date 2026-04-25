import {
  createExtension,
  coreExtensionData,
  createExtensionInput,
} from '@backstage/frontend-plugin-api';
import { SidebarPage } from '@backstage/core-components';
import { ReactNode } from 'react';
import { useSidebarVisibility } from './useSidebarVisibility';

const Layout = ({ nav, content }: { nav: ReactNode; content: ReactNode }) => {
  const visible = useSidebarVisibility();
  if (!visible) return <>{content}</>;
  return (
    <SidebarPage>
      {nav}
      {content}
    </SidebarPage>
  );
};

export const AppLayout = createExtension({
  name: 'layout',
  attachTo: { id: 'app/root', input: 'children' },
  inputs: {
    nav: createExtensionInput([coreExtensionData.reactElement], {
      singleton: true,
    }),
    content: createExtensionInput([coreExtensionData.reactElement], {
      singleton: true,
    }),
  },
  output: [coreExtensionData.reactElement],
  factory: ({ inputs }) => [
    coreExtensionData.reactElement(
      <Layout
        nav={inputs.nav.get(coreExtensionData.reactElement)}
        content={inputs.content.get(coreExtensionData.reactElement)}
      />,
    ),
  ],
});
