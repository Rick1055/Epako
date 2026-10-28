import { Link } from "react-router";

import { ProsePage, Section } from "~/components/Prose";
import { contact } from "~/lib/site";
import type { GardenHandle } from "~/three/GardenHost";
import type { Route } from "./+types/accessibility";

export const handle: GardenHandle = { garden: { stop: "hedgewalk" } };

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Accessibility - Epako Voice" },
    { name: "description", content: "How Epako Voice is built to be usable by everyone, what we know isn't perfect yet, and how to tell us about a problem." },
  ];
}

export default function Accessibility() {
  return (
    <ProsePage
      title="Made to be easy to use."
      summary={<p>We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA, everywhere in the app.</p>}
    >
      <Section title="What we've done">
        <ul>
          <li>Large, plain text in a typeface made for easy reading, never smaller than 16 pixels, with a larger text setting in Me.</li>
          <li>Colours checked for contrast in both the morning and evening looks.</li>
          <li>Big buttons and controls, at least 48 pixels, so they're easy to press with a shaky hand.</li>
          <li>Everything works with a keyboard and with screen readers; the moving garden is hidden from screen readers.</li>
          <li>You can type instead of speaking whenever you need to fix a phrase.</li>
          <li>Your device's reduce-motion setting is respected, and Me lets you swap the moving garden for a still picture.</li>
          <li>Garden sounds can be turned off with one press from the top of every page, and never play while you speak.</li>
        </ul>
      </Section>

      <Section title="What isn't perfect yet">
        <ul>
          <li>The check that stops robots (Cloudflare Turnstile) is made by another company; if it gives you trouble, tell us and we'll help.</li>
          <li>Speech recognition may need several phrases before it understands you well. Typing a fix always works.</li>
          <li>Downloaded reports (PDF) are made for printing and may not read well with every screen reader.</li>
        </ul>
      </Section>

      <Section title="The garden's sounds and pictures">
        <p>
          The garden sounds are mixed from public-domain recordings on Wikimedia Commons: "Gentle breeze and birds singing", "Birds singing
          in garden" and "Robin's song" (CC0). The plants, trees, rocks, bench, table and lamps are scanned models from Poly Haven, and the
          ground and path textures are from ambientCG, all CC0.
        </p>
      </Section>

      <Section title="Tell us about a problem">
        <p>
          If something is hard to use, we want to know. Email <a href={`mailto:${contact.email}`}>{contact.email}</a> or call{" "}
          <a href={contact.phoneHref}>{contact.phone}</a>, or see <Link to="/help">Help</Link>. Tell us what you were trying to do and what
          happened, and what device and browser you use if you know.
        </p>
      </Section>
    </ProsePage>
  );
}
