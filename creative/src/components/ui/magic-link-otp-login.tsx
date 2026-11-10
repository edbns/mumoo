"use client";
// Magic Link OTP Login from 21st.dev, adapted to the theme: no borders, theme colours, and wording for a one-time code
// (we email a code, not a link).

import * as React from "react";
import { ArrowRight, Check, LoaderCircle, Mail, ShieldCheck } from "lucide-react";

export type MagicLinkStep = "email" | "code" | "success";
export type MagicLinkStatus = "idle" | "sending" | "verifying" | "error";
export type MagicLinkOtpLoginProps = {
  defaultEmail?: string;
  onStepChange?: (step: MagicLinkStep) => void;
  /** Resolve after your service accepts the request; reject (with the words to show) to keep the email form. */
  onSendCode?: (email: string) => unknown;
  /** Resolve true when the code is right (the success step follows). Reject (with the words to show) when it is wrong or could not be checked. */
  onVerifyCode?: (code: string) => unknown;
  resendSeconds?: number;
  codeLength?: number;
  onResend?: (email: string) => unknown;
  appName?: string;
  logo?: React.ReactNode;
  successTitle?: string;
  className?: string;
  ref?: React.ComponentProps<"div">["ref"];
};

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card";
const EASE = "cubic-bezier(.22,1,.36,1)";
const STEPS = ["email", "code", "success"] as const;
const STEP_LABELS = ["Email", "Code", "You're in"];
const digitsOnly = (value: string, length: number) => value.replace(/[^0-9]/g, "").slice(0, length);

function Envelope() {
  return (
    <div data-envelope aria-hidden="true" className="relative mx-auto h-[78px] w-[88px]" style={{ perspective: 400 }}>
      <div className="absolute left-2 top-7 h-12 w-[72px] rounded-lg bg-secondary" />
      <div data-envelope-flap className="absolute left-2 top-7 h-8 w-[72px] origin-top bg-primary/25" style={{ clipPath: "polygon(0 0, 100% 0, 50% 100%)", transform: "rotateX(180deg)" }} />
      <div data-envelope-paper className="absolute left-[19px] top-6 flex h-[50px] w-[50px] flex-col items-center gap-1.5 rounded-md bg-background pt-2 shadow-sm" style={{ transform: "translateY(-10px)" }}>
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="size-3" strokeWidth={2.5} /></span><span className="h-0.5 w-6 rounded bg-primary/30" /><span className="h-0.5 w-4 rounded bg-primary/20" />
      </div>
      <svg viewBox="0 0 74 50" className="absolute left-[7px] top-[27px] h-[50px] w-[74px] text-muted" fill="currentColor">
        <path d="M1 2 37 26 73 2v39a8 8 0 0 1-8 8H9a8 8 0 0 1-8-8Z" />
        <path d="m1 2 36 24L73 2M1 40l24-17m48 17L49 23" className="text-secondary" fill="none" stroke="currentColor" />
      </svg>
    </div>
  );
}

