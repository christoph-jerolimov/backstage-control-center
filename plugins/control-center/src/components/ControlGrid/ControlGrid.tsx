import {
  fetchApiRef,
  toastApiRef,
  useApi,
} from '@backstage/frontend-plugin-api';
import { Button, Flex, Grid } from '@backstage/ui';
import {
  RiLayoutLeft2Fill,
  RiLayoutRight2Fill,
  RiPlayLargeFill,
  RiPauseLargeFill,
  RiMicAiLine,
  RiMicLine,
  RiMicOffLine,
  RiVolumeDownFill,
  RiVolumeMuteFill,
  RiVolumeUpFill,
} from '@remixicon/react';
import { useState } from 'react';

const Time = ({ label, time, timeZone }: { label: string, time: Date; timeZone?: string }) => {
  return (
    <Flex direction="column" align="center" gap="4" p="4">
      <div style={{ fontSize: '2em', fontWeight: 'bold' }}>{time.toLocaleTimeString('en-US', { timeStyle: 'short', timeZone })}</div>
      <div style={{ fontSize: '2em', fontWeight: 'bold' }}>{label}</div>
    </Flex>
  );
}

const MyButton = ({
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

export const ControlGrid = () => {
  const [time, setTime] = useState(new Date());
  // update time every 10 seconds
  setInterval(() => {
    setTime(new Date());
  }, 10000);

  return (
    <Flex direction="column" gap="4" py="4">
      <Grid.Root columns="8" gap="4">
        <Time label="Local" time={time} />
        <Time label="IST" time={time} timeZone="Asia/Kolkata" />
      </Grid.Root>
      <Grid.Root columns="8" gap="4">
        <MyButton icon={<RiVolumeMuteFill />} label="Volume Mute" path="/audio/volume-mute" />
        <MyButton icon={<RiVolumeDownFill />} label="Volume Down" path="/audio/volume-down" />
        <MyButton icon={<RiVolumeUpFill />} label="Volume Up" path="/audio/volume-up" />
        <MyButton icon={<RiPlayLargeFill />} label="Play" path="/media/play" />
        <MyButton icon={<RiPauseLargeFill />} label="Pause" path="/media/pause" />
        <MyButton icon={<RiMicLine />} label="Mic On" path="/audio/mic-on" />
        <MyButton icon={<RiMicOffLine />} label="Mic Off" path="/audio/mic-off" />
        <MyButton icon={<RiMicAiLine />} label="Mic AI" />
      </Grid.Root>
      <Grid.Root columns="8" gap="4">
        <MyButton icon={<RiLayoutLeft2Fill />} label="Tile Left" path="/window/tile-left" />
        <MyButton icon={<RiLayoutRight2Fill />} label="Tile Right" path="/window/tile-right" />
      </Grid.Root>
      <Grid.Root columns="8" gap="4">
        <MyButton icon={<div>👩🏻‍💻</div>} label="Status: Online" path="/slack/status/online" />
        <MyButton icon={<div>💬</div>} label="Status: Afk" path="/slack/status/afk" />
        <MyButton icon={<div>🎧</div>} label="Status: Focus" path="/slack/status/focus" />
        <MyButton icon={<div>🌯</div>} label="Status: Lunch" path="/slack/status/lunch" />
        <MyButton icon={<div>💬</div>} label="Status: Meeting" path="/slack/status/meeting" />
      </Grid.Root>
    </Flex>
  );
};
