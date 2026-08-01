import React      from 'react';
import ReactDOM   from 'react-dom/client';
import { TooltipProvider } from '@appica/ui-react/tooltip';
import { ReducedMotionProvider } from '@appica/ui-react/providers/reduced-motion-provider';
import { ThemeProvider } from '@appica/ui-react/providers/theme-provider';
import App        from './App';
import './index.css';
import './appica-theme.css';
import './reference-skin.css';
import { initNeutralinoBackend } from './services/neutralinoBackend';

initNeutralinoBackend();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider forcedTheme="light" enableSystem={false} enableColorScheme>
      <ReducedMotionProvider>
        <TooltipProvider delay={250}>
          <App />
        </TooltipProvider>
      </ReducedMotionProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