/** Passwordless UI only. The host owns delivery, verification, expiry and attempt limits. */
export function MagicLinkOtpLogin({
  defaultEmail = "", onStepChange,
  onSendCode, onVerifyCode,
  resendSeconds = 30, codeLength = 6, onResend,
  appName = "your workspace", logo, successTitle = "You're in",
  className = "", ref,
}: MagicLinkOtpLoginProps) {
  const id = React.useId();
  const length = Number.isFinite(codeLength) ? Math.min(8, Math.max(4, Math.floor(codeLength))) : 6;
  const cooldown = Number.isFinite(resendSeconds) ? Math.max(0, Math.ceil(resendSeconds)) : 30;
  const [value, setValue] = React.useState(defaultEmail);
  const [currentStep, setStep] = React.useState("email" as MagicLinkStep);
  const [currentCode, setCode] = React.useState("");
  const [currentStatus, setStatus] = React.useState("idle" as MagicLinkStatus);
  const [localError, setLocalError] = React.useState("");
  const [remaining, setRemaining] = React.useState(cooldown);
  const [resends, setResends] = React.useState(0);
  const [reduced, setReduced] = React.useState(true);
  const root = React.useRef(null as HTMLDivElement | null);
  const inputs = React.useRef([] as (HTMLInputElement | null)[]);
  const mounted = React.useRef(false);
  const request = React.useRef(0);
  const pending = React.useRef(false);
  const submitted = React.useRef(null as string | null);
  const glowedCode = React.useRef(null as string | null);
  const focusNext = React.useRef(false);
  const message = localError;
  const busy = currentStatus === "sending" || currentStatus === "verifying";
  const failed = currentStatus === "error" || !!message;
  const attachRef = React.useCallback((node: HTMLDivElement | null) => {
    root.current = node;
    if (typeof ref === "function") return ref(node);
    if (ref) ref.current = node;
  }, [ref]);

  React.useEffect(() => {
    mounted.current = true;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => { mounted.current = false; request.current += 1; pending.current = false; media.removeEventListener("change", update); };
  }, []);

  React.useEffect(() => {
    if (currentStep !== "code") return;
    const deadline = Date.now() + cooldown * 1000;
    setRemaining(cooldown);
    const timer = window.setInterval(() => setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))), 250);
    return () => window.clearInterval(timer);
  }, [currentStep, cooldown, resends]);

  React.useLayoutEffect(() => {
    if (!focusNext.current || !root.current) return;
    focusNext.current = false;
    const target = currentStep === "code" ? inputs.current[0] : root.current.querySelector(currentStep === "email" ? "input" : "h2");
    (target as HTMLElement | null)?.focus({ preventScroll: true });
  }, [currentStep]);

  React.useLayoutEffect(() => {
    if (reduced || !root.current) return;
    const animations: Animation[] = [];
    const animate = (selector: string, frames: Keyframe[], duration: number) => {
      const node = root.current?.querySelector(selector);
      if (node) animations.push(node.animate(frames, { duration, easing: EASE }));
    };
    if (currentStep !== "email") animate("[data-step-body]", [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }], 280);
    if (currentStep === "code") {
      animate("[data-envelope-flap]", [{ transform: "rotateX(0deg)" }, { transform: "rotateX(180deg)" }], 580);
      animate("[data-envelope-paper]", [{ transform: "translateY(14px)" }, { transform: "translateY(-10px)" }], 720);
    }
    if (currentStep === "success") animate("[data-success-stamp]", [{ opacity: 0, transform: "scale(1.3) rotate(-16deg)" }, { opacity: 1, transform: "scale(.94) rotate(3deg)", offset: .7 }, { opacity: 1, transform: "scale(1) rotate(0deg)" }], 480);
    return () => animations.forEach((animation) => animation.cancel());
  }, [currentStep, reduced]);

  React.useLayoutEffect(() => {
    if (reduced || !failed || currentStep !== "code") return;
    const animation = root.current?.querySelector("[data-code-fields]")?.animate(
      [{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(-4px)" }, { transform: "translateX(0)" }],
      { duration: 420, easing: "ease-in-out" },
    );
    return () => animation?.cancel();
  }, [failed, message, currentStep, reduced]);

  React.useLayoutEffect(() => {
    if (currentStep !== "code" || currentCode.length !== length) { glowedCode.current = null; return; }
    if (reduced || failed || glowedCode.current === currentCode) return;
    glowedCode.current = currentCode;
    const animations = inputs.current.flatMap((input) => {
      if (!input) return [];
      const resting = getComputedStyle(input).boxShadow;
      const animation = input.animate([
        { boxShadow: resting },
        { boxShadow: "0 0 0 2px color-mix(in oklab, var(--primary) 85%, transparent), 0 0 14px color-mix(in oklab, var(--primary) 28%, transparent)", offset: .45 },
        { boxShadow: resting },
      ], { duration: 440, easing: "ease-out" });
      return [animation];
    });
    return () => animations.forEach((animation) => animation.cancel());
  }, [currentCode, currentStep, length, failed, reduced]);

  const changeStep = (next: MagicLinkStep) => {
    focusNext.current = focusNext.current || !!root.current?.contains(document.activeElement);
    setStep(next);
    setStatus("idle");
    setLocalError("");
    onStepChange?.(next);
  };
  const changeCode = (next: string) => {
    const clean = digitsOnly(next, length);
    if (clean !== currentCode) submitted.current = null;
    setCode(clean);
    setLocalError("");
    if (!busy) setStatus("idle");
  };

  const deliver = async (resend: boolean) => {
    const callback = resend ? onResend : onSendCode;
    if (!callback || busy || pending.current || (resend && remaining > 0)) return;
    focusNext.current = !!root.current?.contains(document.activeElement);
    pending.current = true;
    const token = ++request.current;
    setStatus("sending");
    setLocalError("");
    try {
      await callback(value.trim());
      if (!mounted.current || token !== request.current) return;
      changeCode("");
      if (resend) { setResends((count) => count + 1); setStatus("idle"); }
      else changeStep("code");
    } catch (cause) {
      if (!mounted.current || token !== request.current) return;
      setLocalError(cause instanceof Error && cause.message ? cause.message : resend ? "Couldn't resend. Please try again." : "Couldn't send the code. Please try again.");
      setStatus("error");
    } finally {
      if (mounted.current && token === request.current) pending.current = false;
    }
  };

  React.useEffect(() => {
    if (currentCode.length !== length) { submitted.current = null; return; }
    if (currentStep !== "code" || busy || pending.current || !onVerifyCode || submitted.current === currentCode) return;
    let cancelled = false;
    // Defer one microtask so Strict Mode's effect replay never duplicates a request.
    const verify = async () => {
      if (cancelled || pending.current || submitted.current === currentCode) return;
      submitted.current = currentCode;
      pending.current = true;
      focusNext.current = !!root.current?.contains(document.activeElement);
      const token = ++request.current;
      setLocalError("");
      setStatus("verifying");
      try {
        const result = await onVerifyCode(currentCode);
        if (!mounted.current || token !== request.current) return;
        if (result === true) changeStep("success");
        else { setLocalError("That code didn't work. Try again."); setStatus("error"); }
      } catch (cause) {
        if (!mounted.current || token !== request.current) return;
        setLocalError(cause instanceof Error && cause.message ? cause.message : "Couldn't verify that code. Please try again.");
        setStatus("error");
      } finally {
        if (mounted.current && token === request.current) pending.current = false;
      }
    };
    queueMicrotask(() => { void verify(); });
    return () => { cancelled = true; };
  }, [currentCode, length, currentStep, busy, onVerifyCode]);

  const putDigits = (text: string, index: number) => {
    if (busy) return;
    const clean = digitsOnly(text, length);
    if (!clean) return;
    // A full paste / one-time-code autofill replaces the whole code from any box.
    const start = clean.length === length ? 0 : Math.min(index, currentCode.length);
    const next = (currentCode.slice(0, start) + clean + currentCode.slice(start + clean.length)).slice(0, length);
    changeCode(next);
    inputs.current[Math.min(start + clean.length, length - 1)]?.focus();
  };
  const codeKey = (event: React.KeyboardEvent, index: number) => {
    if (busy) return;
    if (event.key === "Backspace") {
      event.preventDefault();
      const target = currentCode[index] ? index : Math.max(0, index - 1);
      changeCode(currentCode.slice(0, target) + currentCode.slice(target + 1));
      inputs.current[Math.max(0, index - 1)]?.focus();
    } else if (event.key === "Delete") {
      event.preventDefault();
      changeCode(currentCode.slice(0, index) + currentCode.slice(index + 1));
    } else if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? length - 1 : Math.max(0, Math.min(length - 1, index + (event.key === "ArrowLeft" ? -1 : 1)));
      inputs.current[next]?.focus();
    }
  };

  return (
    <div ref={attachRef} data-slot="magic-link-otp-login" data-step={currentStep} data-status={currentStatus} className={`w-full max-w-[420px] rounded-[var(--radius-panel)] bg-card text-card-foreground shadow-[0_28px_56px_-24px_#000] ${className}`}>
      <div aria-hidden="true" className="flex h-5 items-center justify-center px-6 pt-7 pb-3 box-content">{logo}</div>

      <div data-step-body key={currentStep} className="px-6 py-4 sm:px-7">
        {currentStep === "email" ? (
          <form aria-labelledby={`${id}-title`} aria-busy={busy} onSubmit={(event) => { event.preventDefault(); void deliver(false); }}>
            <div aria-hidden="true" className="mx-auto mb-4 flex size-12 items-center justify-center rounded-[var(--radius-control)] bg-muted"><Mail className="size-6" strokeWidth={1.5} /></div>
            <h2 id={`${id}-title`} className="text-center text-[27px] font-semibold leading-tight tracking-tight">Your inbox is the key.</h2>
            <p className="mx-auto mt-2 max-w-[280px] text-center text-[13px] leading-5 text-muted-foreground">We email you a one-time code.<br />No password to remember.</p>
            <label htmlFor={`${id}-email`} className="sr-only">Email address</label>
            <input id={`${id}-email`} autoFocus type="email" name="email" required autoComplete="email" autoCapitalize="none" spellCheck={false} value={value} disabled={busy} onChange={(event) => { setValue(event.target.value); setLocalError(""); setStatus("idle"); }} placeholder="you@example.com" aria-invalid={failed || undefined} aria-describedby={failed ? `${id}-error` : undefined} className={`mt-6 h-12 w-full rounded-[var(--radius-control)] bg-muted px-3.5 text-sm placeholder:text-muted-foreground disabled:opacity-60 ${FOCUS}`} />
            <button type="submit" disabled={busy || !onSendCode} className={`mt-3 flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70 ${FOCUS}`}>
              {busy ? <><LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />Sending code…</> : <>Email me a code <ArrowRight aria-hidden="true" className="size-4" /></>}
            </button>
            {failed && <p id={`${id}-error`} role="alert" className="mt-3 text-xs leading-5 text-destructive">{message || "Something went wrong. Please try again."}</p>}
          </form>
        ) : currentStep === "code" ? (
          <div aria-busy={busy}>
            <Envelope />
            <h2 id={`${id}-title`} className="mt-1 text-center text-[27px] font-semibold leading-tight tracking-tight">Check your inbox</h2>
            <p className="mt-1 text-center text-xs leading-5 text-muted-foreground">We sent a {length}-digit code to</p>
            <p data-sent-email className="mt-0.5 break-all text-center text-[13px] font-medium">{value}</p>
            <p id={`${id}-code-label`} className="mb-3 mt-4 text-center text-[11px] text-muted-foreground">Enter the code</p>
            <div data-code-fields role="group" aria-labelledby={`${id}-code-label`} aria-describedby={`${id}-code-hint${failed ? ` ${id}-error` : ""}`} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}>
              {Array.from({ length }, (_, index) => (
                <input key={index} ref={(node) => { inputs.current[index] = node; }} data-code-index={index} type="text" inputMode="numeric" autoComplete={index === 0 ? "one-time-code" : "off"} pattern="[0-9]*" name={`code-${index + 1}`} aria-label={`Digit ${index + 1} of ${length}`} aria-invalid={failed || undefined} value={currentCode[index] ?? ""} disabled={busy} onFocus={(event) => event.target.select()} onKeyDown={(event) => codeKey(event, index)} onChange={(event) => { if (!event.target.value) changeCode(currentCode.slice(0, index) + currentCode.slice(index + 1)); else putDigits(event.target.value, index); }} onPaste={(event) => { event.preventDefault(); putDigits(event.clipboardData.getData("text"), index); }} className={`h-14 min-w-0 rounded-[var(--radius-control)] text-center font-mono text-2xl font-medium text-foreground caret-primary disabled:opacity-70 ${failed ? "bg-muted ring-1 ring-destructive/70" : currentCode[index] ? "bg-secondary" : "bg-muted"} ${FOCUS}`} />
              ))}
            </div>
            <p id={`${id}-code-hint`} className="sr-only">Enter {length} digits. Your code is submitted automatically when complete.</p>
            <div className="flex min-h-8 items-center justify-center pt-1 text-center text-[11px] leading-4">
              {failed ? <p id={`${id}-error`} role="alert" className="font-medium text-destructive">{message || "That code didn't work. Try again."}</p> : <p className="flex items-center gap-1.5 text-muted-foreground">{currentStatus === "verifying" ? <><LoaderCircle aria-hidden="true" className="size-3.5 motion-safe:animate-spin" />Verifying your code…</> : <>Your code signs you in automatically</>}</p>}
            </div>
            <div className="flex items-center justify-between gap-3 text-xs">
              <button type="button" disabled={busy} onClick={() => { request.current += 1; pending.current = false; changeCode(""); changeStep("email"); }} className={`cursor-pointer rounded bg-transparent px-0.5 py-1.5 text-muted-foreground underline decoration-secondary underline-offset-4 hover:text-foreground disabled:opacity-50 ${FOCUS}`}>Change email</button>
              <button data-resend type="button" disabled={remaining > 0 || busy || !onResend} onClick={() => void deliver(true)} className={`cursor-pointer rounded bg-transparent px-0.5 py-1.5 font-medium tabular-nums disabled:cursor-default disabled:text-muted-foreground ${FOCUS}`}>{currentStatus === "sending" ? "Sending…" : remaining > 0 ? `Resend in ${remaining}s` : "Resend"}</button>
            </div>
          </div>
        ) : (
          <div className="flex min-h-[288px] flex-col items-center justify-center py-6 text-center">
            <div data-success-stamp aria-hidden="true" className="mb-6 flex size-[76px] items-center justify-center rounded-full bg-primary text-primary-foreground ring-8 ring-primary/10"><Check className="size-9" strokeWidth={1.75} /></div>
            <h2 id={`${id}-title`} tabIndex={-1} className="text-[28px] font-semibold tracking-tight outline-none">{successTitle}</h2>
            <p className="mt-2 text-[13px] text-muted-foreground">Welcome back to {appName}.</p>
            <span className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-[11px] text-muted-foreground"><ShieldCheck className="size-3.5" aria-hidden="true" />Email verified</span>
          </div>
        )}
      </div>

      <ol aria-label="Sign-in progress" className="flex items-center justify-center gap-4 px-6 pb-5 pt-1">
        {STEPS.map((item, index) => {
          const active = currentStep === item;
          const done = index < STEPS.indexOf(currentStep);
          return <li key={item} aria-current={active ? "step" : undefined} className={`flex items-center gap-1.5 text-[10px] ${active || done ? "text-foreground" : "text-muted-foreground"}`}><span className={`flex size-4 items-center justify-center rounded-full text-[9px] ${active ? "bg-primary text-primary-foreground" : done ? "bg-secondary text-foreground" : "bg-muted"}`}>{done ? <Check className="size-2.5" aria-hidden="true" /> : index + 1}</span>{STEP_LABELS[index]}</li>;
        })}
      </ol>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{currentStep === "success" ? successTitle : currentStatus === "sending" ? "Sending your code" : currentStatus === "verifying" ? "Verifying your code" : currentStep === "code" ? `Check your inbox at ${value}. Enter your ${length}-digit code.` : "Enter your email to get a code."}</p>
    </div>
  );
}

export default MagicLinkOtpLogin;
