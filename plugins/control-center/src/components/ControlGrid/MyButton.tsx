import {
  fetchApiRef,
  toastApiRef,
  useApi,
} from '@backstage/frontend-plugin-api';
import { Button, Flex } from '@backstage/ui';
import { useState } from 'react';

export const MyButton = ({
  icon,
  label,
  path,
}: {
  icon: React.ReactElement;
  label: string;
  path?: string;
}) => {
  const toastApi = useApi(toastApiRef);
  const { fetch } = useApi(fetchApiRef);

  const [active, setActive] = useState(false);

  const handlePress = async () => {
    setActive(true);
    try {
      if (path) {
        const response = await fetch(`plugin://control-center${path}`, {
          method: 'POST',
        });
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
      } else {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      toastApi.post({
        title: 'Done!',
        status: 'success',
        timeout: 1000,
      });
    } catch (err) {
      toastApi.post({
        title: 'Failed',
        description: err instanceof Error ? err.message : String(err),
        status: 'danger',
        timeout: 3000,
      });
    } finally {
      setActive(false);
    }
  };

  return (
    <Button
      aria-label={label}
      size="medium"
      style={{ height: 'auto' }}
      onPress={handlePress}
      loading={active}
    >
      <Flex direction="column" align="center" gap="4" p="4">
        {icon}
        {label}
      </Flex>
    </Button>
  );
};
