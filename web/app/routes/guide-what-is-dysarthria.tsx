import { Link } from "react-router";
import { ButtonLink } from "~/components/Button";
import { ProsePage, Section } from "~/components/Prose";
import type { Route } from "./+types/guide-what-is-dysarthria";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "What is Dysarthria? Symptoms, Causes, and Speech Therapy Options — Epako Voice" },
    {
      name: "description",
      content:
        "Learn about dysarthria: motor speech symptoms, causes (ALS, Parkinson's, stroke, cerebral palsy), diagnostic evaluations, and how assistive speech recognition aids everyday conversation.",
    },
    {
      name: "keywords",
      content:
        "what is dysarthria, dysarthria symptoms, motor speech disorder, dysarthria vs apraxia, speech therapy for dysarthria, ALS slurred speech, Parkinson's speech disorder",
    },
    { property: "og:title", content: "What is Dysarthria? Symptoms, Causes, and Speech Therapy Options" },
    {
      property: "og:description",
      content:
        "A clinical and practical guide to motor speech disorders, therapeutic strategies, and modern assistive speech technology.",
    },
    { property: "og:type", content: "article" },
  ];
}

export default function GuideWhatIsDysarthria() {
  return (
    <ProsePage
      title="What is Dysarthria? Symptoms, Causes, and Therapy Aids"
      summary={
        <p>
          Dysarthria is a motor speech disorder caused by neurological damage that affects the muscles used for speaking.
          While it can make everyday communication frustrating, speech therapy and assistive technology can restore
          clarity and confidence.
        </p>
      }
    >
      <Section title="Understanding Dysarthria">
        <p>
          Unlike aphasia (a disorder of language comprehension and word retrieval) or apraxia of speech (a motor planning
          disorder), dysarthria is an execution problem. The speaker knows exactly what they want to say, but the muscles
          controlling respiration, phonation, resonance, and articulation do not move with normal speed, strength, or
          coordination.
        </p>
      </Section>

      <Section title="Common Symptoms">
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Slurred or Imprecise Speech:</strong> Consonants may sound muffled or blend together (articulatory undershoot).</li>
          <li><strong>Changes in Speaking Rate:</strong> Abnormally slow speech (bradylalia) or rapid, short rushes of words.</li>
          <li><strong>Reduced Vocal Volume:</strong> Speaking quietly or with a strained, hoarse, or breathy vocal quality.</li>
          <li><strong>Irregular Phonation:</strong> Vocal tremors, involuntary pitch breaks, or monotone intonation.</li>
          <li><strong>Vocal Fatigue:</strong> Physical tiredness or muscle strain after speaking for just a few minutes.</li>
        </ul>
      </Section>

      <Section title="Underlying Causes">
        <p>
          Dysarthria can be congenital (present from birth, as in cerebral palsy) or acquired later in life due to neurological
          conditions:
        </p>
        <ul className="list-disc pl-6 space-y-2 mt-2">
          <li><strong>Amyotrophic Lateral Sclerosis (ALS / MND):</strong> Progressive weakness affecting bulbar and respiratory speech musculature.</li>
          <li><strong>Parkinson's Disease:</strong> Hypokinetic dysarthria characterized by reduced vocal intensity, monotonic pitch, and imprecise articulation.</li>
          <li><strong>Stroke or Brain Injury:</strong> Sudden-onset weakness on one or both sides of the oral-motor mechanism.</li>
          <li><strong>Multiple Sclerosis (MS):</strong> Ataxic or spastic dysarthria leading to scanning speech and irregular articulation breakdowns.</li>
        </ul>
      </Section>

      <Section title="How Modern Assistive Technology Helps">
        <p>
          Standard speech recognition systems (like generic phone assistants) fail on dysarthric speech because they were
          trained entirely on typical articulation. Epako Voice addresses this by utilizing acoustic models specifically
          trained on clinical dysarthric speech data (FastConformer Parakeet-TDT).
        </p>
        <p className="mt-2">
          Instead of replacing speech with slow typing, Epako listens to your natural voice, tidies up involuntary syllable
          repetitions or stutters, and speaks your message aloud in a clear, natural voice of your choosing.
        </p>
        <div className="mt-6 rounded-input bg-surface p-6 border border-edge">
          <h3 className="text-title font-semibold text-ink">Ready to practice speaking?</h3>
          <p className="mt-2 text-ink-soft">
            Epako Voice is free to try directly in your browser. Practice at your own pace with no rush.
          </p>
          <div className="mt-4">
            <ButtonLink to="/sign-up">Practice with Epako Voice Free</ButtonLink>
          </div>
        </div>
      </Section>

      <Section title="Related Resources">
        <div className="flex flex-col gap-2 mt-2">
          <Link to="/guides/acoustic-biomarkers" className="text-link underline underline-offset-4 font-medium">
            → Understanding Acoustic Biomarkers: F0, Jitter, Shimmer, and FCI
          </Link>
          <Link to="/guides/speech-exercises" className="text-link underline underline-offset-4 font-medium">
            → Daily Speech Practice Exercises for Parkinson's, ALS, and Stroke
          </Link>
        </div>
      </Section>
    </ProsePage>
  );
}
