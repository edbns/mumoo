import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

/** Where the screen sits in the frame's 200 × 400 drawing. */
const SCREEN = { x: 14.08, y: 12.81, width: 171.98, height: 374.37, radius: 24.62 };

/**
 * An iPhone 16 Pro (the frame from 21st.dev, designali-in/iphone-16-pro) with anything on its screen: the frame is drawn over it,
 * and lets clicks through to it. Its width is set by `className`; the height follows.
 */
export function Iphone16Pro({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('relative aspect-[1/2]', className)}>
    <div className="absolute overflow-hidden bg-black" style={{
      left: `${(SCREEN.x / 200) * 100}%`, top: `${(SCREEN.y / 400) * 100}%`, width: `${(SCREEN.width / 200) * 100}%`, height: `${(SCREEN.height / 400) * 100}%`,
      borderRadius: `${(SCREEN.radius / SCREEN.width) * 100}% / ${(SCREEN.radius / SCREEN.height) * 100}%`,
    }}>{children}</div>
    <svg viewBox="0 0 200 400" fill="none" aria-hidden className="pointer-events-none absolute inset-0 size-full drop-shadow-[0_30px_60px_rgba(0,0,0,.6)]">
      <path fill="#303333" fillRule="evenodd" d="M196.11,128.09c0-.25-.2-.45-.45-.45-.11.04-.37.03-.69,0V36.69c0-17.840-14.46-32.31-32.31-32.31H37.48C19.63,4.39,5.17,18.85,5.17,36.69v48.99c-.3.02-.55.03-.66-.02-.25,0-.45.2-.45.45,0,0,0,17.29,0,17.29-.03.41.5.49,1.11.48v13.63c-.61,0-1.14.08-1.11.48,0,0,0,28.54,0,28.54-.03.42.5.49,1.11.48v7.950c-.61,0-1.140.08-1.110.48,0,0,0,28.54,0,28.54-.03.42.5.49,1.11.48v178.86c0,17.84,14.46,32.31,32.31,32.31h125.2c17.84,0,32.31-14.46,32.31-32.31v-188.87c.32-.02.58-.03.69.04,1.26.1.03-45.94.45-46.38ZM186.07,362.63c0,13.56-10.99,24.56-24.56,24.56H38.64c-13.56,0-24.56-10.99-24.56-24.56V37.37c0-13.56,10.99-24.56,24.56-24.56h122.87c13.56,0,24.56,10.99,24.56,24.56v325.26Z" />
      <path fill="#000" fillRule="evenodd" d="M161.38,7.29H38.78c-16.54,0-29.95,13.41-29.95,29.95v325.52c0,16.54,13.41,29.95,29.95,29.95h122.6c16.54,0,29.95-13.41,29.95-29.95V37.24c0-16.54-13.41-29.95-29.95-29.95ZM186.07,362.57c0,13.6-11.02,24.62-24.62,24.62H38.7c-13.6,0-24.62-11.02-24.62-24.62V37.43c0-13.6,11.02-24.62,24.62-24.62h122.75c13.6,0,24.62,11.02,24.62,24.62v325.14Z" />
      <path fill="#000" d="M119.61,33.86h-38.93c-10.48-.18-10.5-15.78,0-15.96,0,0,38.93,0,38.93,0,4.41,0,7.98,3.57,7.98,7.98,0,4.41-3.57,7.98-7.98,7.98Z" />
      <path fill="#080d4c" d="M118.78,29.21c-4.32.06-4.32-6.73,0-6.66,4.32-.06,4.32,6.73,0,6.66Z" />
    </svg>
  </div>;
}

/** The screen's width as a share of the phone's, to size what is shown on it. */
export const SCREEN_SHARE = SCREEN.width / 200;
/** The screen's height for each unit of its width. */
export const SCREEN_RATIO = SCREEN.height / SCREEN.width;
