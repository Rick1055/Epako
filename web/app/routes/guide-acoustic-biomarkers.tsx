import { Link } from "react-router";
import { ButtonLink } from "~/components/Button";
import { ProsePage, Section } from "~/components/Prose";
import type { Route } from "./+types/guide-acoustic-biomarkers";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Understanding Acoustic Biomarkers: F0, Jitter, Shimmer, and FCI — Epako Voice" },
    {
      name: "description",
      content:
        "Learn how speech-language pathologists track dysarthria progress using acoustic biomarkers: fundamental frequency (F0), phonatory instability (jitter, shimmer), and formant compression.",
    },
    {
      name: "keywords",
      content:
        "acoustic biomarkers, dysarthria telemetry, formant centralization ratio, jitter shimmer speech, fundamental frequency F0, speech-language pathology metrics, speech motor tracking",
    },
    { property: "og:title", content: "Understanding Acoustic Biomarkers: F0, Jitter, Shimmer, and FCI" },
    {
      property: "og:description",
      content:
        "An in-depth explanation of objective acoustic telemetry used by speech clinicians to measure motor stability, vocal strain, and articulatory precision.",
    },
    { property: "og:type", content: "article" },
  ];
}

export default function GuideAcousticBiomarkers() {
  return (
    <ProsePage
      title="Understanding Acoustic Biomarkers in Motor Speech"
      summary={
        <p>
          Objective acoustic biomarkers provide clinicians and patients with hard telemetry about speech motor control.
          Here is an explanation of what Fundamental Frequency (F0), Jitter, Shimmer, and the Formant Compression Index (FCI)
          measure during speech therapy.
        </p>
      }
    >
      <Section title="Why Objective Telemetry Matters">
        <p>
          Historically, speech therapists evaluated dysarthria using subjective perceptual rating scales (e.g., assessing
          how "rough" or "slurred" speech sounded to the human ear). While clinical perception is vital, acoustic biomarkers
          turn sound waves into millisecond-accurate mathematical measurements, allowing Speech-Language Pathologists (SLPs)
          to catch subtle motor improvements or disease progression weeks before they are audible.
        </p>
      </Section>

      <Section title="1. Fundamental Frequency (F0) & Pitch Stability">
        <p>
          <strong>Fundamental Frequency (F0)</strong> is the rate at which your vocal cords (vocal folds) vibrate per second,
          measured in Hertz (Hz). For adult males, conversational F0 typically sits between 90 Hz and 160 Hz; for adult females,
          between 165 Hz and 255 Hz.
        </p>
        <p className="mt-2">
          In motor speech disorders like Parkinson's, F0 variation often compresses, causing monotone speech (hypophonia). In
          other conditions, muscle spasms create sudden uncontrolled pitch breaks. Epako Voice tracks median F0 and pitch
          variability over time to evaluate vocal range.
        </p>
      </Section>

      <Section title="2. Phonatory Instability: Jitter & Shimmer">
        <p>
          Healthy vocal cords vibrate with high regularity. When neurological pathways to the larynx are impaired, micro-tremors
          and air leakage introduce cycle-to-cycle instability:
        </p>
        <ul className="list-disc pl-6 space-y-2 mt-2">
          <li>
            <strong>Jitter (Frequency Perturbation):</strong> Measures cycle-to-cycle variations in the period of vocal cord vibration.
            Elevated jitter (&gt; 1.0%) correlates clinically with hoarseness, vocal fatigue, and laryngeal ataxia.
          </li>
          <li>
            <strong>Shimmer (Amplitude Perturbation):</strong> Measures cycle-to-cycle variations in the amplitude (loudness) of sound waves.
            Elevated shimmer (&gt; 3.8%) indicates glottal closure insufficiency or breathy vocal quality.
          </li>
        </ul>
      </Section>

      <Section title="3. Formant Compression Index (FCI) & Articulation">
        <p>
          When you speak vowels (like <em>/i/</em> as in "see", <em>/u/</em> as in "too", or <em>/a/</em> as in "father"), your tongue, lips, and
          jaw shape acoustic resonance frequencies known as <strong>formants</strong>:
        </p>
        <ul className="list-disc pl-6 space-y-2 mt-2">
          <li><strong>First Formant (F1):</strong> Reflects jaw opening and tongue height.</li>
          <li><strong>Second Formant (F2):</strong> Reflects tongue advancement (front vs. back).</li>
        </ul>
        <p className="mt-2">
          In dysarthria, restricted tongue mobility leads to <em>articulatory undershoot</em>. The speaker's vowels drift toward a neutral
          central sound (the "schwa"), shrinking the acoustic vowel space. Epako Voice computes the Formant Compression Index
          via Linear Predictive Coding (LPC) to quantify articulatory range.
        </p>
      </Section>

      <Section title="4. Articulation Velocity & Pause Ratio">
        <p>
          Acoustic envelope tracking isolates active phonation from involuntary pauses. By counting syllable peaks and comparing
          active speaking time against silence, Epako computes:
        </p>
        <ul className="list-disc pl-6 space-y-2 mt-2">
          <li><strong>Articulation Velocity:</strong> Pure speaking speed in syllables per second during active phonation.</li>
          <li><strong>Pause Ratio (%):</strong> The percentage of conversational time spent in respiratory or motor hesitations.</li>
        </ul>
        <div className="mt-6 rounded-input bg-surface p-6 border border-edge">
          <h3 className="text-title font-semibold text-ink">Track your acoustic progress</h3>
          <p className="mt-2 text-ink-soft">
            Epako Voice automatically charts your acoustic biomarkers across practice sessions and generates longitudinal clinical reports.
          </p>
          <div className="mt-4">
            <ButtonLink to="/sign-up">Practice with Epako Voice Free</ButtonLink>
          </div>
        </div>
      </Section>

      <Section title="Related Resources">
        <div className="flex flex-col gap-2 mt-2">
          <Link to="/guides/what-is-dysarthria" className="text-link underline underline-offset-4 font-medium">
            → What is Dysarthria? Symptoms, Causes, and Therapy Aids
          </Link>
          <Link to="/guides/speech-exercises" className="text-link underline underline-offset-4 font-medium">
            → Daily Speech Practice Exercises for Parkinson's, ALS, and Stroke
          </Link>
        </div>
      </Section>
    </ProsePage>
  );
}
