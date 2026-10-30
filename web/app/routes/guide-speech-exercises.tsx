import { Link } from "react-router";
import { ButtonLink } from "~/components/Button";
import { ProsePage, Section } from "~/components/Prose";
import type { Route } from "./+types/guide-speech-exercises";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Daily Speech Practice Exercises for Parkinson's, ALS, and Stroke — Epako Voice" },
    {
      name: "description",
      content:
        "Evidence-based daily speech therapy exercises for individuals with dysarthria: breath control, vocal warm-ups, articulatory exaggeration, and pacing strategies.",
    },
    {
      name: "keywords",
      content:
        "speech exercises dysarthria, Parkinson's speech exercises, ALS speech practice, stroke speech therapy exercises, LSVT loud techniques, dysarthria home exercises",
    },
    { property: "og:title", content: "Daily Speech Practice Exercises for Parkinson's, ALS, and Stroke" },
    {
      property: "og:description",
      content:
        "A daily speech workout designed to build vocal endurance, improve articulatory precision, and reduce speaking fatigue.",
    },
    { property: "og:type", content: "article" },
  ];
}

export default function GuideSpeechExercises() {
  return (
    <ProsePage
      title="Daily Speech Practice Exercises for Motor Speech"
      summary={
        <p>
          Consistent daily vocal practice helps maintain neural pathways, strengthens respiratory support, and preserves
          speech clarity. Here are four foundational exercises designed for home practice alongside your speech clinician.
        </p>
      }
    >
      <Section title="Before You Begin: The 'Pacing' Principle">
        <p>
          For individuals with neurological conditions like Parkinson's or ALS, the goal of practice is <em>coordination and breath support</em>,
          not physical exhaustion. If you feel dizzy or vocal strain, stop and rest. Perform these exercises in 5–10 minute intervals twice a day.
        </p>
      </Section>

      <Section title="Exercise 1: Diaphragmatic Breath & Sustained Phonation">
        <p>
          Speech is powered by airflow. Shallow chest breathing reduces sentence length and causes words to trail off.
        </p>
        <ol className="list-decimal pl-6 space-y-2 mt-2">
          <li>Sit upright with shoulders relaxed. Place one hand on your abdomen (belly).</li>
          <li>Inhale slowly through your nose, feeling your belly expand outward rather than raising your shoulders.</li>
          <li>On the exhale, produce a sustained, steady <strong>"Ahhh"</strong> at a comfortable pitch and volume.</li>
          <li>Aim for a steady 10 to 15 seconds without letting the pitch wobble or drop off. Repeat 5 times.</li>
        </ol>
      </Section>

      <Section title="Exercise 2: Pitch Glides (Vocal Range Flexibility)">
        <p>
          Monotone pitch is a hallmark of hypokinetic dysarthria. Pitch glides exercise the cricothyroid muscle and expand intonational dynamic range:
        </p>
        <ol className="list-decimal pl-6 space-y-2 mt-2">
          <li>Take a gentle diaphragmatic breath.</li>
          <li>Starting at your lowest comfortable pitch, glide your voice upward like a siren to your highest comfortable note on the sound <strong>"Ooo"</strong>.</li>
          <li>Pause at the top, take a breath, and glide smoothly from high to low.</li>
          <li>Repeat 5 upward and 5 downward glides. Keep the movement fluid and avoid straining your throat.</li>
        </ol>
      </Section>

      <Section title="Exercise 3: Articulatory 'Over-Enunciation'">
        <p>
          Because dysarthria causes consonants to round off (undershoot), practicing exaggerated oral movements retrains muscular precision:
        </p>
        <ul className="list-disc pl-6 space-y-2 mt-2">
          <li>
            <strong>Lip Precision (P, B, M):</strong> Repeat rapidly with distinct lip contact:  
            <em>"Pa-Pa-Pa... Ba-Ba-Ba... Ma-Ma-Ma"</em> (10 times each).
          </li>
          <li>
            <strong>Tongue Tip Precision (T, D, N):</strong> Tap the roof of your mouth firmly behind your upper front teeth:  
            <em>"Ta-Ta-Ta... Da-Da-Da... Na-Na-Na"</em> (10 times each).
          </li>
          <li>
            <strong>Back of Tongue (K, G):</strong> Contract the back of your tongue against the soft palate:  
            <em>"Ka-Ka-Ka... Ga-Ga-Ga"</em> (10 times each).
          </li>
          <li>
            <strong>The Triplet (Pa-Ta-Ka):</strong> Combine all three positions into one sequential rhythm:  
            <em>"Pa-Ta-Ka, Pa-Ta-Ka, Pa-Ta-Ka"</em>. Focus on crispness rather than pure speed.
          </li>
        </ul>
      </Section>

      <Section title="Exercise 4: Functional Phrases with Intent">
        <p>
          Practice speaking everyday phrases with "intent" and elevated volume (inspired by the Lee Silverman Voice Treatment principles):
        </p>
        <ul className="list-disc pl-6 space-y-1 mt-2 italic text-ink">
          <li>"Good morning! How are you today?"</li>
          <li>"I would like a glass of cold water, please."</li>
          <li>"Let's go for a walk in the garden."</li>
          <li>"Thank you very much for your help."</li>
        </ul>
        <div className="mt-6 rounded-input bg-surface p-6 border border-edge">
          <h3 className="text-title font-semibold text-ink">Practice real-time with Epako Voice</h3>
          <p className="mt-2 text-ink-soft">
            Epako Voice provides real-time speech repair and acoustic bio-telemetry. Listen to your corrected speech in your chosen natural voice.
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
          <Link to="/guides/acoustic-biomarkers" className="text-link underline underline-offset-4 font-medium">
            → Understanding Acoustic Biomarkers: F0, Jitter, Shimmer, and FCI
          </Link>
        </div>
      </Section>
    </ProsePage>
  );
}

