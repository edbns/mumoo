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
  const progress = Math.min(1, Math.max(0, frame - startFrame + 1));
  return {
    ['--enter-y' as string]: `${(1 - progress) * 4}px`,
    ['--enter-opacity' as string]: String(progress),
  };
}

function DeviceChrome({
  capturedAtMs, frame, variant, deviceSeed, light = false,
}: {
  capturedAtMs: number; frame: number; variant: DomDailyScreenVariant; deviceSeed?: number; light?: boolean;
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
            {[1, 2, 3, 4].map(bar => <span key={bar} className={bar <= status.signalBars ? undefined : 'is-off'} />)}
          </div>
          {status.network === 'wifi' ? <div className="mumoo-dom-wifi" aria-hidden="true" />
            : status.network === '4G' || status.network === '5G' ? <div className="mumoo-dom-network">{status.network}</div>
              : null}
          <div className={`mumoo-dom-battery ${status.batteryPercent <= 20 && !status.charging ? 'is-low' : ''} ${status.charging ? 'is-charging' : ''}`} aria-hidden="true">
            <i style={{ width: `${status.batteryPercent}%` }} />
          </div>
        </div>
        {status.notificationCount > 0 ? <div className="mumoo-dom-badge" aria-hidden="true">{Math.min(9, status.notificationCount)}</div> : null}
      </div>
    </>
  );
}

function Redact({ wide = false, soft = false }: { wide?: boolean; soft?: boolean }) {
  return <span className={`mumoo-redact ${wide ? 'is-wide' : ''} ${soft ? 'is-soft' : ''}`} aria-hidden="true" />;
}

function DatingScreen({ cues, frame, capturedAtMs, deviceSeed }: Omit<DomScreenProps, 'variant'>) {
  const lines = dailyScreenFrame(cues, frame).lines;
  const bumble = ((deviceSeed ?? 0) % 2) === 1;
  return (
    <div className={`mumoo-dom-screen mumoo-dating ${bumble ? 'is-bumble' : 'is-tinder'}`} data-variant="dating">
      <DeviceChrome capturedAtMs={capturedAtMs} frame={frame} variant="dating" deviceSeed={deviceSeed} light />
      <div className="mumoo-dating-hero">
        <div className="mumoo-dating-faces">
          <div className="mumoo-dom-avatar mumoo-dating-face" />
          <div className="mumoo-dating-heart">♥</div>
          <div className="mumoo-dom-avatar mumoo-dating-face is-warm" />
        </div>
        <h2>It&apos;s a match!</h2>
        <p>{bumble ? 'You both liked each other' : 'You and someone new liked each other'}</p>
        <div className="mumoo-dating-names"><Redact soft /><span>&amp;</span><Redact soft /></div>
      </div>
      <div className="mumoo-dating-sheet">
        <p className="mumoo-dating-prompt">Say something that stands out</p>
        <div className="mumoo-dating-messages">
          {lines.map(line => (
            <div key={`${line.startFrame}-${line.text}`} className="mumoo-dating-bubble" style={entranceStyle(frame, line.startFrame)}>{line.text}</div>
          ))}
        </div>
        <div className="mumoo-dating-cta">Send Message</div>
      </div>
      <div className="mumoo-dom-home" aria-hidden="true" />
    </div>
  );
}

function RideScreen({ cues, frame, capturedAtMs, deviceSeed }: Omit<DomScreenProps, 'variant'>) {
  const lines = dailyScreenFrame(cues, frame).lines;
  const progress = Math.min(1, frame / 449);
  const eta = Math.max(1, Math.round(5 - progress * 4));
  const carX = 200 + progress * 620;
  const carY = 720 - progress * 360;
  return (
    <div className="mumoo-dom-screen mumoo-ride" data-variant="ride" style={{ ['--car-x' as string]: `${carX}px`, ['--car-y' as string]: `${carY}px` }}>
      <DeviceChrome capturedAtMs={capturedAtMs} frame={frame} variant="ride" deviceSeed={deviceSeed} />
      <div className="mumoo-ride-map" aria-hidden="true">
        <div className="mumoo-ride-route" />
        <div className="mumoo-ride-pin">P</div>
        <div className="mumoo-ride-car" />
      </div>
      <div className="mumoo-ride-sheet">
        <h2>Pickup in {eta} min</h2>
        <div className="mumoo-ride-details">
          <p>Meet at your pickup spot on</p>
          <Redact wide />
          <span>Same side of the street</span>
        </div>
        <div className="mumoo-ride-driver">
          <div className="mumoo-ride-vehicle" aria-hidden="true">SUV</div>
          <div>
            <Redact />
            <span>Comfort</span>
          </div>
          <div className="mumoo-ride-rating">
            <div className="mumoo-dom-avatar" />
            <em>4.98</em>
            <Redact />
          </div>
        </div>
        <p className="mumoo-ride-message-label">Message</p>
        <div className="mumoo-ride-messages">
          {lines.map(line => (
            <div key={`${line.startFrame}-${line.text}`} className="mumoo-ride-note" style={entranceStyle(frame, line.startFrame)}>{line.text}</div>
          ))}
        </div>
        <div className="mumoo-ride-composer"><span>Message…</span><em>↑</em></div>
      </div>
      <div className="mumoo-dom-home" aria-hidden="true" />
    </div>
  );
}

function FoodScreen({ cues, frame, capturedAtMs, deviceSeed }: Omit<DomScreenProps, 'variant'>) {
  const lines = dailyScreenFrame(cues, frame).lines;
  const progress = Math.min(1, frame / 449);
  const stage = progress < 0.25 ? 0 : progress < 0.55 ? 1 : progress < 0.82 ? 2 : 3;
  const eta = Math.max(1, Math.round(18 - progress * 16));
  return (
    <div className="mumoo-dom-screen mumoo-food" data-variant="food">
      <DeviceChrome capturedAtMs={capturedAtMs} frame={frame} variant="food" deviceSeed={deviceSeed} />
      <div className="mumoo-food-map" aria-hidden="true">
        <div className="mumoo-food-route" />
        <div className="mumoo-food-store">S</div>
        <div className="mumoo-food-home">H</div>
        <div className="mumoo-food-courier-dot" style={{ left: `${24 + progress * 48}%`, top: `${28 + progress * 34}%` }}>●</div>
      </div>
      <div className="mumoo-food-sheet">
        <p className="mumoo-food-eyebrow">Heading to</p>
        <div className="mumoo-food-name"><Redact wide /></div>
        <h2>{eta <= 2 ? 'Arriving now' : `Arriving in ${eta} min`}</h2>
        <div className="mumoo-food-rail" aria-hidden="true">
          {[0, 1, 2, 3].map(step => <i key={step} className={step <= stage ? 'is-on' : undefined} />)}
        </div>
        <div className="mumoo-food-feed">
          {lines.map(line => (
            <div key={`${line.startFrame}-${line.text}`} className="mumoo-food-update" style={entranceStyle(frame, line.startFrame)}>
              <strong>Update</strong>{line.text}
            </div>
          ))}
        </div>
        <div className="mumoo-food-courier">
          <div className="mumoo-dom-avatar" />
          <div>
            <span>Your courier</span>
            <div className="mumoo-food-courier-name"><Redact soft /></div>
          </div>
          <em>On the way</em>
        </div>
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
