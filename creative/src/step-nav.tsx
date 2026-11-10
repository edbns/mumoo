import { NotchNav } from './notch-nav';

const STEPS = ['Upload', 'Choose clip & sync', 'Analyzing', 'Creatives'] as const;
export type StepNumber = 1 | 2 | 3 | 4;
/** The analysis runs by itself, so it is a place to be, never somewhere to go back to. */
export const ANALYZING_STEP: StepNumber = 3;

/** Where the person is, and a way back to any step already done. */
export function StepNav({ current, onSelect }: { current: StepNumber; onSelect: (step: StepNumber) => void }) {
  const items = STEPS.map((label, index) => {
    const id = (index + 1) as StepNumber;
    return { id, label, disabled: id >= current || id === ANALYZING_STEP };
  });
  return <NotchNav label="Steps" items={items} current={current} onSelect={onSelect} />;
}
