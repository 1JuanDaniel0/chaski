import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import { App } from './ui/App';
import './ui/styles.css';
import { registerShareWorker } from './app/share';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user" transition={{ type: 'spring', stiffness: 520, damping: 42, mass: 0.8 }}>
        <App />
      </MotionConfig>
    </LazyMotion>
  </StrictMode>,
);

registerShareWorker();
