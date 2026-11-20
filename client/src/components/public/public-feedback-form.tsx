'use client';

import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle2, ThumbsUp, ThumbsDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProgramFeedbackCategory, ProgramCommentSentiment } from '@/lib/api';
import { loadRecaptchaScript, executeRecaptcha } from '@/lib/recaptcha';
import { LguWord } from '@/components/brand/brand-text';

const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? '';

const MAX_MESSAGE = 2000;
const MIN_WORDS = 10;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const CATEGORIES: { value: ProgramFeedbackCategory; label: string }[] = [
  { value: 'GENERAL', label: 'General inquiry' },
  { value: 'SUGGESTION', label: 'Recommend a program' },
  { value: 'CONCERN', label: 'Raise a concern' },
  { value: 'OTHER', label: 'Others' },
];

interface PublicFeedbackFormProps {
  onSubmit: (dto: {
    submitterName?: string;
    submitterEmail?: string;
    message: string;
    category?: ProgramFeedbackCategory;
    sentiment?: ProgramCommentSentiment;
    recaptchaToken: string;
    website?: string;
  }) => Promise<{ success: boolean } | { error: string }>;
  onSuccess?: () => void;
}

export function PublicFeedbackForm({ onSubmit, onSuccess }: PublicFeedbackFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState<ProgramFeedbackCategory | ''>('');
  const [sentiment, setSentiment] = useState<ProgramCommentSentiment | null>(null);
  const [honeypot, setHoneypot] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load reCAPTCHA script when the form first mounts (D15).
  useEffect(() => {
    if (RECAPTCHA_SITE_KEY) void loadRecaptchaScript(RECAPTCHA_SITE_KEY);
  }, []);

  const emailValid = email === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const wordCount = countWords(message);
  const meetsWordMin = wordCount >= MIN_WORDS;
  const canSubmit =
    meetsWordMin &&
    message.length <= MAX_MESSAGE &&
    emailValid &&
    !busy;

  const handleSubmit = async (e: FormEvent) => {
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
      message: message.trim(),
      category: category || undefined,
      sentiment: sentiment ?? undefined,
      recaptchaToken,
      website: honeypot || undefined,
    });
    setBusy(false);
    if ('error' in result) {
      setError(result.error);
    } else {
      setSubmitted(true);
      onSuccess?.();
    }
  };

  if (submitted) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
        Thank you for your feedback. It has been submitted successfully.
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => { void handleSubmit(e); }}
      className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4"
    >
      {/* Sentiment — prominent first question */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-slate-700">
          Do you support this program?{' '}
          <span className="font-normal text-slate-400">(optional)</span>
        </p>
        <div className="flex gap-2">
          {(
            [
              { value: 'POSITIVE', icon: ThumbsUp, label: 'Support', active: 'bg-green-500 border-green-500 text-white' },
              { value: 'NEGATIVE', icon: ThumbsDown, label: 'Oppose', active: 'bg-red-500 border-red-500 text-white' },
            ] as const
          ).map(({ value, icon: Icon, label, active }) => (
            <button
              key={value}
              type="button"
              onClick={() => setSentiment(sentiment === value ? null : value)}
              disabled={busy}
              className={cn(
                'flex items-center gap-2 rounded-md border px-4 py-2 text-xs font-medium transition-colors',
                sentiment === value
                  ? active
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Message — required, immediately after sentiment */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label htmlFor="feedback-message" className="text-xs font-medium text-slate-700">
            Message <span className="text-red-500">*</span>
          </label>
          <span
            className={cn(
              'text-xs tabular-nums',
              message.length > MAX_MESSAGE ? 'text-red-500' : meetsWordMin ? 'text-emerald-600' : 'text-slate-400',
            )}
          >
            {wordCount} / {MIN_WORDS} words
          </span>
        </div>
        <Textarea
          id="feedback-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Share your thoughts about this program..."
          rows={4}
          className={cn(
            'resize-none text-sm',
            message.length > MAX_MESSAGE && 'border-red-400 focus-visible:ring-red-400',
          )}
          disabled={busy}
          required
        />
      </div>

      {/* Optional details — visually quiet, below the fold */}
      <div className="space-y-3 border-t border-slate-200 pt-3">
        {/* Category — demoted: smaller pills, no icons */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-slate-600">Type (optional)</p>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setCategory(category === value ? '' : value)}
                disabled={busy}
                className={cn(
                  'rounded-md border px-2.5 py-1 text-xs transition-colors',
                  category === value
                    ? 'border-slate-500 bg-slate-100 font-medium text-slate-800'
                    : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-400',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Name + Email */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="feedback-name" className="text-xs font-medium text-slate-600">
              Name (optional)
            </label>
            <Input
              id="feedback-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="h-8 text-sm"
              disabled={busy}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="feedback-email" className="text-xs font-medium text-slate-600">
              Email (optional)
            </label>
            <Input
              id="feedback-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className={cn(
                'h-8 text-sm',
                email && !emailValid && 'border-red-400 focus-visible:ring-red-400',
              )}
              disabled={busy}
            />
            {email && !emailValid ? (
              <p className="text-xs text-red-500">Enter a valid email address.</p>
            ) : (
              <p className="text-xs text-slate-400">Include your email if you&apos;d like a response from the <LguWord k="lgu" />.</p>
            )}
          </div>
        </div>
      </div>

      {/* Honeypot — CSS-hidden; filled only by bots (D17, D18). Not type=hidden. */}
      <div style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }} aria-hidden="true">
        <label htmlFor="feedback-website">Website</label>
        <input
          id="feedback-website"
          name="website"
          type="text"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
      )}

      <div className="flex items-center justify-between gap-4">
        {/* <p className="text-xs text-slate-400">
          Feedback is reviewed by the <LguWord k="LguAdj" /> Budget Office.
        </p> */}
        <Button type="submit" size="sm" disabled={!canSubmit} className="h-8 shrink-0 text-xs">
          {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Submit Feedback
        </Button>
      </div>
    </form>
  );
}
