import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";

export function ConsentModal({
  isOpen,
  onClose,
  onAccept,
  busy = false,
  clinician = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  onAccept: () => void;
  busy?: boolean;
  clinician?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hasScrolledToEnd, setHasScrolledToEnd] = useState(false);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      setHasScrolledToEnd(false);
      setAgreed(false);
      dialog.showModal();
      // Check if content fits without scrolling on tall viewports
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el && el.scrollHeight <= el.clientHeight + 20) {
          setHasScrolledToEnd(true);
        }
      });
    } else {
      dialog.close();
    }
  }, [isOpen]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el || hasScrolledToEnd) return;
    const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 20;
    if (atBottom) {
      setHasScrolledToEnd(true);
    }
  };

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="consent-title"
      onCancel={onClose}
      className="m-auto w-[min(100%-2rem,40rem)] max-h-[90vh] rounded-card bg-bg p-6 sm:p-7 text-ink shadow-float backdrop:bg-scrim flex flex-col"
    >
      <div className="flex items-start justify-between gap-4 pb-2">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-cream px-3 py-1 text-[0.8rem] font-semibold text-cream-ink">
            DPDP Act, 2023 Notice (India)
          </div>
          <h2 id="consent-title" className="text-title font-semibold text-ink mt-2">
            Explicit Consent &amp; Terms of Service
          </h2>
          <p className="text-[0.9rem] text-ink-soft mt-0.5">
            Please review how your voice and health data are processed under India's Digital Personal Data Protection Act, 2023.
          </p>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        tabIndex={0}
        role="region"
        aria-label="Statutory DPDP consent terms"
        className="mt-3 flex-1 overflow-y-auto max-h-[46vh] rounded-card border border-edge bg-surface p-4 text-[0.92rem] leading-relaxed text-ink space-y-4 focus:outline-none focus:ring-2 focus:ring-focus"
      >
        <section>
          <h3 className="font-semibold text-ink text-[0.98rem]">1. Notice of Data Collection (Section 5, DPDP Act 2023)</h3>
          <p className="mt-1 text-ink-soft">
            Before creating an account on Epako Voice, you are informed that the following personal and sensitive data are collected and processed:
          </p>
          <ul className="list-disc pl-5 mt-1 space-y-1 text-ink-soft">
            <li>
              <strong className="text-ink">Voice Audio Waveforms:</strong> Spoken audio recordings captured via your device microphone during live speech rectification, practice exercises, or voice banking.
            </li>
            <li>
              <strong className="text-ink">Acoustic Speech Biomarkers:</strong> Real-time numerical measures including articulation velocity, phonatory stability index, vocal jitter and shimmer percentages, fundamental frequency (F0), and vowel space dispersion.
            </li>
            <li>
              <strong className="text-ink">Phonetic Learning History:</strong> Transcriptions, confirmed words, and personalized speech repair substitutions taught to the system to adapt to your speech pattern.
            </li>
            <li>
              <strong className="text-ink">Account Credentials:</strong> Your email address and cryptographically hashed password. We never ask for or store your legal name for patient accounts.
            </li>
          </ul>
        </section>

        <section>
          <h3 className="font-semibold text-ink text-[0.98rem]">2. Specific Purpose of Processing (Section 5(1)(a))</h3>
          <p className="mt-1 text-ink-soft">
            Your personal speech and biomarker data are processed exclusively for:
          </p>
          <ul className="list-disc pl-5 mt-1 space-y-1 text-ink-soft">
            <li>Real-time automated dysarthric speech recognition, phonetic repair, and synthetic voice reconstruction.</li>
            <li>Generating longitudinal clinical progress metrics and acoustic charts for speech rehabilitation.</li>
            <li>
              {clinician
                ? "Authorised clinical review of shared patient practice sessions and assessment documentation."
                : "Secure, patient-consented sharing with speech therapists and clinicians you explicitly link via access codes."}
            </li>
          </ul>
          <p className="mt-1 text-ink-soft">
            Your audio and data are <strong className="text-ink">never sold</strong>, never shared with third-party advertisers, and never transmitted to external commercial AI platforms.
          </p>
        </section>

        <section>
          <h3 className="font-semibold text-ink text-[0.98rem]">3. Data Sovereignty, Retention &amp; Ephemeral Processing (Section 5(1)(b))</h3>
          <p className="mt-1 text-ink-soft">
            All data are hosted securely within the sovereign territory of the Republic of India (Supabase Mumbai AWS Region, ap-south-1).
          </p>
          <p className="mt-1 text-ink-soft">
            <strong className="text-ink">Ephemeral Audio Default:</strong> Speech recordings are processed in volatile memory on our speech gateway and immediately discarded. Audio files are stored in persistent cloud storage <strong className="text-ink">only if you explicitly enable "Save my recordings"</strong> in your account settings or during onboarding.
          </p>
        </section>

        <section>
          <h3 className="font-semibold text-ink text-[0.98rem]">4. Your Statutory Rights as a Data Principal</h3>
          <p className="mt-1 text-ink-soft">
            Under Chapter III of the Digital Personal Data Protection Act, 2023, you hold the following rights:
          </p>
          <ul className="list-disc pl-5 mt-1 space-y-1 text-ink-soft">
            <li><strong className="text-ink">Right to Access:</strong> View all stored sessions, utterances, and biomarker reports at any time.</li>
            <li><strong className="text-ink">Right to Erasure &amp; Correction:</strong> Irreversibly delete your account, audio files, biomarker history, and learned corrections immediately via "Me" &gt; "Delete my account and data".</li>
            <li><strong className="text-ink">Right to Withdraw Consent:</strong> Withdraw your consent for audio storage or processing at any time as easily as it was given, with immediate effect.</li>
            <li><strong className="text-ink">Right of Grievance Redressal:</strong> Submit grievances regarding data handling to our Grievance Officer, with escalation to the Data Protection Board of India if unresolved.</li>
            <li><strong className="text-ink">Right to Nominate:</strong> Designate a nominated representative to act on your behalf in the event of incapacity or death.</li>
          </ul>
        </section>

        <section>
          <h3 className="font-semibold text-ink text-[0.98rem]">5. Clinical Disclaimer &amp; Terms</h3>
          <p className="mt-1 text-ink-soft">
            Epako Voice is an assistive communication and speech therapy practice aid. It is <strong className="text-ink">not a certified medical device</strong> and does not provide clinical diagnoses. Automated biomarker metrics are computational estimates for educational and practice review.
          </p>
        </section>
      </div>

      <div className="mt-3">
        {!hasScrolledToEnd ? (
          <div className="flex items-center gap-2 rounded-lg bg-surface border border-edge px-3 py-2 text-[0.85rem] text-ink-soft">
            <span className="text-secondary font-bold">↓</span>
            <span>Please scroll to the bottom of the notice above to review all terms before continuing.</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg bg-surface border border-moss px-3 py-2 text-[0.85rem] text-moss-ink font-medium">
            <span>✓</span>
            <span>You have reached the end of the notice. Please check the agreement box below.</span>
          </div>
        )}

        <label className="mt-3 flex items-start gap-3 select-none cursor-pointer">
          <input
            type="checkbox"
            id="dpdp-consent-checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            disabled={!hasScrolledToEnd || busy}
            className="mt-0.5 h-5 w-5 rounded border-edge text-primary focus:ring-focus cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
          />
          <span className={`text-[0.9rem] leading-snug ${hasScrolledToEnd ? "text-ink font-medium" : "text-ink-soft"}`}>
            I have read and agree to the Terms of Service, Privacy Policy, and provide explicit consent for processing my voice and speech biomarker data under India's DPDP Act, 2023.
          </span>
        </label>
      </div>

      <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2 border-t border-edge">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={onAccept}
          disabled={!hasScrolledToEnd || !agreed || busy}
        >
          {busy ? "Creating your account…" : "Agree & Create Account"}
        </Button>
      </div>
    </dialog>
  );
}

