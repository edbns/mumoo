# Graphic base → beat prop → lyrics

Your list (Neon Punk, Risograph, Low-poly 3D, Japanese Ink…) is the **first layer**:
real graphic design plates — not type skins. Pulse is how that plate reacts to the beat.

```
Graphic design plate (Riso / low-poly / noir / …)
    + Pulse (flash / energy)
    + Beat prop on the hit (beast, scratch, alien…)
    + Lyrics on top
```

Code today:
- [`ad-worlds.ts`](../src/ad-worlds.ts) — pulse base + beat props (never standalone)
- [`ad-punch.ts`](../src/ad-punch.ts) — stack then lyric overlay
- [`creatives-pack.ts`](../src/creatives-pack.ts) — mood → `pulse` / `pulse-beast` / `pulse-scratch` / `lyric-hold`

**Removed:** neon dots / neon-field, standalone beast-hit, standalone scratch-noir.

**Shipped GD plates**
| Plate | Pulse behavior | Props |
|-------|----------------|-------|
| `paper-cutout` | Layers lift / shift on beat | none / beast / scratch |
| `pulise` | Neon red / white / black field cuts on the beat, one big word at a time | none |

**Next plates from the list:** Risograph → Graphic Noir → Bauhaus/Brutal → later Low-poly with assets.
