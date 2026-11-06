import type { CSSProperties } from 'react';
import {
  formatScreenClock,
  dailyScreenFrame,
  screenDeviceStatus,
} from './daily-screens';
import type { DomDailyScreenVariant, LyricCue } from './composition';
import './daily-screens-dom.css';

export type DomScreenProps = {
  variant: DomDailyScreenVariant;
  cues: readonly LyricCue[];
  frame: number;
  capturedAtMs: number;
  deviceSeed?: number;
};

function entranceStyle(frame: number, startFrame: number): CSSProperties {
  const progress = Math.min(1, Math.max(0, (frame - startFrame + 1) / 5));
  return {
    ['--enter-y' as string]: `${(1 - progress) * 12}px`,
    ['--enter-opacity' as string]: String(0.4 + progress * 0.6),
  };
}

function DeviceChrome({
  capturedAtMs,
  frame,
  variant,
  deviceSeed,
  light = false,
}: {
  capturedAtMs: number;
  frame: number;
  variant: DomDailyScreenVariant;
  deviceSeed?: number;
  light?: boolean;
}) {
  const clock = formatScreenClock(capturedAtMs, frame);
  const status = screenDeviceStatus(capturedAtMs, deviceSeed, variant);
  return (
    <>
      {status.dynamicIsland ? <div className="mumoo-dom-island" aria-hidden="true" /> : null}
      <div className={`mumoo-dom-status ${light ? 'is-light' : ''}`}>
        <div className="mumoo-dom-status-time">{clock.time}</div>
        <div className="mumoo-dom-status-right">
          <div className="mumoo-dom-signal" aria-hidden="true">
            {[1, 2, 3, 4].map(bar => (
              <span key={bar} className={bar <= status.signalBars ? undefined : 'is-off'} />
            ))}
          </div>
          {status.network !== 'none' ? <div className="mumoo-dom-network">{status.network}</div> : null}
          <div className="mumoo-dom-battery" aria-hidden="true">
            <i style={{ width: `${status.batteryPercent}%` }} />
          </div>
        </div>
      </div>
    </>
  );
}

function Redact({ wide = false }: { wide?: boolean }) {
  return <span className={`mumoo-redact ${wide ? 'is-wide' : ''}`} aria-hidden="true" />;
}

function DatingScreen({ cues, frame, capturedAtMs, deviceSeed }: Omit<DomScreenProps, 'variant'>) {
  const lines = dailyScreenFrame(cues, frame).lines;
  const bumble = ((deviceSeed ?? 0) % 2) === 1;
  return (
    <div className={`mumoo-dom-screen mumoo-dating ${bumble ? 'is-bumble' : 'is-tinder'}`} data-variant="dating">
      <DeviceChrome capturedAtMs={capturedAtMs} frame={frame} variant="dating" deviceSeed={deviceSeed} light />
      <div className="mumoo-dating-card" aria-hidden="true">
        <div className="mumoo-dating-faces">
          <div className="mumoo-dom-avatar mumoo-dating-face" />
          <div className="mumoo-dating-heart">♥</div>
          <div className="mumoo-dom-avatar mumoo-dating-face is-warm" />
        </div>
        <h2>It&apos;s a match!</h2>
        <p className="mumoo-dating-sub">{bumble ? 'You both liked each other' : 'You and someone new liked each other'}</p>
        <div className="mumoo-dating-names"><Redact /><span>&amp;</span><Redact /></div>
      </div>
      <div className="mumoo-dating-sheet">
        <p className="mumoo-dating-prompt">Say something that stands out</p>
        <div className="mumoo-dating-messages">
          {lines.map(line => (
            <div key={`${line.startFrame}-${line.text}`} className="mumoo-dating-bubble" style={entranceStyle(frame, line.startFrame)}>
              {line.text}
            </div>
          ))}
        </div>
        <div className="mumoo-dating-composer">
          <span>Send a message</span>
          <em aria-hidden="true">→</em>
        </div>
      </div>
      <div className="mumoo-dom-home" aria-hidden="true" />
    </div>
  );
}

