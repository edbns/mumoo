/**
 * The one look of a text box, the same as "What kind of music is it?": grey, with a thin soft green ring while typing.
 * `FIELD_FOCUS` is that ring alone, for boxes with their own size; inside a popup (a grey panel) the box is a shade lighter.
 */
export const FIELD_FOCUS = 'outline-none focus-visible:shadow-[0_0_0_2px_var(--focus-ring)]';
export const FIELD = `h-[var(--control-height-md)] w-full min-w-0 rounded-[var(--radius-control)] bg-muted px-3 text-sm text-foreground placeholder:text-muted-foreground ${FIELD_FOCUS}`;
export const POPUP_FIELD = FIELD.replace('bg-muted', 'bg-secondary');
