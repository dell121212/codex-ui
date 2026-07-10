import { useEffect } from 'react';
import { subscribe, useStore, unsubscribe } from './store/usageStore';
import Popover        from './components/Popover';
import './index.css';

export default function App() {
  const { fetchInitial } = useStore();

  useEffect(() => {
    subscribe();
    fetchInitial();
    return () => unsubscribe();
  }, [fetchInitial]);

  return <Popover />;
}