function RideScreen({ cues, frame, capturedAtMs, deviceSeed }: Omit<DomScreenProps, 'variant'>) {
  const lines = dailyScreenFrame(cues, frame).lines;
  const progress = Math.min(1, frame / 449);
  const eta = Math.max(1, Math.round(7 - progress * 5));
  const carX = 220 + progress * 560;
  const carY = 760 - progress * 380;
  return (
    <div className="mumoo-dom-screen mumoo-ride" data-variant="ride" style={{ ['--car-x' as string]: `${carX}px`, ['--car-y' as string]: `${carY}px` }}>
      <DeviceChrome capturedAtMs={capturedAtMs} frame={frame} variant="ride" deviceSeed={deviceSeed} light />
      <div className="mumoo-ride-map" aria-hidden="true">
        <div className="mumoo-ride-route" />
        <div className="mumoo-ride-pin">A</div>
        <div className="mumoo-ride-car">●</div>
      </div>
      <div className="mumoo-ride-sheet">
        <div className="mumoo-ride-handle" aria-hidden="true" />
        <h2>{eta} min away</h2>
        <p className="mumoo-ride-sub">Meet at the pin · Comfort</p>
        <div className="mumoo-ride-driver">
          <div className="mumoo-dom-avatar" aria-hidden="true" />
          <div>
            <Redact wide />
            <span>4.97 · 312 trips</span>
          </div>
          <div className="mumoo-ride-plate">
            <Redact />
            <strong>Black SUV</strong>
          </div>
        </div>
        <p className="mumoo-ride-message-label">Message</p>
        <div className="mumoo-ride-messages">
          {lines.map(line => (
            <div key={`${line.startFrame}-${line.text}`} className="mumoo-ride-note" style={entranceStyle(frame, line.startFrame)}>
              {line.text}
            </div>
          ))}
        </div>
        <div className="mumoo-ride-composer">Send a message…</div>
      </div>
      <div className="mumoo-dom-home is-light" aria-hidden="true" />
    </div>
  );
}

function FoodScreen({ cues, frame, capturedAtMs, deviceSeed }: Omit<DomScreenProps, 'variant'>) {
  const lines = dailyScreenFrame(cues, frame).lines;
  const progress = Math.min(1, frame / 449);
  const stage = progress < 0.25 ? 0 : progress < 0.55 ? 1 : progress < 0.82 ? 2 : 3;
  const steps = [
    { title: 'Order confirmed', detail: 'Kitchen has your order' },
    { title: 'Preparing', detail: 'Being plated now' },
    { title: 'On the way', detail: 'Courier left the restaurant' },
    { title: 'Nearby', detail: 'Almost at your door' },
  ];
  const eta = Math.max(2, Math.round(22 - progress * 18));
  return (
    <div className="mumoo-dom-screen mumoo-food" data-variant="food">
      <DeviceChrome capturedAtMs={capturedAtMs} frame={frame} variant="food" deviceSeed={deviceSeed} />
      <div className="mumoo-food-top">
        <div className="mumoo-food-card">
          <p className="eyebrow">Food delivery</p>
          <div className="mumoo-food-name"><Redact wide /></div>
          <p>Order · #4821</p>
          <div className="mumoo-food-eta">
            <span>Estimated arrival</span>
            <strong>{eta} min</strong>
          </div>
        </div>
      </div>
      <div className="mumoo-food-timeline">
        {steps.map((step, index) => (
          <div key={step.title} className={`mumoo-food-step ${index < stage ? 'is-done' : ''} ${index === stage ? 'is-active' : ''}`}>
            <div className="mumoo-food-rail">
              <div className="mumoo-food-dot" />
              {index < steps.length - 1 ? <div className="mumoo-food-line" /> : null}
            </div>
            <div>
              <h3>{step.title}</h3>
              <p>{step.detail}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mumoo-food-feed">
        {lines.map(line => (
          <div key={`${line.startFrame}-${line.text}`} className="mumoo-food-update" style={entranceStyle(frame, line.startFrame)}>
            <strong>Update</strong>
            {line.text}
          </div>
        ))}
      </div>
      <div className="mumoo-food-courier">
        <div className="mumoo-dom-avatar" aria-hidden="true" />
        <div>
          <div className="mumoo-food-courier-name"><Redact /></div>
          <span>Electric bike</span>
        </div>
        <em>On route</em>
      </div>
      <div className="mumoo-dom-home" aria-hidden="true" />
    </div>
  );
}

export function DomDailyScreen(props: DomScreenProps) {
  if (props.variant === 'dating') return <DatingScreen {...props} />;
  if (props.variant === 'ride') return <RideScreen {...props} />;
  return <FoodScreen {...props} />;
}
