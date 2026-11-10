import { cn } from "@/lib/utils";

/**
 * 21st.dev "Image Generation": a field of dots that a soft mask drifts across while something is being made.
 * Adapted: `compact` is the bare field with no captions, filling whatever it sits in (a card still loading).
 * Its styles are in styles/image-generation.css.
 */
export function ImageGeneration({
  prompt = "a calm mountain lake at dawn",
  resolution = "1024 × 1024",
  label = "Generating image",
  compact = false,
}: {
  prompt?: string;
  resolution?: string;
  label?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("igWrap", compact && "igCompact")}>
      <div className="igCanvas" role="img" aria-label={label}>
        <span className="igDots" aria-hidden />
        <span className="igGlow" aria-hidden />
        {!compact && <span className="igRes">{resolution}</span>}
      </div>
      {!compact && (
        <div className="igMeta">
          <span className="igLabel">{label}</span>
          <span className="igPrompt">“{prompt}”</span>
        </div>
      )}
    </div>
  );
}

export default ImageGeneration;
