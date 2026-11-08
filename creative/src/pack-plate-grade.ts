/**
 * Live color grades for cleared photo plates under Pulse.
 * Grades are GPU filters — one baked proxy, many looks.
 */
import { ColorMatrixFilter } from 'pixi.js';

export const PLATE_GRADES = [
  { id: 'natural', name: 'Natural', hint: 'Slight contrast, keep the photo true' },
  { id: 'cold', name: 'Cold', hint: 'Blue crush for night / techno' },
  { id: 'warm', name: 'Warm', hint: 'Amber crush for party / heat' },
  { id: 'noir', name: 'Noir', hint: 'Desaturate + punch for dark tracks' },
] as const;

export type PlateGradeId = (typeof PLATE_GRADES)[number]['id'];

export function isPlateGradeId(value: unknown): value is PlateGradeId {
  return typeof value === 'string' && PLATE_GRADES.some(item => item.id === value);
}

/** Apply a grade onto an existing ColorMatrixFilter (mutates in place). */
export function applyPlateGrade(filter: ColorMatrixFilter, grade: PlateGradeId) {
  filter.reset();
  switch (grade) {
    case 'natural':
      filter.brightness(0.94, false);
      filter.contrast(1.12, false);
      filter.saturate(1.05, false);
      break;
    case 'cold':
      filter.brightness(0.86, false);
      filter.contrast(1.18, false);
      filter.saturate(0.55, false);
      filter.hue(200, false);
      break;
    case 'warm':
      filter.brightness(0.9, false);
      filter.contrast(1.2, false);
      filter.saturate(1.25, false);
      filter.hue(28, false);
      break;
    case 'noir':
      filter.greyscale(0.22, false);
      filter.contrast(1.35, false);
      filter.brightness(0.82, false);
      break;
    default:
      break;
  }
}

export function createPlateGradeFilter(grade: PlateGradeId = 'natural'): ColorMatrixFilter {
  const filter = new ColorMatrixFilter();
  applyPlateGrade(filter, grade);
  return filter;
}
