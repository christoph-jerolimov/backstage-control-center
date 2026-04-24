import { toastApiRef, useApi } from '@backstage/frontend-plugin-api';
import { Button, Flex, Grid } from '@backstage/ui';
import {
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

const MyButton = ({ icon, label }: { icon: React.ReactElement; label: string }) => {
  const toastApi = useApi(toastApiRef);

  const [active, setActive] = useState(false);

  const handlePress = () => {
    setActive(true);
    setTimeout(() => {
      setActive(false);
      toastApi.post({
        title: 'Done!',
        // description: 'Your changes have been saved successfully.',
        status: 'success',
        timeout: 1000,
        // links: [{ label: 'View entity', href: '/catalog/entity' }],
      });
    }, 200);
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
        <MyButton icon={<RiVolumeMuteFill />} label="Volume Mute" />
        <MyButton icon={<RiVolumeDownFill />} label="Volume Down" />
        <MyButton icon={<RiVolumeUpFill />} label="Volume Up" />
        <MyButton icon={<RiPlayLargeFill />} label="Play" />
        <MyButton icon={<RiPauseLargeFill />} label="Pause" />
        <MyButton icon={<RiMicLine />} label="Mic On" />
        <MyButton icon={<RiMicOffLine />} label="Mic Off" />
        <MyButton icon={<RiMicAiLine />} label="Mic AI" />
      </Grid.Root>
      <Grid.Root columns="8" gap="4">
        <MyButton icon={<div>👩🏻‍💻</div>} label="Status: Online" />
        <MyButton icon={<div>💬</div>} label="Status: Afk" />
        <MyButton icon={<div>🎧</div>} label="Status: Focus" />
        <MyButton icon={<div>🌯</div>} label="Status: Lunch" />
        <MyButton icon={<div>💬</div>} label="Status: Meeting" />
      </Grid.Root>
    </Flex>
  );
};
