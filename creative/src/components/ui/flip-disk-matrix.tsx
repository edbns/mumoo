// Flip Disk Matrix, from 21st.dev: an electromechanical flip-disc board. Here it only shows text, in the theme's colours.

import { memo, useMemo } from "react";

const GLYPHS: Record<string, number[]> = {
  "0": [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  "1": [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  "2": [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  "3": [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110],
  "4": [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  "5": [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  "6": [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  "7": [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  "8": [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  "9": [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
  ":": [0b00000, 0b00100, 0b00000, 0b00000, 0b00000, 0b00100, 0b00000],
  " ": [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000],
  "A": [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  "B": [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  "C": [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  "D": [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  "E": [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  "F": [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  "G": [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  "H": [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  "I": [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  "J": [0b00011, 0b00001, 0b00001, 0b00001, 0b10001, 0b10001, 0b01110],
  "K": [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  "L": [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  "M": [0b10001, 0b11011, 0b10101, 0b10001, 0b10001, 0b10001, 0b10001],
  "N": [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  "O": [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  "P": [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  "Q": [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b01110, 0b00001],
  "R": [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  "S": [0b01110, 0b10001, 0b10000, 0b01110, 0b00001, 0b10001, 0b01110],
  "T": [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  "U": [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  "V": [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  "W": [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  "X": [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  "Y": [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  "Z": [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
};

/** `text` drawn in the 5x7 font, centred on a `cols` x `rows` board. */
function glyphBitmap(text: string, cols: number, rows: number): boolean[][] {
  const grid = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));
  const chars = text.toUpperCase().split("");
  const totalW = chars.length * 6 - 1;
  let ox = Math.max(0, Math.floor((cols - totalW) / 2));
  const oy = Math.max(0, Math.floor((rows - 7) / 2));
  for (const c of chars) {
    const bits = GLYPHS[c] ?? GLYPHS[" "];
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 5; x++) {
        if (oy + y < rows && ox + x < cols) grid[oy + y][ox + x] = Boolean(bits[y] & (1 << (4 - x)));
      }
    }
    ox += 6;
  }
  return grid;
}

const Disk = memo(({ on }: { on: boolean }) => (
  <div className="relative aspect-square w-full" style={{ perspective: "400px" }}>
    <div
      className="absolute inset-0 transition-transform duration-[600ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none"
      style={{ transformStyle: "preserve-3d", transform: on ? "rotateX(180deg)" : "rotateX(0deg)" }}
    >
      <div className="absolute inset-0 rounded-full bg-[#141414] shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]" style={{ backfaceVisibility: "hidden" }} />
      <div
        className="absolute inset-0 rounded-full bg-primary shadow-[inset_0_-2px_6px_rgba(0,0,0,0.25)]"
        style={{ backfaceVisibility: "hidden", transform: "rotateX(180deg)" }}
      />
    </div>
  </div>
));
Disk.displayName = "Disk";

/** A flip-disc board showing `text` (digits, A–Z, colon and space); a change flips only the discs that differ. */
export function FlipDiskMatrix({ text, cols = 31, rows = 11, label }: { text: string; cols?: number; rows?: number; label?: string }) {
  const bits = useMemo(() => glyphBitmap(text, cols, rows), [text, cols, rows]);
  return (
    <div role="img" aria-label={label ?? text} className="w-full rounded-[var(--radius-panel)] bg-card p-2 shadow-[inset_0_4px_20px_rgba(0,0,0,0.8),0_20px_40px_rgba(0,0,0,0.5)] md:p-6">
      <div className="rounded-[calc(var(--radius-panel)-0.5rem)] bg-black p-2 shadow-[inset_0_2px_10px_rgba(0,0,0,1)] md:p-4">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: "min(0.4vw, 3px)" }}>
          {bits.flatMap((row, y) => row.map((on, x) => <Disk key={`${x}-${y}`} on={on} />))}
        </div>
      </div>
    </div>
  );
}
