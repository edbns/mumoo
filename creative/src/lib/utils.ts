import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins class names and lets the last Tailwind utility win, so a component's defaults can be overridden. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
