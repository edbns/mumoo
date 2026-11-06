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
    ['--enter-opacity' as string]: String(0.35 + progress * 0.65),
  };
}

function DeviceChrome({
  capturedAtMs,
  frame,
  variant,
  deviceSeed,
  withIsland = true,
}: {
  capturedAtMs: number;
  frame: number;
  variant: DomDailyScreenVariant;
  deviceSeed?: number;
  withIsland?: boolean;
}) {
  const clock = formatScreenClock(capturedAtMs, frame);
  const status = screenDeviceStatus(capturedAtMs, deviceSeed, variant);
  return (
    <>
      {withIsland && status.dynamicIsland ? <div className="mumoo-dom-island" aria-hidden="true" /> : null}
      <div className="mumoo-dom-status">
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

function DatingScreen({ cues, frame, capturedAtMs, deviceSeed }: Omit<DomScreenProps, 'variant'>) {
  const lines = dailyScreenFrame(cues, frame).lines;
  return (
    <div className="mumoo-dom-screen mumoo-dating" data-variant="dating">
      <DeviceChrome capturedAtMs={capturedAtMs} frame={frame} variant="dating" deviceSeed={deviceSeed} />
      <div className="mumoo-dating-header">
        <div className="mumoo-dating-back" aria-hidden="true">‹</div>
        <div className="mumoo-dating-person">
          <div className="mumoo-dating-avatar" aria-hidden="true" />
          <div className="mumoo-dating-name" aria-hidden="true" />
        </div>
        <div className="mumoo-dating-badge">New match</div>
        <div className="mumoo-dating-menu" aria-hidden="true">···</div>
      </div>
      <div className="mumoo-dating-body">
        <div className="mumoo-dating-match">
          <div className="mumoo-dom-avatar" aria-hidden="true" />
          <p>You matched</p>
        </div>
        <div className="mumoo-dating-messages">
          {lines.map(line => (
            <div key={`${line.startFrame}-${line.text}`} className="mumoo-dating-bubble" style={entranceStyle(frame, line.startFrame)}>
              {line.text}
            </div>
          ))}
        </div>
      </div>
      <div className="mumoo-dating-composer">
        <div className="mumoo-dating-input">
          <span>Message…</span>
          <div className="mumoo-dating-tools" aria-hidden="true"><span>☺</span><span>▢</span></div>
        </div>
      </div>
      <div className="mumoo-dom-home" aria-hidden="true" />
    </div>
  );
}

function RideScreen({ cues, frame, capturedAtMs, deviceSeed }: Omit<DomScreenProps, 'variant'>) {
  const lines = dailyScreenFrame(cues, frame).lines;
  const progress = Math.min(1, frame / 449);
  const stage = progress < 0.28 ? 0 : progress < 0.62 ? 1 : 2;
  const eta = Math.max(1, Math.round(8 - progress * 6));
  const carX = 250 + progress * 420;
  const carY = 700 - progress * 320;
  const labels = ['Finding trip', 'Driver en route', 'Arriving soon'] as const;
  return (
    <div className="mumoo-dom-screen mumoo-ride" data-variant="ride" style={{ ['--car-x' as string]: `${carX}px`, ['--car-y' as string]: `${carY}px` }}>
      <DeviceChrome capturedAtMs={capturedAtMs} frame={frame} variant="ride" deviceSeed={deviceSeed} />
      <div className="mumoo-ride-map" aria-hidden="true">
        <div className="mumoo-ride-route" />
        <div className="mumoo-ride-pin">A</div>
        <div className="mumoo-ride-car">●</div>
      </div>
      <div className="mumoo-ride-header">
        <div>
          <strong>{labels[stage]}</strong>
          <span>Fictional trip · Downtown studio</span>
        </div>
        <div className="mumoo-ride-eta">{eta} min</div>
      </div>
      <div className="mumoo-ride-sheet">
        <h2>Your ride</h2>
        <p className="mumoo-ride-sub">Pickup · Corner of Pine & 3rd</p>
        <div className="mumoo-ride-progress" aria-hidden="true">
          {[0, 1, 2].map(step => <div key={step} className={step <= stage ? 'is-on' : undefined} />)}
        </div>
        <div className="mumoo-ride-messages">
          {lines.map((line, index) => (
            <div
              key={`${line.startFrame}-${line.text}`}
              className={`mumoo-ride-note ${index % 2 === 0 ? 'is-driver' : 'is-you'}`}
              style={entranceStyle(frame, line.startFrame)}
            >
              {line.text}
            </div>
          ))}
        </div>
      </div>
      <div className="mumoo-dom-home" aria-hidden="true" />
    </div>
  );
}

function FoodScreen({ cues, frame, capturedAtMs, deviceSeed }: Omit<DomScreenProps, 'variant'>) {
  const lines = dailyScreenFrame(cues, frame).lines;
  const progress = Math.min(1, frame / 449);
  const stage = progress < 0.25 ? 0 : progress < 0.55 ? 1 : progress < 0.82 ? 2 : 3;
  const steps = [
    { title: 'Order confirmed', detail: 'Kitchen received your fictional order' },
    { title: 'Preparing', detail: 'Chef is plating the special' },
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
          <h2>Harbor Noodle Co.</h2>
          <p>Fictional restaurant · Order #4821</p>
          <div className="mumoo-food-eta">
            <div>
              <p>Estimated arrival</p>
            </div>
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
          <strong>Courier</strong>
          <span>Fictional profile · electric bike</span>
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
