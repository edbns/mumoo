import { useEffect, useState } from 'react';
import { MagicLinkOtpLogin, type MagicLinkStep } from '@/components/ui/magic-link-otp-login';
import { Modal } from '@/components/ui/modal';
import type { SignInReason } from './account-hint';
import { LEGAL_PATHS } from './site-paths';

const TERMS_URL = LEGAL_PATHS.terms;
const PRIVACY_URL = LEGAL_PATHS.privacy;
/** How long "You're in" stays on screen before the popup closes by itself. */
const WELCOME_MS = 1400;

/** The sign-in popup: email, then the code we sent to it, then a short welcome. Or Google, when `onGoogle` is given. */
export function SignInDialog({ open, onClose, onSendCode, onCheckCode, onGoogle, reason, hideTerms = false }: {
  open: boolean;
  /** Why it was opened (pressing Download), said in place of the usual heading. */
  reason?: SignInReason | null;
  /** The admin page is not for the public, so it has no terms line. */
  hideTerms?: boolean;
  onClose: () => void;
  /** Rejects with the words to show when the code could not be sent. */
  onSendCode: (address: string) => Promise<void>;
  /** Rejects with the words to show when the code is wrong or could not be checked. */
  onCheckCode: (code: string) => Promise<boolean>;
  /** Signs in with Google; rejects with the words to show. */
  onGoogle?: () => Promise<void>;
}) {
  const [step, setStep] = useState<MagicLinkStep>('email');

  useEffect(() => {
    if (!open) setStep('email');
  }, [open]);

  useEffect(() => {
    if (step !== 'success') return;
    const timer = window.setTimeout(onClose, WELCOME_MS);
    return () => window.clearTimeout(timer);
  }, [step, onClose]);

  return <Modal open={open} onClose={onClose} bare maxWidth={420} maxHeight="calc(100vh - 3rem)" title="Sign in or make an account">
    <MagicLinkOtpLogin
      appName="mumoo"
      logo={<img src="/brand/mumoo-logo.png" alt="" className="h-3.5 w-auto" />}
      onStepChange={setStep}
      onSendCode={onSendCode}
      onResend={onSendCode}
      onVerifyCode={onCheckCode}
      onGoogle={onGoogle}
      {...(reason ? { title: reason.title, lead: reason.lead } : {})}
    />
    {!hideTerms && <p className="mt-4 text-center text-xs text-muted-foreground">By continuing you agree to our <a className="text-foreground underline underline-offset-4" href={TERMS_URL} target="_blank" rel="noreferrer">Terms</a> and <a className="text-foreground underline underline-offset-4" href={PRIVACY_URL} target="_blank" rel="noreferrer">Privacy Policy</a>.</p>}
  </Modal>;
}
