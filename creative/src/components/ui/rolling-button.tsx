import { motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { Button } from './button';

const LETTER_STAGGER_S = 0.04;
const ROLL_S = 0.4;

/**
 * A button whose word rolls letter by letter, like a departure board. It rolls when the pointer arrives, when it is
 * pressed, and (if `every` is given) by itself from time to time, so the action is not missed.
 */
export function RollingButton({ label, every, onClick, onMouseEnter, onFocus, ...props }:
  Omit<ComponentProps<typeof Button>, 'children'> & { label: string; every?: number }) {
  const calm = useReducedMotion();
  const [turn, setTurn] = useState(0);
  const rolling = useRef(false);
  const letters = Array.from(label);

  const roll = useCallback(() => {
    if (calm || rolling.current) return;
    rolling.current = true;
    setTurn(count => count + 1);
    window.setTimeout(() => { rolling.current = false; }, (ROLL_S + letters.length * LETTER_STAGGER_S) * 1000);
  }, [calm, letters.length]);

  useEffect(() => {
    if (!every || props.disabled) return;
    const timer = window.setInterval(roll, every);
    return () => window.clearInterval(timer);
  }, [every, props.disabled, roll]);

  return (
    <Button
      {...props}
      onClick={event => { roll(); onClick?.(event); }}
      onMouseEnter={event => { roll(); onMouseEnter?.(event); }}
      onFocus={event => { roll(); onFocus?.(event); }}
    >
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className="flex">
        {letters.map((letter, index) => (
          <span key={index} className="inline-block h-5 overflow-hidden leading-5">
            <motion.span
              key={turn}
              className="flex flex-col"
              initial={{ y: '0%' }}
              animate={{ y: turn ? '-50%' : '0%' }}
              transition={{ delay: index * LETTER_STAGGER_S, duration: ROLL_S, ease: [0.22, 1, 0.36, 1] }}
            >
              <span>{letter === ' ' ? '\u00a0' : letter}</span>
              <span>{letter === ' ' ? '\u00a0' : letter}</span>
            </motion.span>
          </span>
        ))}
      </span>
    </Button>
  );
}
