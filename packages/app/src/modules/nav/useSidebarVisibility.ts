import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const STORAGE_KEY = 'backstage.sidebar.visible';
const QUERY_KEY = 'sidebar';

const readStored = (): boolean => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
};

const writeStored = (visible: boolean) => {
  try {
    sessionStorage.setItem(STORAGE_KEY, String(visible));
  } catch {
    /* ignore quota / privacy errors */
  }
};

export const useSidebarVisibility = (): boolean => {
  const [searchParams] = useSearchParams();
  const [visible, setVisible] = useState<boolean>(readStored);

  useEffect(() => {
    const param = searchParams.get(QUERY_KEY);
    if (param === 'hidden') {
      setVisible(false);
      writeStored(false);
    } else if (param === 'visible') {
      setVisible(true);
      writeStored(true);
    }
  }, [searchParams]);

  return visible;
};
