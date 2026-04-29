import { Progress } from '@backstage/core-components';
import {
  useApi,
  fetchApiRef,
} from '@backstage/frontend-plugin-api';
import { Container } from '@backstage/ui';
import useAsync from 'react-use/esm/useAsync';
import { ControlGrid } from '../ControlGrid/ControlGrid';

function useTodos() {
  const { fetch } = useApi(fetchApiRef);

  return useAsync(async (): Promise<any[]> => {
    const response = await fetch(`plugin://control-center/todos`);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch todos: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    return data.items;
  }, [fetch]);
}

export const ControlCenterPage = () => {
  const { loading } = useTodos();

  if (loading) {
    return <Progress />;
  }

  return (
    <>
      {/* <Header title="Welcome to control-center!" /> */}
      <Container>
        <ControlGrid />
      </Container>
    </>
  );
};
