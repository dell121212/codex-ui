import { useEffect } from 'react';
import { useStore, unsubscribe } from './store/usageStore';
import Popover        from './components/Popover';
import './index.css';

export default function App() {
  const { fetchInitial } = useStore();

  useEffect(() => {
    fetchInitial();
    return () => unsubscribe();
  }, [fetchInitial]);

  return <Popover />;
}
