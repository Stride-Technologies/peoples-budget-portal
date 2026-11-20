'use client';

import { useState, useEffect } from 'react';
import { MessageSquarePlus, Send, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { RegistryFeedbackCategory } from '@/lib/api';
import { loadRecaptchaScript, executeRecaptcha } from '@/lib/recaptcha';
import { BrandText } from '@/components/brand/brand-text';
import { GOAL } from '@/lib/goal-label';
import { LguWord } from '@/components/brand/brand-text';


const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? '';

const MAX_MESSAGE = 2000;
const MIN_WORDS = 10;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const CATEGORIES: { value: RegistryFeedbackCategory; label: string }[] = [
  { value: 'GENERAL', label: 'General Feedback' },
  { value: 'BUDGET_TRANSPARENCY', label: 'Budget Transparency' },
  { value: 'FINISH_LINE_PROGRESS', label: `${GOAL} Progress` },
  { value: 'PROGRAM_SUGGESTION', label: 'Suggest a Program' },
  { value: 'OTHER', label: 'Other' },
];

interface PublicRegistryFeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (dto: {
    submitterName?: string;
    submitterEmail?: string;
    category?: RegistryFeedbackCategory;
    message: string;
    recaptchaToken: string;
    website?: string;
  }) => Promise<{ success: boolean } | { error: string }>;
  /** Defaults to the AIP page's own copy — pass to reuse this dialog elsewhere. */
  subtitle?: string;
  messagePlaceholder?: string;
  /** Hide the category picker when the target endpoint has no category field (e.g. per-project feedback). */
  showCategory?: boolean;
}

export function PublicRegistryFeedbackDialog({
  open,
  onOpenChange,
  onSubmit,
  subtitle = 'Annual Investment Program · Public Feedback',
  messagePlaceholder = 'Share your thoughts about the AIP…',
  showCategory = true,
}: PublicRegistryFeedbackDialogProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState<RegistryFeedbackCategory>('GENERAL');
  const [message, setMessage] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load reCAPTCHA script when the dialog opens for the first time (D15).
  useEffect(() => {
    if (open && RECAPTCHA_SITE_KEY) void loadRecaptchaScript(RECAPTCHA_SITE_KEY);
  }, [open]);

  const emailValid = email === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const wordCount = countWords(message);
  const meetsWordMin = wordCount >= MIN_WORDS;
  const canSubmit =
    meetsWordMin &&
    message.length <= MAX_MESSAGE &&
    emailValid &&
    !busy;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    let recaptchaToken = '';
    try {
      recaptchaToken = RECAPTCHA_SITE_KEY
        ? await executeRecaptcha(RECAPTCHA_SITE_KEY, 'submit_feedback')
        : 'dev-no-key';
    } catch {
      // Distinct from the server rejecting a token: here the check never ran,
      // which is almost always a blocked script rather than anything the
      // citizen typed. Saying "try again" alone sent people in circles.
      setError(
        'We could not run the spam check. If your browser blocks Google reCAPTCHA, allow it for this site and try again.',
      );
      setBusy(false);
      return;
    }
    const result = await onSubmit({
      submitterName: name.trim() || undefined,
      submitterEmail: email.trim() || undefined,
      category: showCategory ? category : undefined,
      message: message.trim(),
      recaptchaToken,
      website: honeypot || undefined,
    });
    setBusy(false);
    if ('error' in result) {
      setError(result.error);
    } else {
      setSubmitted(true);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      // Reset form when closing
      setTimeout(() => {
        setName('');
        setEmail('');
        setCategory('GENERAL');
        setMessage('');
        setHoneypot('');
        setError(null);
        setSubmitted(false);
      }, 200);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50">
              <MessageSquarePlus className="h-4.5 w-4.5 text-blue-600" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">Share Your Feedback</DialogTitle>
              <p className="text-xs text-slate-500">{subtitle}</p>
            </div>
          </div>
        </DialogHeader>

        {submitted ? (
          <div className="py-6 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" />
            <p className="font-medium text-slate-800">Thank you for your feedback!</p>
            <p className="mt-1 text-sm text-slate-500">
              Your submission has been received and will be reviewed by the <BrandText field="government" />.
            </p>
            <Button className="mt-5" onClick={() => handleOpenChange(false)}>
              Close
            </Button>
          </div>
        ) : (
          <form
            onSubmit={(e) => { void handleSubmit(e); }}
            className="space-y-4"
          >
            <DialogDescription className="text-sm text-slate-600">
              As a citizen of <BrandText field="placeName" />, your voice matters in shaping the Annual Investment Program. Share your thoughts, suggestions, or concerns.
            </DialogDescription>

            {/* Name + Email */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="rf-name" className="text-xs font-medium text-slate-700">
                  Name <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <Input
                  id="rf-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="h-9 text-sm"
                  disabled={busy}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="rf-email" className="text-xs font-medium text-slate-700">
                  Email <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <Input
                  id="rf-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className={cn(
                    'h-9 text-sm',
                    email && !emailValid && 'border-red-400 focus-visible:ring-red-400',
                  )}
                  disabled={busy}
                />
                {email && !emailValid && (
                  <p className="text-xs text-red-500">Enter a valid email address.</p>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-400">Include your email if you&apos;d like a response from the <LguWord k="lgu" />.</p>

            {/* Category pills */}
            {showCategory && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-700">Feedback Category</p>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      disabled={busy}
                      onClick={() => setCategory(c.value)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:opacity-50',
                        category === c.value
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600',
                      )}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Message */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="rf-message" className="text-xs font-medium text-slate-700">
                  Message <span className="text-red-500">*</span>
                </label>
                <span className={cn(
                  'text-xs tabular-nums',
                  message.length > MAX_MESSAGE ? 'text-red-500' : meetsWordMin ? 'text-emerald-600' : 'text-slate-400',
                )}>
                  {wordCount} / {MIN_WORDS} words
                </span>
              </div>
              <Textarea
                id="rf-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={messagePlaceholder}
                rows={4}
                className={cn(
                  'resize-none text-sm',
                  message.length > MAX_MESSAGE && 'border-red-400 focus-visible:ring-red-400',
                )}
                disabled={busy}
                required
              />
            </div>

            {/* Honeypot — CSS-hidden; filled only by bots (D17, D18). */}
            <div style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }} aria-hidden="true">
              <label htmlFor="rf-website">Website</label>
              <input
                id="rf-website"
                name="website"
                type="text"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
              />
            </div>

            {error && (
              <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">
                {error}
              </p>
            )}

            <DialogFooter className="flex items-center justify-between gap-3 pt-1">
              {/* <p className="text-xs text-slate-400">
                Reviewed by <LguWord k="LguAdj" /> Budget Office staff
              </p> */}
              <div className="flex items-center gap-2">
                <Button
                  id="rf-cancel"
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenChange(false)}
                  disabled={busy}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={!canSubmit}>
                  {busy
                    ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    : <Send className="mr-1.5 h-3.5 w-3.5" />}
                  Submit
                </Button>
              </div>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
