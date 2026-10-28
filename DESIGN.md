---
name: Epako Voice
description: A calm, confident web app where people with dysarthria speak, hear themselves clearly in a voice they chose, and watch their progress grow; and where their clinician can see the same sessions.
colors:
  sage-white: "#F3F7F4"
  sage-mist: "#E7EFEA"
  surface: "#FFFFFF"
  sage-wash: "#E2EEE7"
  ink: "#1A2B25"
  ink-soft: "#3F534B"
  sage: "#2E6B4E"
  sage-press: "#24573F"
  leaf: "#3C8A66"
  calm-blue: "#24577F"
  sky-blue: "#2F6E99"
  chart-blue: "#2A73A8"
  error: "#B3443A"
  warning-ink: "#7A5200"
  edge: "#6B7F77"
  moss: "#4A4D44"
  moss-ink: "#EEF1E7"
  dark-bg: "#0F1E1B"
  dark-surface: "#172A26"
  dark-surface-high: "#20372F"
  dark-ink: "#E8F0EB"
  dark-ink-soft: "#B3C4BB"
  dark-sage: "#8FD0AE"
  dark-blue: "#8DC3E8"
  dark-edge: "#7F9A8F"
  dark-error: "#F0907F"
  dark-warning: "#E8C27A"
typography:
  display:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 5vw, 3.5rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 3vw, 2rem)"
    fontWeight: 600
    lineHeight: 1.2
  title:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.3
rounded:
  input: "12px"
  card: "20px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  xxl: "72px"
components:
  button-primary:
    backgroundColor: "{colors.coral}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "16px 32px"
    height: "56px"
  button-primary-press:
    backgroundColor: "{colors.coral-press}"
  button-secondary:
    backgroundColor: "{colors.teal}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "14px 28px"
    height: "52px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.input}"
    padding: "14px 16px"
    height: "56px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "24px"
  record-button:
    backgroundColor: "{colors.coral}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    size: "112px"
---

# Design System: Epako Voice

**Status:** being built in `web/`. Stages 1 to 3 of 5 are done (scaffold, page server, tokens, both themes, header, footer, phone menu, buttons, smooth-caret field, messages, 404, the persistent 3D garden, and the site-rules and garden tests). Stage 4 (2026-10-27): every screen in [Screens and features](#screens-and-features) exists and is connected to the API and Supabase: sign-up, sign-in, password reset, Setup, Home, Speak (phrase mode), Session summary, Voice, Progress and session detail, Care team, Me, Help, Terms, Privacy, Accessibility, and the clinician sign-up, verification, "we're checking", patient list, link code, patient and session screens with the assessment form and PDF. Not built yet: conversation mode (WebSocket) and the Help contact form with its `POST /api/contact`. Clinician two-step sign-in is built (28 October: `/clinician/two-step`, an authenticator app, required by the database itself, and a 15-minute idle sign-out); so is the emailed sign-in link for patients (`/sign-in/link`). The garden sounds, the stills for every stop, page entrance motion and Lenis scrolling are built. `epako_sylva_experience.html` is an unconnected mock whose wording and visuals are replaced by this document.

## Redesign of 28 October 2026: light, fast, green and blue (this section overrides everything below it)

The owner's call after two reviews: **"Patients do not deserve a janky website just because of their social status and income."** The site must run smoothly on cheap phones and old laptops with weak processors and graphics. Where an older section below (the persistent 3D garden, its stops, camera walks, garden sounds, the garden reactions, the mist, the coral accent) disagrees with this one, this one wins; those sections stay only as history.

**1. Performance floor (the rule every change is measured against).**
- No 3D on any page except the three entry pages (Welcome, Sign in, Sign up), and there only on capable devices (point 3). Everything else is plain HTML and CSS.
- On a mid-range phone: the first screen readable and usable in under 2.5 s on 4G; no main-thread task over 200 ms after the page shows; no layout shift (CLS 0, as now); nothing animates that isn't feedback.
- Page weight for a signed-in screen: under 300 KB of JavaScript and CSS (compressed), no images over 150 KB, fonts self-hosted (Atkinson Hyperlegible Next, already).
- Motion: transitions 150 to 250 ms on transform and opacity only; none under reduced motion. No smooth-scroll library on task screens.

**2. Look: sage green and calm blue, no coral.** Morning: a pale sage-white page (#F3F7F4), white cards, deep green-black ink (#1A2B25). The one primary action per screen (Speak, Get started, Save) is a deep sage-green button (#2E6B4E) with white text; links, progress, charts and focus rings are calm blue (#24577F, chart #2A73A8). Evening: deep green-navy (#0F1E1B) with pale sage (#8FD0AE) for the primary action and soft sky blue (#8DC3E8) for links. Every pair is checked by `scripts/check-contrast.mjs` (4.5:1 text, 3:1 large text and controls). The big round record button is sage green. Words stay calm and encouraging ("Take your time", "Nicely done", "Small steps add up"); nothing scolds, counts down or warns in red unless something is truly wrong.

**3. The Sylva tree on the entry pages.** Welcome, Sign in and Sign up sit on the moss scene from `epako_sylva_experience.html` (a mossy root arching across a dark moss-green ground, #4A4D44, with ferns, small white flowers and pollen), full-screen behind the content; the text and forms sit on cream cards (#F4F1E8 with dark ink) so they are always readable. Its code is the mock's own, kept exact: a standalone page `web/public/sylva/` with its own copy of Three.js r149, shown in a frame behind the content.
- **Weak devices see a still picture of it** (WebP, rendered from that page; desktop and phone versions, under 150 KB each): touch-first devices, fewer than 8 processor threads, under 8 GB of memory where the browser says, Save-Data, reduced motion, or no WebGL 2.
- **Capable devices get the live scene**, loaded only after the page is interactive and idle, faded in over the still; if it draws under 30 frames a second for two seconds, it is removed and the still stays. It never blocks the form.
- The rest of the public pages (Help, Terms, Privacy, Accessibility, 404, clinician sign-up and verification) are flat.

**4. The 3D park is removed** (garden, people, city, birds, camera walks between pages, its still pictures and its sounds). It remains in git history on the `web-frontend` branch.

**5. Navigation.**
- Phone, signed in: a bottom tab bar of five with **words under every icon**: Home, Progress, Speak (raised, centre), My voice, Me. Care team becomes a card on Me (it is used once, to link a clinician). The header is the logo and a Menu button only (Help, Terms, Privacy, Accessibility, Sign out); the theme and sound settings move to Me. 16 to 20 px side margins everywhere.
- Desktop, signed in: the left rail with the same five, labelled.
- Garden sounds are gone; the app makes no sound except the voice the person asked to hear.

**6. Screens made lighter.**
- Every page starts with its heading and its task at the top; no decorative band.
- Setup step 2 shows only the voice list (accent-ordered, with Play) and one line: "You can fine-tune it any time in My voice." The sliders and voice banking live on My voice.
- Home and Progress: three numbers (phrases, spot on, minutes) and one bar per day for phrases; the metric switch is dropped. Bars never cover their day labels; a day with no practice is a thin line on the axis; each day's whole column is the tap target.
- Footer contact details come from the environment (reserved sample values for the demo, as now).

**7. What doesn't change:** the words, the flows, the API, the privacy rules, the accessibility rules, the tests' standards (contrast, axe, CLS 0, no sideways scroll).

**Contents.** The first eight sections are the visual system. Then: [Who uses it](#who-uses-it), [Page flow](#page-flow), [Screens and features](#screens-and-features), [Clinician verification](#clinician-verification), [Behaviour that applies everywhere](#behaviour-that-applies-everywhere), [Site-wide rules](#site-wide-rules), [UX laws applied](#ux-laws-applied), [Motion, 3D and scroll](#motion-3d-and-scroll), [Accessibility and care](#accessibility-and-care), [Words](#words), [Build plan](#build-plan), [Open decisions](#open-decisions).

## Overview

**Creative North Star: "A Winter Garden Walk", with the growing tree at its heart**

People with dysarthria are often tired, often frustrated by being misheard, and sometimes new to anything technical. Using the product should feel like a slow walk through a garden on a winter morning: frost on the hedges, low gold sun, a few hardy flowers, soft birdsong, and in the middle of it all a tree that grows a little every time they practise. Progress is shown as growth, never as a score to fail.

**Every page is a stop on the same path, and the garden is the whole page.** A detailed 3D garden fills the entire screen behind every page, edge to edge and top to bottom, like the ThreeUI Sylva reference: no box, no border, no frame. Its sky and mist are exactly the page's own colour (warm cream in the morning, deep teal in the evening), so the scene and the page are one surface. It stays vivid on the side away from the words and lies under a light mist where the words are, so it is always there but never fights the reading. It is one scene that stays alive between pages, so moving from one page to the next is a few steps along the path rather than a cut to somewhere new.

The interface is calm by construction: warm sand ground (deep evening teal in the dark theme), deep teal as the voice of the product, mint for gentle fills, and a single coral button on each screen that says "this is the thing to do now". Type is large, plain and unhurried. Everything on a screen is either the one action, the one result, or quiet context. The garden reacts softly to the pointer and never sits between the person and a button. Soft garden sounds play after sign-in, with a switch that is always in reach.

The look is confident, not faded and not glassy: saturated teal, solid fills, real contrast, no frosted panels, no gradient washes, no glow.

**Key Characteristics:**
- One primary action per screen, always coral, always reachable with a thumb.
- Large type (18px body), generous space, short sentences in sentence case.
- Tonal layering (sand → sand-deep → white), not shadows or blur; every control you can press or type into has a clear edge in both themes.
- A light theme ("winter morning") and a dark theme ("winter evening"), switched from the header, both measured to the same contrast standard.
- A living 3D garden on every page with the tree as the emotional anchor; a still picture of the same garden everywhere it can't run.
- Motion that confirms and reassures; nothing that waits for the user, flashes, or loops loudly.
- Honest words: a communication and practice aid, never a diagnosis or a cure.

## Colors

Warm, saturated and grounded. Teal carries the brand; coral is used so rarely that it always means "go".

Contrast is computed (WCAG 2.x), not estimated.

### Primary
- **Deep Teal** (`#2F7F83`): button fills, the tree's foliage, progress fills, selected states. White text on it is 4.68:1. **Never used for small text on sand** (4.27:1, fails).
- **Teal Ink** (`#236468`): the hover/pressed teal fill (6.79:1 with white text on it). **Links and the focus ring use `#1D5A5E`** (7.15:1 on sand), a shade deeper so they stay readable over the misted garden.

### Secondary
- **Mint** (`#8CC5B8`): gentle fills (progress track, chart bars, tree highlights, tags). Dark ink on it is 7.24:1.
- **Mint Wash** (`#DCEEE8`): selected rows, "heard" bubble, positive tint. Ink on it 11.69:1; teal-ink on it 5.64:1.

### Accent
- **Coral** (`#E89A7B`): **the primary action only**, plus the record button. Text on it is ink, never white (ink on coral 6.26:1).
- **Coral Press** (`#D9805F`): pressed state of coral. Ink on it 4.83:1.

### Neutral
- **Warm Sand** (`#F8F4EC`): page ground. Ink on it 12.83:1.
- **Deeper Sand** (`#EFEAE0`): second surface, input wells, quiet bands. Ink on it 11.74:1.
- **White** (`#FFFFFF`): cards, inputs, dialogs. Ink on it 14.08:1.
- **Ink** (`#1F2E30`): all running text. Never replaced by grey.
- **Soft Ink** (`#3E5053`): secondary text, captions, timestamps. 7.73:1 on sand, 8.48:1 on white. (Darkened from `#4A5B5D` so it keeps its margin over the misted garden; the pixel test needed it.)
- **Edge** (`#6A7E80`): the outline of every input, checkbox, switch track and selectable chip. 3.90:1 on sand, 4.28:1 on white. Needed because a white field on sand is only 1.10:1 and would vanish.
- **Coral Edge** (`#A45A3F`): a 1.5px rim on coral buttons in the light theme. Coral alone is only 2.05:1 against sand; the rim is 4.65:1 on sand and 5.11:1 on white, so the button's shape is always clear.

### Status
- **Error** (`#B5473A`): errors only, always with an icon and words (4.87:1 on sand, 5.35:1 on white and with white text).
- **Warning Ink** (`#7A5200`): warning text on sand (6.31:1). Warnings are rare; most issues are phrased as next steps, not alarms.
- **Success** is teal (`#2F7F83`) with a check icon; icons need 3:1 and have 4.68:1 on white.

### Dark theme: "winter evening"
A full second set of values for the same token names, so every component switches by itself and nothing is hand-coloured. First visit follows the device's setting; the header toggle overrides it and is remembered. Measured:

| Role | Light value | Dark value | Dark contrast (needs) |
|---|---|---|---|
| Page ground | `#F8F4EC` sand | `#12262A` | |
| Card, input, dialog | `#FFFFFF` | `#1B3439` | |
| Raised (chips, selected rows, sheets) | `#DCEEE8` mint wash | `#24434A` | |
| Running text | `#1F2E30` | `#F1EBDD` | 13.22 on ground, 11.06 on card, 8.94 on raised (4.5) |
| Secondary text | `#4A5B5D` | `#B8C6C3` | 8.91 on ground, 7.45 on card, 6.02 on raised (4.5) |
| Links and teal text | `#236468` | `#8CC5B8` mint | 8.08 on ground, 6.76 on card, 5.46 on raised (4.5) |
| Control edges | `#6A7E80` | `#7F9B99` | 5.28 on ground, 4.42 on card, 3.57 on raised (3.0) |
| Primary button (coral, ink text) | coral, coral-edge rim, `#1F2E30` text | coral, no rim, `#12262A` text | button 6.99 on ground, 5.85 on card; text 6.99 (3.0 / 4.5) |
| Secondary button | teal, white text | **mint, `#12262A` text** (teal is only 2.81 on a dark card) | button 6.76 on card, 8.08 on ground; text 8.08 |
| Focus ring (3px, 2px gap) | `#236468` | `#8CC5B8` | 8.08 on ground, 6.76 on card (3.0) |
| Error text | `#B5473A` | `#F0907F` | 6.74 on ground, 5.64 on card (4.5) |
| Warning text | `#7A5200` | `#E8C27A` | 7.78 on card (4.5) |
| Progress fill / track | teal on sand-deep (3.91) | mint on `#24434A` | 5.46 (3.0) |

A dark card is only 1.19:1 against the dark ground, so in the dark theme **cards and sheets get a 1px `#35575E` outline** (decorative; the text inside carries the contrast), and anything you can press or type into uses the dark edge above.

### Named Rules
**The Both-Themes Rule.** A colour pair is only allowed if it passes in both themes: text 4.5:1 (3:1 for 24px+ or 19px bold), and every control's edge, icon and focus ring 3:1 against what is directly behind it. The numbers above are computed, and a test recomputes them from the token file on every build.
**The Edge Rule.** Everything you can press or type into has a visible edge at 3:1 or more in both themes. Tonal steps alone are for containers, never for controls.
**The One Coral Rule.** Coral appears at most once per screen as a button, plus the record button. If two things are coral, neither is the primary action.
**The Solid Colour Rule.** Fields of colour are flat. No gradient backgrounds, no glass, no glow. Depth belongs to the 3D scene; its mist is the page colour itself, and the one gradient allowed is the garden's lower edge dissolving into the page.
**The Ink Rule.** Text is ink or soft ink on sand, sand-deep or white (or their dark-theme values). Teal as text only as Teal Ink (mint in the dark theme). **Text may sit over the garden only where the scene is calm** (its misty sky, which is the page colour): each stop composes its plants away from where the words go, and a test reads the real pixels behind every piece of text over the garden and fails below 4.5:1. Buttons and fields over the garden sit on their own solid fill, so they never depend on the scene.
**The Colour-Is-Never-Alone Rule.** Every status uses an icon and words as well as colour.

## Typography

**One family:** Atkinson Hyperlegible Next (variable, weights 400 to 800; self-hosted via Fontsource), fallback `system-ui`.
Designed by the Braille Institute for maximum character distinction (clear `I`/`l`/`1`, open apertures), which suits readers with tiring eyes or low vision. One family keeps the page calm; hierarchy comes from size and weight.

**Character:** friendly and plain, never childish and never clinical.

### Hierarchy
- **Display** (600, `clamp(2.25rem, 5vw, 3.5rem)`, 1.1): welcome and the spoken result. At most two lines at every width.
- **Headline** (600, `clamp(1.5rem, 3vw, 2rem)`, 1.2): screen titles.
- **Title** (600, 1.25rem, 1.3): card titles, section names.
- **Body** (400, **1.125rem = 18px**, 1.6): everything readable. 45 to 70 characters per line.
- **Label** (600, 1rem, sentence case): buttons, form labels, nav. **Never below 16px, never all caps, never tracked out.**
- **The result text** (what the app understood) is set at Display size on the speak screen: it is the whole point of the product.

### Named Rules
**The Two-Line Rule.** Headings are two lines or fewer; cut words before shrinking type.
**The 16px Floor.** Nothing a patient must read is under 16px. The tabular figures setting is on for numbers.
**The Calm Voice Rule.** Sentence case, no exclamation marks except in the one celebration moment, no jargon (say "pitch variation", not "jitter") on patient screens.
**User text size.** Settings offers Normal / Large / Larger (100 / 115 / 130%); layout must survive 200% browser zoom without horizontal scroll.

## Layout

**Grid:** a 12-column grid, content max-width 1120px, outer margins 20px on phones and 40px from tablets up, always equal on both sides. Patient screens are mostly **one column, max-width 640px, centred**; the home screen widens to two columns (today's card + the tree) from 960px.

**Spacing rhythm:** 8px base (`8 / 12 / 16 / 24 / 40 / 72`). Space inside a group is 8 to 16px; between groups 40px; between page sections 72px. Proximity does the grouping (no divider lines).

**Navigation:** a **bottom tab bar on phones** (Home, Speak, Progress, Care team, Me) with the Speak tab centred and larger; a **left rail on desktop** with the same five items. Five items maximum (Miller). The active item is shown by fill and weight, not colour alone.

**Header (every page):** the logo on the left; on the right the **theme toggle** and, once signed in, the **garden sounds toggle**, both 48px and always visible (on phones too, never hidden in a menu), then the Menu button on public pages. These two toggles are settings, not navigation, so they don't count against the five items.

**The garden's place in the layout.** The garden is a fixed backdrop behind the whole page (it does not scroll; the page scrolls over it). On desktops the words keep to the left column and the garden is vivid on the right; on phones the garden is vivid in the top part of the screen and the words begin below it. Behind the words it is misted to about a fifth of its strength, and as the person scrolls into a long page the whole garden mists over, so reading is always calm. The server-rendered HTML carries a still picture of the same view in the same place, so nothing shifts when the live scene loads.

**Touch targets:** at least **48 × 48px** (56px for buttons and inputs), at least 8px apart. The record button is **112px**. Primary actions sit in the lower third of the screen on phones (thumb zone) and are full width there.

**Breakpoints:** 480 / 768 / 960 / 1280. Phone is its own composition, designed first.

## Elevation & Depth

Flat and tonal. Surfaces separate by background step (sand → sand-deep → white), not by lines, shadows or blur. Shadows appear only on what truly floats (menus, dialogs, toasts): `0 8px 24px rgba(31,46,48,0.14)` in the light theme; in the dark theme shadows barely show, so floating things also get the 1px dark outline. Depth is carried by the 3D garden, lit by a low winter sun (or lanterns in the evening theme) with soft contact shadows on the ground.

**The Flat-By-Default Rule.** At rest nothing has a shadow. Floating things do, and only those.

## Shapes

Soft but not bubbly. Cards 20px, inputs 12px, buttons and chips are **pills**. Icons are 2px-stroke, rounded caps, 24px. The record button and avatars are circles. Corners are decided once and never mixed.

## Components

### Buttons
- **Primary (coral, ink text, 56px, pill):** one per screen. In the light theme it has a 1.5px coral-edge rim so its shape is clear on sand and white. Hover lifts 1px; **press scales to 0.97 in 160ms** (ease-out); focus shows a 3px ring (Teal Ink, or mint in the dark theme) with a 2px gap.
- **Secondary (52px):** teal with white text in the light theme, mint with dark ink in the dark theme; supporting actions ("Not quite", "Save voice").
- **Quiet (no fill, Teal Ink text, underline on hover):** low-stakes ("Skip for now", "Cancel").
- **Danger (white, error text and 2px error outline):** delete only, never the loudest thing on screen.
- Every button has a text label; icon-only buttons need a tooltip and `aria-label`.

### Smooth-caret input
The text field the product uses everywhere. The native caret is hidden (`caret-color: transparent`) and replaced by a 2px teal-ink bar that glides to its new position instead of jumping (about 90ms, ease-out), with a slow, soft blink when idle (and no blink under reduced motion).
- Position comes from a hidden mirror element measuring the text before the selection, so scrolling stays correct; right-to-left text uses the native caret.
- Browsers don't report the cursor position in `type="email"` (or number) fields, so email fields are `type="text"` with `inputMode="email"` and `autoComplete="email"` (same phone keyboard, password managers still recognise them). Any field where the position isn't available, and password fields (whose dots can't be measured exactly), use the native caret.
- **Native selection, IME composition, password managers, autofill and screen readers keep working**; if mirroring is ever uncertain (composition active, `prefers-reduced-motion`, coarse pointer) it falls back to the native caret.
- 56px tall, 12px radius, white on sand with a 1.5px edge outline (dark card colour and the dark edge in the dark theme; 2px and the focus colour when focused), label above (never placeholder-only), helper text below, errors below in words with an icon.
- Passwords have a show/hide toggle and no composition rules shouted at the person; the rule ("at least 12 characters") is stated up front.

### Record button (signature component)
A 112px coral circle with a mic icon. States: **idle** (gentle breathing scale 1 to 1.03 over 3.5s), **listening** (ring that follows the voice level, label "Listening… tap when you're done"), **thinking** (ring becomes a slow rotating arc, label "Working on it…"), **speaking** (waveform bars while the corrected voice plays), **error** (calm text, never red flashing). Tap to start, tap to stop; keyboard Space/Enter; announces each state to screen readers.

Speak, as built (2026-10-27): **today's leaves** above the button (five leaves that fill as phrases are said today, a gentle daily five: goal gradient); **live voice bars** beside the button while it listens (feedback loop); the phrase ends by itself after a 2.5 s pause (hands-free, generous because dysarthric speech pauses mid-phrase), or with a tap; **practice prompts** under it, three everyday phrases at a time to tap when nothing comes to mind (recognition over recall); the understood sentence arrives word by word (React Bits BlurText) and "Yes, that's right" sends a small burst of sparks in the page's own colours (React Bits ClickSpark), the one playful moment; "Not quite" offers typing the fix or saying it again (Postel's law); "Say another" right under each saved phrase; and **This visit**, the phrases said so far, each replayable (serial position). Before sending, the recording is trimmed of the silence before and after the speech (less noise for the recogniser to misread, and faster); a dropped connection while recognising is retried once, quietly (never a save, which could store a phrase twice).

### Result card
Display-size corrected sentence on white, with "What I heard" in soft ink beneath at Body size and a replay button. Two buttons: **"Yes, that's right"** (primary) and **"Not quite"** (secondary, opens the correction input pre-filled).

### Progress tree
The growth metaphor. A small 3D tree on Home (and a flat SVG tree in the report and everywhere 3D can't run). It adds a leaf per confirmed phrase today and a visible new branch at milestones; it never withers if the person misses a day.

### Footer
Same on every page (left to right on desktop, stacked on phones): the logo (a link home), Terms, Privacy, Accessibility, Help, then the contact line: a clickable email (`mailto:`) and phone (`tel:`). The copyright line reads "© [this year] Epako Voice" with the year computed. Quiet, sand-deep ground, Body-size links, 48px touch height, nothing decorative.

### Mobile menu
Signed in: the bottom tab bar (Home, Speak, Progress, Care team, Me) with a "More" button for Help, Terms, Privacy, Accessibility and Sign out. Signed out and on legal pages: a Menu button at the top right opening a full-height sheet with the same links. Both open in under 200ms, trap focus, close on Escape, outside tap or the close button, and use `100dvh` with safe-area padding.

### Password field and strength meter
The smooth-caret input with a show/hide toggle, and a meter underneath that fills in teal as the password gets stronger. The meter always has words next to it ("Needs a bit more", "Getting there", "Strong"), a one-line friendly suggestion ("A few unrelated words works well"), and a note if the password has appeared in a known breach ("That one has shown up in a data leak, so let's pick another"). Never colour alone, never blocks paste, and the 12-character rule is stated before the person starts typing.

### Success and error messages
One component, two looks, both with an icon and words. **Success:** mint-wash, teal-ink text, a check icon, 6 seconds, polite announcement. **Error:** white with an error-colour icon and text, stays until dismissed or fixed, assertive announcement for blocking errors, inline under the field for form errors. Both follow the "Words" voice and come from one message table so nothing is improvised.

### Cookie choices (deferred: only built if analytics is ever turned on, rule 43)
Shown once, at the bottom of public pages only (never on signed-in screens, which don't use analytics at all). A small card in the warm voice: "Would you be okay with us counting visits to this page? It helps us see what's useful. It never includes anything you say or do once you're signed in." Two buttons of **equal size and weight**: "Yes, that's fine" and "No thanks". Neither is coral, and the choice is remembered. It can be changed any time from "Cookie choices" in the footer. No dark patterns: no pre-selection, no guilt, no repeated asking.

### The 404 page
A calm page with the sapling tree, "That page isn't here, but you're not lost.", one primary button "Take me home", and a quiet Help link. The correct 404 status is returned and the page is not indexed.

### Cards, chips, lists
Cards are white, 20px, 24px padding, no border in the light theme and a 1px `#35575E` outline in the dark theme. Chips are pills (mint-wash fill, teal-ink text; dark: raised fill, mint text); a chip you can select also has the edge outline. Lists are rows with 56px minimum height and a clear chevron; a whole row you can press shows the edge outline on hover and focus.

### Theme toggle
A 48px round button in the header on every page: a sun icon in the dark theme (to go light) and a moon in the light theme (to go dark), with a visible tooltip and an accessible name that says what it will do ("Switch to the evening look" / "Switch to the morning look"). No `aria-pressed`: a button whose name changes must not also announce a pressed state (screen readers would say two contradictory things). The icon and name are chosen by CSS from the theme, so the server-rendered button is already right before any script runs. One press switches everything: the page, the components and the 3D garden. The choice is stored in a small cookie so the server renders the right theme on the next visit, with no flash of the wrong colours. Me, Comfort offers the same choice with a third option, "Match my device". The switch itself is a 250ms cross-fade (the View Transitions API where the browser has it, instant otherwise and under reduced motion); the garden re-lights over about 600ms.

### Garden sounds toggle
A 48px round button next to the theme toggle, shown on signed-in pages: a speaker icon with soft waves when on, the same speaker with a line through it when off, a fixed accessible name ("Garden sounds") with `aria-pressed` saying whether they are on (a name that changes must not also announce a pressed state, as with the theme toggle). The first time sounds start, a small note beside it says "Soft garden sounds are on. Tap here to turn them off." and goes away after 8 seconds or the first press. Me, Comfort adds a volume slider. Behaviour in [garden sounds](#garden-sounds).

### Toasts and dialogs
Toasts (bottom on phones, top right on desktop) are calm, 6s, dismissible, and `aria-live=polite`. Dialogs trap focus, close on Escape, have a clear primary and quiet cancel.

### Skeletons and loaders
Sand-deep shapes that match the final layout. Longer waits use the loading transitions in [Motion](#motion-3d-and-scroll).

## Do's and Don'ts

### Do:
- **Do** show one primary action per screen and put it in the thumb zone.
- **Do** answer every tap within 100ms (a visible state change), even when the server takes 1s.
- **Do** write errors as what happened and what to do next, in one sentence.
- **Do** keep the corrected sentence the largest thing on the speak screen.
- **Do** explain before asking (why consent, why a CAPTCHA, what deletion does).
- **Do** let people undo or go back at every step except deletion's final confirmation.
- **Do** keep the 3D layer `pointer-events: none`; it listens to the pointer from the window.
- **Do** check every screen in both themes before calling it done.

### Don't:
- **Don't** use grey for body text, thin dividers, glassy blur panels, gradient backgrounds or glows.
- **Don't** put more than five items in the main navigation or more than one coral button on a screen.
- **Don't** show scores, red marks, streak-loss messages or comparisons to other people.
- **Don't** use diagnosis words (spastic, ataxic, tremor, bradykinesia) anywhere on patient screens; clinician screens show measurements against references only.
- **Don't** claim "cloning", "restoring your original voice", "clinically validated" or "cures". The product picks and tunes one of six stock voices, and its measures are not clinically validated.
- **Don't** play any sound on public pages or before sign-in, let sound play while the microphone is open or the corrected voice is speaking, or start motion that can't be paused or anything flashing.
- **Don't** let the garden decide whether something is readable: words over the garden only on its calm, misty side (tested by pixel), and buttons and fields always on their own solid fill.
- **Don't** frame the garden in a box, card or border; it covers the whole screen.
- **Don't** add a 3D element only because it looks nice: each one has a job in the story or the task (see [why each part of the garden is there](#why-each-part-of-the-garden-is-there)).
- **Don't** use emojis anywhere, in any text, alt text, title, message or file the site produces.
- **Don't** let a secret, a service key or a sample value reach the browser or the built site; and don't ship a placeholder.
- **Don't** block navigation with a loading animation; transitions are interruptible.

---

## Who uses it

| Role | Goal | Entry |
|---|---|---|
| **Patient** (the main user; may be tired, may have limited hand control or vision) | Be understood: speak, hear it corrected, keep practising, see progress | Welcome → Sign up |
| **Family helper** (sits beside the patient; not a separate account in v1) | Help set up the voice and consent | Uses the patient's device and screens |
| **Clinician** (speech-language pathologist) | See a linked patient's sessions and measurements, write an assessment, hand over a report | Welcome → "I'm a clinician" |
| **Admin** (the project owner) | Verify clinicians | Supabase dashboard (no screen in v1) |

## Page flow

**Decided flow** (patient first, clinician second). The principle: one obvious next step on every screen; setup happens once, in order, with a visible finish line; after that the app opens straight to "today".

```
                 ┌─────────────── Welcome (/) ───────────────┐
                 │  3D tree · one sentence · [Get started]   │
                 │            [Sign in]  · I'm a clinician   │
                 └───────┬───────────────────────┬───────────┘
                         │                       │
              Sign up (/sign-up)         Sign in (/sign-in)
              email+password+CAPTCHA     email+password+CAPTCHA
                         │                       │ (returning)
                         ▼                       │
            Setup, 3 steps (/setup)              │
            1 Privacy & consent  ──┐             │
            2 Your voice  (skip ok)│ goal-gradient bar
            3 Mic check            ┘             │
                         │                       │
                         └──────────┬────────────┘
                                    ▼
                       HOME "Today" (/home)
         greeting · [Speak] · today's progress · the tree · recent phrases
              │         │            │              │            │
        Speak (/speak) Progress   Voice (/voice) Care team   Me (/me)
        record→result  (/progress) sculpt/bank   (/care)     privacy, text size,
        →confirm→next  sessions &  save voice    link code,  theme, sounds,
        →finish→       trends      preview       who has     delete account,
        celebration                              access      sign out
              │
              └─► Session summary (/speak/done) → back to Home

   Clinician: Welcome → Clinician sign-up (/clinician/sign-up)
        → Prove you're a licensed professional (/clinician/verify)
        → Two-step sign-in set up (/clinician/two-step)
        → "We're checking" (/clinician/pending)  ← admin reviews, usually within 2 working days
        → Patients (/clinician) ── Enter link code (/clinician/link)
        → Patient (/clinician/patient/:id): sessions, measurements, assessment
        → Report (PDF)

   Everywhere: footer → Terms (/terms) · Privacy (/privacy) · Accessibility (/accessibility)
               · Help (/help)      Any unknown address → a kind 404 page (/*)
```

Rules of the flow:
- **Sign-in and sign-up are separate screens** with different headings, different primary-button text ("Create my account" vs "Sign in"), and a one-line link to the other. Never a tabbed form (Jakob/Hick).
- **After sign-up** the person is taken straight to Setup, never to an empty Home. **After sign-in** they go to Home (or Setup if unfinished).
- **Home is the hub.** Everything else is one tap away, and every screen returns to Home with one tap.
- **Setup is a short, finishable wizard**: three steps with a progress bar that fills (goal-gradient), step 2 skippable, a "Back" on every step.
- A session always **ends on a high** (peak-end): the summary names what went well first.
- **Every move between pages is a few steps along the garden path** (see [the winter garden](#the-winter-garden-3d-on-every-page)): the scene carries over, the camera walks to the next stop, and the new content rises in. No page starts from a blank or a different world.

## Screens and features

Every feature below exists in the backend today (route or table in `docs/contract.md`); each row says what the screen must do, so nothing in the API is unreachable and nothing is invented.

### Welcome (`/`)
- 3D garden at the start of the walk: the great mossy bough and the snowdrop bank, the paved path leading in (see [the winter garden](#the-winter-garden-3d-on-every-page)), one-line promise, **[Get started]** (coral), [Sign in] (quiet), small "I'm a clinician" link.
- Wording (a friend, not a brochure): **"Say it your way. We'll help it be heard."** then "Epako Voice listens, tidies up what you said, and says it back in a voice you choose. Go at your own pace, there's no rush here." Honest line underneath, kept gentle: "A helper for everyday speaking and practice. It isn't a medical device, and it doesn't replace your clinician."
- Still picture of the same garden stop (in the current theme) when WebGL or motion is unavailable.

### Sign up (`/sign-up`) and Sign in (`/sign-in`)
- Email, password (12+ characters stated up front), Turnstile CAPTCHA shown in-flow, never blocking the form's layout.
- Errors in words: wrong password, unconfirmed email, CAPTCHA failed ("please try the check again"), too many attempts.
- Password reset link (Supabase). Sign out clears the session on every tab.
- Backend: Supabase Auth with the CAPTCHA token on every attempt. A patient profile is created automatically at sign-up.

### Setup wizard (`/setup`)
1. **Privacy and consent.** Plain-language explanation; one switch "Save my recordings so my clinician and I can review them", **off by default**; "You can change this any time in Me". (`patient_profiles.consent_audio_storage`)
2. **Your voice.** Choose a voice (six stock voices, each with a "play sample"), optionally **bank a voice** from 2 to 10 recordings of the person's earlier voice (up to 10 MB each; "a few clear phrases", with a calm explanation that this *picks and tunes* a stock voice, it doesn't copy it), then preview and **Save**. Skippable: the default voice is used. (`POST /api/voice/bank`, `POST /api/voice/sculpt`, `PUT /api/voice/profile`)
3. **Mic check.** Ask for the microphone with a reason first; a live level meter; "Say anything"; shows "I can hear you" or a fix-it hint (permission denied, no mic, too quiet).

### Home: "Today" (`/home`)
- Greeting by time of day (no name stored; use a friendly generic greeting), **[Speak]** button (primary, large).
- **Today's progress:** phrases said, share confirmed, minutes practised, and the tree's growth; a gentle weekly view (7 small leaves/bars). Data: `therapy_sessions` (`duration_seconds`, `utterances_count`, `accuracy_rate`) and the `patient_daily_progress` view, read under the patient's own login.
- **Recent phrases** (last 5 confirmed, tap to hear again).
- First-time empty state: the tree is a sapling and the text says "Say your first phrase", not blanks.
- A quiet reminder card only when something needs doing (e.g. "Your voice isn't saved yet").

### Speak (`/speak`)
- Big record button (states above). **Two modes**, switched by a labelled toggle, default **Phrase mode**:
  - *Phrase mode:* record → stop → result. (`POST /api/rectify`)
  - *Conversation mode:* hold the mic open, speak naturally, results appear after each pause. (`WS /ws/rectify`: 16 kHz mono PCM; ends a phrase after 1.5 s of quiet; at most 2 open at once, so a second tab is told kindly.)
- **Result card:** corrected text (Display), "What I heard", replay, [Yes, that's right] / [Not quite].
- **Not quite:** an input pre-filled with the text so they fix it by typing (or saying it again). On send: `POST /api/sessions/{id}/utterances` (`raw_transcript`, `shown_text`, `final_text`). This teaches the app (word fixes and vocabulary) and feeds the progress numbers.
- A session starts on first use (`POST /api/sessions`) and ends on [Finish] or after inactivity (`POST /api/sessions/{id}/finish`).
- **Biomarkers** (`POST /api/session/analyze`) run quietly in the background on each recording while the person is working; never shown as scores to the patient.
- Special results: *nothing heard* ("I didn't catch that. Try a little closer to the mic."), *voice problem* (`voice_error`: the text is still shown, with "Your voice needs saving again" and a link to Voice), *too long* (over 60 s) and *too short* (under 0.1 s) with the exact limits in plain words.
- Optional: save the recording (only if consent is on).

### Session summary (`/speak/done`) (the peak and the end)
- **First line is what went well** ("You said 9 phrases and 7 were spot on."), the tree visibly grows (one short celebration; no confetti storm), then one next step ("See your progress" or "Done for today").
- Reduced motion: the same screen without the growth animation.

### Voice (`/voice`)
Same controls as setup step 2 (which now has the sliders and "Hear it" too), as a settings screen: template picker with samples, five sliders (pitch, speed, loudness, warmth, roughness) with plain labels and the real allowed ranges, a live "hear it" preview, **Save**, and **Bank from recordings**. Unsaved changes are flagged before leaving. **Accent:** each voice is labelled with its accent (five American English, one British English: the installed Piper voices). The voices whose accent matches the device's language setting (`navigator.language`, en-GB/en-IE British, en-US/en-CA American) are listed first, with a line saying why and that any voice is the person's to choose. Nothing else is used: no location lookup, and never anything about the person themself (a voice is a choice of accent and sound, not something inferred from who someone is). Other accents (Indian English, for one) need new Piper voices first.

### Progress (`/progress`)
- Calm trends over days and weeks: confirmed share, phrases per day, practice minutes. One chart at a time, direct labels, a sentence stating what it shows ("You've practised 4 days this week").
- As built: three stat tiles that count up once (React Bits CountUp) over one bar chart (`components/DayBars.tsx`, the same chart on Home): one series so no legend, thin bars with 4px rounded tops on a quiet baseline, a 2px gap, labels only on today and the best day, a tooltip on hover and focus, a dashed "Daily 5" line on the week's phrases, and "See the numbers" opening the same data as a table. The bars use their own token `--chart` (#00897B morning, #2A9D8F evening), checked with the dataviz validator for lightness, chroma and contrast on the card surface in both themes.
- **No red, no falling-line shaming**; a dip is shown plainly with a neutral sentence.
- A session list (date, phrases, confirmed share) → session detail.
- Patient-facing wording for measures (if shown at all): "speaking pace", "pauses", "steadiness", each with "not a medical measure" help text. The full measurement table is for clinicians.
- **Download my report** (PDF) appears once a clinician has written an assessment for that session (`POST /api/session/report/pdf`); otherwise "Your clinician hasn't added notes yet".

### Care team (`/care`)
- **Share with a clinician:** [Create a code] (`create_link_code`): shows a 10-character code, large and copyable, with a visible 15-minute countdown and "only one code works at a time".
- **Who can see my sessions:** each clinician's name and date, with [Stop sharing] (revoke) and a confirmation.
- Plain explanation of what a clinician can see (sessions, measurements, what was said) and what they can't (anything else).

### Me (`/me`)
- **Privacy:** the consent switch (explains the effect), a list of what's stored.
- **Comfort:** text size (Normal/Large/Larger), reduce motion (follows the system by default), look (Morning / Evening / Match my device), garden sounds (on/off and volume), and "Show the garden" (on by default; off shows the still pictures, for anyone who finds movement tiring or whose device struggles).
- **Delete my account and data:** states exactly what disappears; requires typing DELETE, the password, and the CAPTCHA token; says it can't be undone; limited to 3 tries an hour. (`DELETE /api/me/data`)
- **Sign out.**

### Help, Terms, Privacy, Accessibility (`/help`, `/terms`, `/privacy`, `/accessibility`)
Public, prerendered, one `h1` each, in the same warm voice as the rest.
- **Help:** short answers to the real questions (I can't sign in; I can't hear my voice; what is stored; how do I delete everything; how does a clinician see my sessions), each linking in its own words to the Privacy, Terms or Accessibility page it relates to; then the **contact form** (rule 45) and, beside it, the contact email and phone as links; the gentle "this isn't an emergency service" line; and, in the demo only, the soft note that the contact details are samples. A breadcrumb (Home, then Help) sits at the top.
- **Terms and Privacy:** plain-language pages as described in rule 17, each with a short summary at the top and details below. The Privacy page names Supabase (Mumbai) as where data is kept and says recordings are stored only with consent.
- **Accessibility:** the WCAG 2.2 AA target, what's known to be imperfect, and how to report a problem.
- **404:** as in Components.

### Clinician screens
- **Sign up** (`/clinician/sign-up`): the same account screen as patients but with a clinician heading, then straight on to **verification** (`/clinician/verify`), **two-step sign-in** (`/clinician/two-step`, asked for on the first visit to the clinician screens) and **"We're checking"** (`/clinician/pending`). No access to any patient until verified. Full detail in [Clinician verification](#clinician-verification). (`clinicians` row, `verified=false`)
- **Patients** (`/clinician`): a list of linked patients, **pseudonymous** (e.g. "Patient 3f9a"; no names are stored anywhere), last session, sessions this week; **[Add a patient]** opens **Enter link code** (`redeem_link_code`; a wrong code gets one generic message, and 5 misses in 15 minutes locks the screen for a while, with the time stated).
- **Patient** (`/clinician/patient/:id`): sessions list → session view with the **measurements table** (each value beside an approximate reference marked as approximate, compared as below / within / above; frame-level estimates labelled as such; composite scores marked "not compared"), the **what the recogniser heard vs what the patient confirmed** table, and the **assessment form** (condition in the clinician's words, impression, home practice, frequency; editable by its author). Always visible: *"Automated measurements, not clinically validated, not a diagnosis."*
- **Report:** [Download PDF] per session (needs an assessment). Revoked access is shown as "no longer shared" and the data disappears from view.

### Not built in v1 (stated so nobody expects them)
A diary/journal (the mock has one; nothing in the backend supports it), family accounts, clinician-to-patient messaging, notifications, multiple languages, a mobile app, payment.

## Clinician verification

Patients share real speech data with clinicians, so "verified" has to mean something. Verification is **proving two things**: that the person is who they say they are, and that a recognised professional body lists them as licensed. The product is not a regulator and never says it is; it says "checked against the register on [date]".

### Ways to do it (industry-standard, from lightest to heaviest)

| Method | What it proves | Effort and cost | Weakness |
|---|---|---|---|
| **A. Register lookup (primary-source check).** The clinician gives their register, licence number and legal name; an administrator looks it up on the official register and confirms the name matches. India: the Rehabilitation Council of India's Central Rehabilitation Register covers speech-language pathologists and audiologists, and the National Medical Commission's register covers doctors (confirm each one's public look-up before relying on it). Elsewhere: HCPC (UK), NPPES NPI registry and state boards, ASHA certification (US), AHPRA (Australia). | That a licence exists under that name | Free; a few minutes per person | Doesn't prove the applicant *is* that person |
| **B. Evidence upload.** Photo of the licence and a government photo ID, ideally with a live selfie, reviewed by the administrator and **deleted after the decision** | That the applicant holds the ID and licence | Free to build; a private storage bucket | Handling ID documents is sensitive; keep as little as possible |
| **C. Work-email confirmation.** A confirmation link sent to an address on a hospital, clinic or university domain | A link to a real institution | Easy | A supporting signal only; anyone can own a domain |
| **D. Third-party identity and credential service** (an identity-verification vendor with document and liveness checks, or a healthcare credentialing service) | Strong identity and document checks in minutes | Paid per check; integration work | Overkill for a first release |
| **E. Vouching.** An already-verified clinician or a clinic administrator attests for a colleague | Trust through a network | Cheap | Needs an existing verified base |
| **F. Two-step sign-in (an authenticator app, TOTP).** Not identity proof; it protects the account after it is verified | That the verified person is the one signing in | Supabase supports it | Doesn't replace A to E |

### What we recommend

- **For 31 October (Tier 1):** **A + C**, plus **F** if time allows. The clinician fills one short form; the administrator checks the register by hand and sets `verified` in the Supabase dashboard (already how the backend works, with every change written to `clinician_audit`). Be honest on screen that checking is done by a person and takes up to about 2 working days.
- **Next (Tier 2):** add **B** (private bucket, deleted after the decision), make **F mandatory** and require it in the database rules before any patient data is readable, re-check licences once a year, and revoke access when a licence lapses.
- **Later (Tier 3):** a vendor (**D**) if volume grows.

Do not copy a clinician's documents anywhere else, do not keep them longer than the decision, and have the privacy page say so. This is personal data: get advice on India's Digital Personal Data Protection Act 2023 before real use.

### Screens

**`/clinician/verify` (one form, in a friendly voice)**
- Your name exactly as it appears on your licence; your profession (speech-language pathologist, audiologist, neurologist, other); the register you're listed with (a short list plus "Other") and your registration number; your work email (we'll send a confirmation link to it); the country you practise in.
- A short promise to tick: "What I've told you is true, and I'll only look at people who have shared a code with me."
- "Can't find your register? Tell us and we'll help" opens Help.
- Backend work needed: new columns on `clinicians` (legal name, profession, register, work email, status, decision date, reviewer note) and rules so a clinician can write only their own request and can never change `verified` or the status.

**`/clinician/security`** shows a QR code for an authenticator app, asks for the 6-digit code, and explains why in one sentence. Offers recovery codes to keep safe.

**`/clinician/pending`** shows one of five states, always with what happens next and no dead ends:
- *Sent*: "Thank you. A person will check this, usually within 2 working days."
- *Checking*: "We're looking at your registration now."
- *Need a little more*: what's missing and a button to add it.
- *Verified*: "You're all set." with [Go to my patients].
- *Couldn't verify*: the reason in kind words and how to ask for a second look.

**Patients see the result too.** On Care team each clinician shows a "Verified" label with the date and register ("Checked against the register on 3 Nov"), so a patient knows who they're sharing with.

### Abuse and safety
- One open request per person; submissions are rate-limited; wrong link codes already lock after 5 misses in 15 minutes.
- An unverified clinician sees nothing and can do nothing except finish verification.
- A clinician who is revoked loses access at once. Patients who had shared with them see a calm note on Care team ("This clinician's registration check has lapsed, so they can't see your sessions any more. Nothing of yours has been changed.").

## Behaviour that applies everywhere

- **Auth session:** supabase-js keeps and refreshes the login; the app never shows a raw token. On a 401 it refreshes once, then sends the person to Sign in with "Please sign in again" and returns them to where they were.
- **Rate limits (429):** "That was a lot at once. Take a breath and try again in a minute." with a visible, non-alarming countdown; no error styling.
- **Errors:** every error says what happened and what to do next; none shows a status code or stack. 503 (recogniser or voice unavailable): "Epako is waking up. Give it a moment" with automatic retry and a manual button.
- **Offline / slow network:** a calm banner ("You're offline. Your phrases will wait") and nothing lost mid-typing.
- **Uploads:** stop at 10 MB per recording; audio longer than 60 s is refused with the limit stated.
- **Never silent:** every action has visible feedback within 100ms (Doherty); anything over 400ms shows progress; over 1s shows the loading transition and, for the recogniser, a plain "Working on it…".
- **Privacy:** the interface never shows an email or a real name on clinician screens; pseudonymous ids only.
- **Consent off:** recordings are never saved; the UI never says "saved" when they aren't.

## Site-wide rules

These are non-negotiable and apply to **every** page. Each one has a way of being checked by a person or by an automated test; a rule without a check doesn't count. The checks run in one Playwright suite (`web/tests/site-rules.spec.ts`) on every route at 360, 390 and 768 pixels wide, plus 1440 for desktop, **in both the light and the dark theme**, and the secret and vulnerability checks also run in CI before any release.

### Layout and mobile
| # | Rule | What it means here | How it's checked |
|---|---|---|---|
| 1 | **No horizontal scrolling** | Nothing is wider than the screen at any width from 320px up, at 200% zoom too. Images and tables shrink; long words wrap; `overflow-x: hidden` is never used to hide a problem. | `scrollWidth <= innerWidth` on every route at every width |
| 2 | **Smooth on phones** | Designed phone-first. Targets 48px+, `100dvh` not `100vh`, safe-area padding for notches, text inputs at 16px+ so iPhones don't zoom, scene quality drops on weak devices, 60 fps scrolling. | A real phone plus Chrome's device mode with 4x CPU slowdown; Lighthouse mobile score reviewed |
| 3 | **Every page mobile-optimised** | No page is a shrunk desktop page. Each route has its own phone layout, including legal pages, 404, clinician screens and the PDF download. | Screenshots of every route at 360 and 390, looked at one by one |
| 4 | **A mobile menu** | Signed-in screens: the bottom tab bar, with a "More" sheet for Help, legal links and sign out. Public screens: a menu button opening a full sheet. Both close on Escape and outside tap, trap focus, 48px items. | Keyboard and touch test at 360 |

### Navigation, links and buttons
| # | Rule | What it means here | How it's checked |
|---|---|---|---|
| 5 | **No broken links** | Every link goes somewhere real; anchors point at ids that exist. | A crawler follows every internal link and checks anchors; external links get a head request |
| 6 | **Footer links work** | Footer: Terms, Privacy, Accessibility, Help and Contact, each a real page. | Same crawler, run on the footer first |
| 7 | **No broken buttons** | Every button does something visible, or is disabled with the reason written next to it. | Playwright clicks every button on every route and asserts a change, a navigation or a message |
| 8 | **No unused navigation** | A menu item exists only if its screen exists. No "Coming soon", no journal tab. | Compare the nav items to the built routes |
| 9 | **The logo is a link** | Logo goes to the welcome page when signed out and to Home when signed in; accessible name "Epako Voice, home". | Click test on every route |
| 10 | **A kind 404 page** | "That page isn't here, but you're not lost." with a button home. It returns a real 404 status and is not indexed. | Request an unknown address; check status and content |

### Contact and identity of the site
| # | Rule | What it means here | How it's checked |
|---|---|---|---|
| 11 | **Mobile number is clickable** | A `tel:` link in international format, shown in a readable form. For the demo it is the reserved sample number (see [the demo contact](#build-plan)). | Click test; the build refuses a missing number, or the sample one without the demo flag |
| 12 | **Email is clickable** | A `mailto:` link. It never pre-fills anything personal. For the demo it is the reserved sample address. | Click test; the build refuses a missing address, or the sample one without the demo flag |
| 13 | **Favicon** | An SVG tree mark plus 32px and 180px PNG icons and the 192 and 512 app icons; theme colour `#2F7F83`. | Request each icon; check the tab |
| 14 | **Page titles fixed** | Every route has its own title in the form "Page name - Epako Voice", under 60 characters, set by the router. | Collect titles from all routes: none empty, none duplicated |
| 15 | **Meta descriptions** | Public pages have a unique 70 to 160 character description, written in the same warm voice; signed-in pages are `noindex`. (The share image is rule 27.) | Read the tags on each route |
| 16 | **Copyright year is right** | Computed from today's date, never typed in. | Test with a mocked clock in January and December |
| 17 | **Terms, Privacy and Accessibility pages** | Plain-language pages in the footer and linked at sign-up. Privacy says what is stored (email, recordings only with consent, what was said, measurements, contact-form messages), where (Supabase, Mumbai), who sees it (the patient, and clinicians the patient shares with), how to delete it, and, if analytics is on, that Google Analytics counts visits to public pages only, after consent, and how to say no. Accessibility states the WCAG 2.2 AA target, known gaps and how to report a problem. Have them reviewed by someone qualified before launch. | Pages exist, are linked, and say nothing the product doesn't do |

### Words and content
| # | Rule | What it means here | How it's checked |
|---|---|---|---|
| 18 | **No placeholder text** | No lorem ipsum, TODO, TBD, "coming soon", sample names, or `example.com`. Inputs use real labels, not placeholder text standing in for them. **The one exception is the demo contact**, which is declared in one place, flagged as a demo, and told to the reader on the Help page. | A scan of source and the built pages for those words, allowing only the flagged demo contact |
| 19 | **Success messages** | Every completed action says so in plain words: voice saved, consent changed, code created, assessment saved, report ready, account deleted. Announced to screen readers; fades after 6 seconds. | A test per action |
| 20 | **Error messages** | Every failure says what happened and what to do next, in one kind sentence. One table maps each response (400, 401, 403, 404, 413, 422, 429, 503, no network) to its message; nobody sees a status code or a stack trace. | A test that forces each error |
| 21 | **Absolutely no emojis** | Icons are our own SVGs. No emoji or pictographic characters anywhere: copy, alt text, titles, meta, toasts, emails, the PDF, test data. | A scan of source and built output for the Unicode "Extended_Pictographic" ranges fails the build |

### Safety
| # | Rule | What it means here | How it's checked |
|---|---|---|---|
| 22 | **Password strength checking** | A live meter with words (never colour alone) using a strength estimator (zxcvbn-ts), a 12-character minimum enforced by Supabase, and a check against known breached passwords through the Pwned Passwords range service, which only receives the first 5 characters of a hash, never the password. Paste and password managers always work. Feedback is soft: "Add a few more words and it'll be strong." | Tests with weak, common, breached and strong passwords; check the network call sends only 5 characters |
| 23 | **Vulnerability checks** | Before every release and in CI: `npm audit` on production dependencies (fail on high), a dependency scan (OSV), a committed lockfile with exact versions, a secret scan of the repo, security headers (a strict Content-Security-Policy, `X-Content-Type-Options`, a strict `Referrer-Policy`, `Permissions-Policy` allowing the microphone only for our own origin, no framing, HSTS on Vercel), no `dangerouslySetInnerHTML` anywhere, and the existing `scripts/attack_live.py --api` run against whatever API the site talks to. The CORS allow-list is exactly our site's origin. | The checks themselves; XSS test strings typed into every input render as plain text |
| 24 | **Nothing secret reaches the browser** | Only public values go in the frontend: the Supabase URL and anon key, the Turnstile site key, and the support contact. Never the service-role key, the database URL, any password or any private token. The anon key is public by design; patient data is protected by the database rules we attack live. | A build step decodes every JWT found in the built files and fails if any role is not `anon`; searches the built files for `service_role`, `postgres://` and private-key patterns; `.env` files are git-ignored and `.env.example` holds names only |
| 25 | **Images compressed** | Photos and stills in AVIF or WebP with a fallback, responsive sizes, lazy-loaded below the fold, width and height set to avoid layout shift; hero still under 150 KB; 3D models compressed (Draco or Meshopt). | A size budget in the build that fails when exceeded |

### Search, sharing and machine-readable
These make the site readable by search engines, link previews and AI assistants, not just by people in a browser. They matter most on the **public pages**: Welcome, Sign in, Sign up, Clinician sign-up, Terms, Privacy, Accessibility and Help. Signed-in pages are private: they carry `noindex, nofollow` and are left out of the sitemap and `llms.txt`.

| # | Rule | What it means here | How it's checked |
|---|---|---|---|
| 26 | **View source is never empty** | A single-page app normally ships an empty `<div id="root">`. Every page is **rendered on the server** (rule 35), so the HTML a browser first receives already contains the real heading, text, links, meta tags and structured data. Signed-in routes are server-rendered as a **shell** (title, layout, a friendly `<noscript>` message), with the person's own data loaded in the browser after sign-in. | Fetch every public route with no JavaScript (a plain HTTP request) and assert the page's heading and main text are in the HTML; fetch the others and assert the shell and `<noscript>` are present |
| 27 | **An `og:image` on every page** | A 1200 by 630 image under 300 KB (compressed), referenced by an **absolute** URL, with `og:image:width`, `og:image:height`, `og:image:alt`, and `twitter:card` set to `summary_large_image`. Calm artwork of the tree and the product name, no emoji, no text smaller than a headline. | Read the tags on each route; request the image and check type, size and dimensions |
| 28 | **Structured data** | Semantic HTML landmarks (`header`, `nav`, `main`, `footer`, headings in order) **and** JSON-LD on public pages: `Organization` (details in rule 40), `WebSite`, and a `WebPage` for each page, with `BreadcrumbList` on legal and Help pages and `FAQPage` only if the Help page really is questions and answers. Written with typed `schema-dts`. Nothing invented: no ratings, reviews or medical claims, and no `MedicalOrganization` or similar, because the product isn't one. | Parse every JSON-LD block (it must be valid JSON and type-check); compare each fact with the visible page |
| 29 | **Exactly one `h1` per page** | One `h1`, which names the page; sections use `h2` and below. The 3D hero never adds a second one. Checked in the prerendered HTML and in the running app after each route change. | Count `h1` on every route in both forms: exactly 1 |
| 30 | **A canonical tag** | `<link rel="canonical">` on every page, absolute, pointing at the page's own clean address (no query strings or fragments). Signed-in pages carry a self-canonical together with `noindex`. | Read the tag on each route and compare with the page's real URL |
| 31 | **An `llms.txt`** | Served at `/llms.txt`: a short Markdown file for AI assistants with the product name as `h1`, a one-paragraph honest summary (a speaking and practice aid, not a medical device), and links to the public pages with one line each (Terms, Privacy, Accessibility, Help). Public information only, never anything about a person or a session. It is a proposed convention, not a standard, and some crawlers ignore it; it costs nothing to add. | Request `/llms.txt`; check it lists only public, working links |
| 32 | **A `sitemap.xml`** | Served at `/sitemap.xml` and listed in a `robots.txt` line. Lists only the public, indexable pages by their canonical address with a `lastmod` date from the build; never signed-in pages, the 404 page, or anything with a query string. Absolute addresses come from one setting, `VITE_SITE_URL`. | Validate the XML; request every address (each must return 200 and match its own canonical tag) |
| 33 | **A `lang` attribute** | `<html lang="en">` on every page, in the prerendered HTML and after navigation. Any passage in another language gets its own `lang`. | Read the attribute in both forms; it must be a valid language tag |
| 34 | **No source maps in production** | The production build produces no `.map` files and no `sourceMappingURL` comment, and the host serves none. Source maps are for development only; if error tracking is added later its maps go to that service privately. | Fail the build if any `.map` exists or any built file mentions `sourceMappingURL`; request a `.js.map` address from the deployed site and expect 404 |

### Rendering, redirects, content signals and reach
Already covered above and not repeated: **one `h1` per page** is rule 29; the Organization schema is part of rule 28 and made explicit in rule 40.

| # | Rule | What it means here | How it's checked |
|---|---|---|---|
| 35 | **Server-side rendering (decided: real SSR)** | The app is rendered on a server for every request (React Router in framework mode, running as a small Node server), so pages arrive as complete HTML and then become interactive in the browser (hydration). **Public pages** render in full. **Signed-in pages render only a shell** on the server, because the login lives in the browser: the server never sees a patient's session token and never renders anyone's personal data, which is the safer design for health information. Browser-only parts (the 3D scene, GSAP, Lenis, the microphone, the smooth caret's measuring) are wrapped so they run only in the browser and cause no hydration mismatch. The Node server also sends the security headers, the 301 redirects, the real 404 status, `robots.txt`, `sitemap.xml` and `llms.txt`, and passes `/api` and the WebSocket on to the speech API. | Fetch every route with JavaScript off: the heading, text, meta, canonical and structured data are present for public pages and the shell for signed-in ones; the browser console shows no hydration warnings on any route; no private data appears in any server-rendered HTML |
| 36 | **A `robots.txt`** | Served at `/robots.txt`. Allows the public pages and assets; disallows the signed-in routes (`/home`, `/speak`, `/progress`, `/voice`, `/care`, `/me`, `/setup`, `/clinician/`) and `/api/`; has the `Sitemap:` line. It is a courtesy to crawlers, **not a lock**: privacy comes from sign-in and the database rules, and from `noindex`. It never lists anything secret. | Request it; check the rules and the sitemap line; confirm every disallowed route also returns `noindex` or requires sign-in |
| 37 | **301 redirects for moved or alternative addresses** | Permanent, server-level `301` responses (not client-side jumps) from: `http` to `https`; `www` to the bare domain (or the reverse, chosen once); a trailing slash to none; `/index.html` to `/`; and friendly aliases to their real pages (`/login` and `/signin` to `/sign-in`; `/signup` and `/register` to `/sign-up`; `/privacy-policy` to `/privacy`; `/terms-of-service` to `/terms`; `/contact` to `/help`). Query strings are kept. No chains, no loops, one table in one file. Anything unknown is a 404, never a redirect to Home. | A test requests each old address and asserts status 301, the right `Location` and a single hop; unknown addresses return 404 |
| 38 | **Alt text on every image** | Every `img` has an `alt`. Meaningful images get a short, plain description of what they show (under about 125 characters, no "image of", no file names, no emoji); purely decorative ones get `alt=""`. SVG icons used with text are hidden from screen readers (`aria-hidden`); icon-only buttons have an `aria-label`. The 3D scene is `aria-hidden`; the share image has `og:image:alt`. Tree artwork says what it conveys ("A small tree with a few new leaves"), not just "tree". | A test fails on any `img` without `alt`, on an `alt` equal to its file name, or on an icon-only control without a label |
| 39 | **Lazy loading** | Images below the first screen use `loading="lazy"` and `decoding="async"`, with width and height set so nothing jumps. The main picture on the first screen is **not** lazy (`fetchpriority="high"`). The heavy parts load only when needed: Three.js and the scene after first paint, each screen's code split by route, ScrollTrigger only on pages that use it, video with `preload="none"`. | A test checks the first-screen image is eager and below-the-fold images are lazy; the first-load JavaScript budget in the performance section holds |
| 40 | **Organization schema** | On every public page, a JSON-LD `Organization` with the name, site address, a logo (absolute address, at least 112 by 112) and, **in production only**, a `contactPoint` (customer support, the real email and phone, English). Nothing else is invented: no social profiles, founders, addresses or ratings unless they really exist. **Demo contact values never enter structured data, the sitemap or `llms.txt`**, so a sample can't be published as fact. | Parse the block; check each field against the page and settings; a demo build must contain no `contactPoint` |
| 41 | **Breadcrumbs** | A visible breadcrumb on pages two levels deep (for example Home, then Privacy; Patients, then Patient 3f9a, then Session 12): an ordered list inside `nav aria-label="Breadcrumb"`, the last item marked `aria-current="page"`. The matching `BreadcrumbList` JSON-LD is generated from the same data so they can't disagree. Patient screens stay flat and have none. | A test compares the visible trail with the JSON-LD and checks the links work |
| 42 | **Internal links** | Every public page links to at least three other relevant public pages **inside its own text**, not only the menu and footer, using words that say where the link goes ("how we keep your recordings private", never "click here"). No page is an orphan: every public page is reachable within two clicks of Welcome. Legal pages link to each other and to Help. | A crawler builds the link graph: no orphans, at least three in-body links per public page, no generic anchor text |
| 43 | **Google Analytics, with consent (DEFERRED)** | **Decision: "no for now"; it stays open for later. Nothing in the build loads analytics, and the cookie-choices card is not built until it's decided.** If it is ever turned on: Google Analytics 4 may count visits to the **public pages only**. It loads **only after the visitor says yes** to a clear, equal-weight choice ("Yes, that's fine" and "No thanks", same size and look, no nagging, changeable any time from "Cookie choices" in the footer), with consent defaulting to denied. It **never** runs on signed-in screens, and never receives a user id, an email, a transcript, a recording name or anything the person said or did in the app. The Privacy page names Google Analytics, what it collects and how to say no. The measurement id is public. Content-Security-Policy allows Google's scripts **only** on public pages. A health app owes people this restraint: signed-in visits to a speech-therapy tool are sensitive even without a name attached. (A privacy-first alternative such as a self-hosted counter would avoid third-party tracking altogether; GA4 is what was asked for, so it is specified carefully.) | While deferred: a test that no request to Google is ever made. If turned on: no Google request before consent, none after "No thanks", none on any signed-in route; a request only after "Yes" on a public page; the Privacy page text matches |
| 44 | **Search Console** | The site is registered in Google Search Console, verified with a `google-site-verification` meta tag (a public value) or a DNS record, and the sitemap is submitted. **This needs a public address**: a localhost address cannot be verified, so it is done once the site has one (the tunnel or a domain), and a stable address (a domain you own) is far better because a changing tunnel address would need re-verifying every time. | The verification tag is present on Welcome in the public build; Search Console shows the property verified and the sitemap read |
| 45 | **A working contact form** | On **Help**: topic (sign-in trouble, my voice, my data, clinician verification, something else), name (optional), email (so we can reply), message. A line asks people not to put medical details in it. Turnstile, a hidden honeypot field and length limits guard it. It sends to a **new server route** that checks everything again, verifies the Turnstile token on the server, limits how often one address or one network can send, and saves the message in the database where only the administrator can read it, and **deletes it automatically after 12 months** (a scheduled job in the database). **It also emails the message to the team's support inbox** (sent from the server through an email service; the inbox address and the mail credentials live only in the server's settings, never in the frontend). The success message appears **only after the email service has accepted the message**, and it says so plainly: "Your message has been sent to our team by email. Thank you for telling us." If the message was saved but the email couldn't go out, the person is told that honestly ("Your message is saved, but I couldn't send the email just now. We'll still see it.") and nothing is lost. It never promises a reply time unless that's true. Accessible: labels not placeholders, an error summary that takes focus, inline errors, `autocomplete` hints, 16px text. Needs backend work (below). In the demo the team's inbox is the owner's real mailbox (set in the server's settings; it is **not** the sample address shown on the page), so the form genuinely reaches the owner while the sample email and phone shown on Help don't. The Help page's demo note says exactly that. | Tests: valid send saves one row and shows the success message; bad email, empty message, over-long message, missing or failed Turnstile, a filled honeypot and rate-limit hits each fail kindly; no client can read the messages table |

**Backend work these rules need** (none of it exists yet):
1. A `contact_messages` table (server-write only, no client access) and `POST /api/contact` with Turnstile server verification, a per-address rate limit and length limits; the Turnstile **secret** stays in the server's environment.
2. The clinician verification columns and rules (see [Clinician verification](#clinician-verification)).
3. A scheduled database job that deletes `contact_messages` rows older than 12 months (Supabase can schedule SQL).
4. **An email sender** used by `POST /api/contact` to send each message to the team inbox. For the demo, the simplest is SMTP through the owner's own mailbox with an app password (no domain needed; check the provider's daily sending limit); once there is a domain, switch to a transactional email service. The sender's credentials stay in the server's environment.

**Frontend-side work (not backend):** the page server owns the 301 table, the true 404 status, `robots.txt`, `sitemap.xml`, `llms.txt`, the security headers, and the forwarding of `/api` and the WebSocket to the speech API (including the WebSocket upgrade).

### Themes, the garden and sound
| # | Rule | What it means here | How it's checked |
|---|---|---|---|
| 46 | **A light and dark toggle, and both themes fully usable** | The header toggle is on every page. In both themes every text passes 4.5:1 (3:1 when large), and every control's edge, icon, focus ring and state passes 3:1 against what is directly behind it, as in the [dark theme table](#dark-theme-winter-evening). Components use colour tokens only, never a typed-in colour, so nothing can be forgotten when the theme changes. The server renders the chosen theme, so there is no flash of the other one. | A script recomputes every token pair from the token file and fails the build below the limits; a scan fails on any colour literal outside the token file; axe-core runs on every route in both themes; every route is screenshotted in both themes at 390 and 1440 and looked at by eye; a test loads each route with the theme cookie set and checks the first HTML already carries that theme |
| 47 | **An open 3D garden on every page, never in the way** | Every route has its garden stop (the table in [the winter garden](#the-winter-garden-3d-on-every-page)), drawn by one scene that persists across pages, edge to edge with no frame. It takes no clicks, is hidden from screen readers, and falls back to a still picture of the same stop (no WebGL, weak device, saving data, reduced motion, "Show the garden" off). Words over it only on its calm side; buttons and fields over it on their own solid fill. It never makes a page slower to read or use. | A test checks each route has its garden and still picture; reads the canvas pixels behind every text element over the garden and computes contrast with that text (4.5:1, or 3:1 when large); checks the canvas is `aria-hidden` and `pointer-events: none`; checks the WebGL context is created once across a whole journey; the performance budget below holds |
| 48 | **Garden sounds, always under the person's control** | Soft garden sounds start only **after sign-in**, fade in, stay quiet, and can be turned off with one press from the header on every signed-in page; the choice is remembered. They **stop before the microphone opens** and stay off while it is open, and go silent while the corrected voice or a voice sample plays, so they never get into a recording or talk over the patient's voice. They pause when the tab is hidden and stop on sign-out. Never on public pages. | Tests: no audio context is created on public pages; sounds start after sign-in and the toggle stops them; the gain is 0 for the whole time the microphone is open and while speech plays; the choice survives a reload; nothing plays after sign-out |

## UX laws applied

| Law | Decision in this product | Where |
|---|---|---|
| **Aesthetic-usability** | Calm, finished, well-aligned visuals make the app feel easier and more trustworthy than it is; a patient forgives a slow second more readily in a beautiful room | Whole system, 3D tree, type |
| **Hick's Law** | One primary action per screen; five nav items; setup is three steps; choices shown 3 at a time (voices as a short list with samples) | Nav, Setup, Voice |
| **Fitts's Law** | 48px minimum targets, 56px buttons, 112px record button, primary action in the thumb zone, full-width on phones, bottom tab bar | Layout, Speak |
| **Jakob's Law** | Familiar patterns: email + password, bottom tabs, a mic button that works like a voice-memo app, standard PDF download | Auth, Speak, Reports |
| **Miller's Law** | Max five tabs, chunked info (cards of 3 to 5 items), recent phrases capped at 5, a 10-character code shown in two groups of five | Nav, Home, Care |
| **Doherty Threshold** | Response under 400ms feels instant: every tap changes state within 100ms; the recogniser's 0.3 to 1 s is hidden by a "listening / working" progression, and the result is staged | Speak |
| **Law of Proximity** | Grouping by space only (8 to 16px inside, 40px between), no divider lines | Layout |
| **Law of Similarity** | All primary actions look alike (coral pill), all secondary alike (teal), all danger alike; chips and cards are the same everywhere | Components |
| **Visual hierarchy** | Result at Display size, actions next, context last; the tree is large but low-contrast to the text | Speak, Home |
| **Progressive disclosure** | Voice sliders behind "Fine-tune"; measurements for clinicians only; "What I heard" under the result; help text on demand | Voice, Progress, Speak |
| **Recognition over recall** | Labels never placeholders; recent phrases listed; the bank/save status always visible; icons paired with words | Forms, Home, Voice |
| **Von Restorff** | The one coral button (and the record button) is the only thing in coral; the celebration is the only moment with extra motion | Every screen |
| **Peak-end rule** | Session summary opens with wins and closes on the growing tree; errors are always followed by a clear next step so a bad moment doesn't become the memory | Summary |
| **Goal-gradient effect** | Setup progress bar fills; the tree's next-branch progress is shown; "2 phrases to your next leaf" | Setup, Home |
| **Serial position effect** | Speak sits in the middle of the tab bar (most prominent), Home first, Me last; the most important item in every list goes first | Nav |
| **Tesler's Law (conservation of complexity)** | The app absorbs complexity so the person doesn't: it auto-detects when a phrase ends, picks the voice's pitch from recordings, chooses the repair silently, pre-fills corrections | Speak, Voice |
| **Postel's Law** | Be liberal in what we accept: any common audio format, any sensible browser mic, codes in any case or with spaces, forgiving name and password handling; be conservative in what we show | Inputs, Care |
| **Occam's razor** | If a feature or screen isn't needed for speak → confirm → progress → share, it's cut (no journal, no social, no streak shame) | Scope |
| **Feedback loops** | Press → state → result → confirm → learned ("I'll remember that") → visible growth. The loop is closed in under a second at every step | Speak |
| **Gestalt (closure, common region, figure/ground)** | Cards form regions; the tree is figure on a calm ground; progress rings close | Home, Progress |
| **Mental models / consistency** | The same words everywhere: Speak, Voice, Progress, Care team, Me | All |
| **Error prevention** | Confirmation only for irreversible acts; undo elsewhere; disabled-with-reason beats hidden | Delete, Care |

## Motion, 3D and scroll

Principle: the app should feel alive and calm, never busy. Motion confirms, guides and rewards; it never competes with reading, and it never waits for the person.

### Libraries and what each is for
| Library | Used for | Notes |
|---|---|---|
| **Three.js** (via **React Three Fiber**) | The winter garden on every page | Detailed garden from glTF models and real textures (tree, boughs, hedges, winter flowers, ferns); **one canvas for the whole app**, mounted once at the root and never remounted on navigation. drei was dropped: the one helper needed (a frame-rate monitor) is fifteen lines of our own |
| **Web Audio API** (built into the browser) | Garden sounds | A looping buffer through one gain node, so fades and the instant silence before recording are exact; no library needed |
| **Anime.js** (v4) | Small 3D and object tweens: easing the tree's growth, leaf spawn, the record button's ring | It animates object properties, so it can drive Three.js values and SVG; it does not render 3D by itself |
| **GSAP** (+ ScrollTrigger, `@gsap/react`) | Page transitions, loading transitions, staged entrances, the celebration | npm lists its licence as GSAP's "Standard 'no charge' license" (gsap.com/standard-license); read its terms once before the final submission |
| **Lenis** | Smooth scroll on long pages (Welcome, Progress, clinician report) | Off for reduced motion; never on forms or in the Speak screen |
| **ReactBits** components | Copied in and restyled to the tokens: heading text reveal, animated lists, count-up numbers, and a smooth-caret input as the starting point | Check each component's licence; restyle to this system; use only a few, none heavy; no animated full-page backgrounds |

Reference sites: ThreeUI's Sylva hero shows a Three.js "living world" (roots, ferns, pollen, a butterfly) behind real HTML; haoqi.design shows rich, tactile pointer response. We take the *feel* (a living scene that answers the cursor, real DOM on top), not their layouts, and we stay far lighter than haoqi.design.

### The winter garden (3D on every page)
**The idea.** The whole site is one slow walk through a garden on a winter morning. Each page is a stop on the same path. The garden is **one scene that stays alive** while the person moves around the app; going to another page doesn't load a new scene, it walks the camera a few steps along the path to the next stop while the new page's content rises in. That continuity is what stops page changes feeling jarring.

**What grows in it (real winter plants, so it feels true), built in detail, close up:** a scanned fallen trunk and moss-covered rocks; a dense lawn of grass blades that moves in the wind; **snowdrops** with three curved outer petals and green-tipped inner ones on nodding stems; **hellebore** clumps (cream and plum) with leathery palmate leaves and nodding cupped flowers with stamens; **cyclamen** with swept-back petals over silvery leaves; scanned **ferns** and yellow **celandine**; a park bench and old street lamps; real trees and firs fading into the mist. And the tree (a scanned tree with real leaves), which is meant to grow with the person's practice.

**Light per theme.** A real sky over the park (a gradient dome: deeper overhead, paler at the horizon, a soft glow round the sun), and a haze that starts about 9 m out and hides things by about 45 m, so the park reads deep and open rather than lost in white. Morning (light theme): a clear pale winter sky, a low gold sun from one side with soft shadows, a blue-green haze. Evening (dark theme): golden hour going to dusk, never night (the owner found a near-black evening scary): a peach horizon under a soft blue sky, a warm low sun, the lamps lit along the walk with warm pools of light, the garden still clearly seen. Materials are smooth and softly lit (no glow, no bloom); colours live in `web/app/three/palette.ts`, the one place besides the token file allowed colour values. The page's own mist mask still fades the scene into the page colour behind the words.

**The stops.** Every route has one. How much of the screen it takes depends on the page's job: generous where the page is about feeling, small where the page is about a task.

| Page | Stop on the path | What's in view | Size |
|---|---|---|---|
| Welcome | The start of the walk | The great mossy bough and the snowdrop bank, the paved path leading in between hedges | Hero: the right half on desktop, the top 40% on phones |
| Sign up, Sign in, Clinician sign-up | Just inside the gate | Snowdrops along the path edge | Side panel on desktop, a 120px band on phones |
| Setup | Three stepping stones | The camera moves one stone per step (the progress you can see) with a flower opening at each | Band above the step |
| Home | The clearing with the tree | The tree, its new leaves for today, the bench | Beside "Today" on desktop, a 200px band on phones |
| Speak | A quiet corner by the bench | Hellebores by the bench; while the microphone is open the grass and snowdrops sway with the person's voice, and each confirmed phrase opens a hellebore | Calm and close |
| Session summary | Back at the tree | The celebration: a new branch, a few leaves lifting | Generous, like Home |
| Voice | The ferns under the tree | Ferns and snowdrops round the tree's foot | Band |
| Progress | The long border | Shrubs along the walk; purely scenery (the numbers stay in the page's charts) | Band |
| Care team | Two benches side by side | The idea of sitting with someone you trust | Band |
| Me | The old stump | Your own corner of the garden | Band |
| Help and legal pages | The bed walk | The planted beds along the walk, a bench and a lamp ahead | Small header band |
| 404 | A fork in the path, lightly snowed over | "You're not lost" | Medium |
| Clinician pages | The garden seen from the greenhouse window | Very still; no pointer play | Small corner only: these are work screens |

**Small, light and made for the web:**
- **Models are glTF files** made by our own asset pipeline (below), at three levels of detail, compressed, and loaded after the page is usable. Tiny repeated pieces (grass blades, moss strands) are still made in code because they are a few vertices each; they are **instanced**, so thousands cost one draw call, and they sway in a wind shader.
- Only what is near the current stop is drawn; the rest of the path is hidden.
- Budgets: up to about 400k triangles in view on a laptop (instancing makes this cheap), about 60 draw calls, one shadow-casting light plus sky light, no post-processing. Phones get about half the density, no shadows and a pixel ratio of 1.25.
- **Animated while on screen, idle off screen** (the owner's call): the garden draws continuously while it is visible, so the grass, ferns and flowers keep moving; anything off camera is culled, so it is neither drawn nor animated (the tree also skips its own animation when it is out of view), and nothing at all is drawn while the tab is hidden. Animations keep their own clock with a capped time step, so nothing jumps when drawing resumes. A frame-rate monitor drops to a lower resolution the first time it sees under 40 fps, and swaps to the still picture if it happens again.
- Three.js and the scene load **after** the page is readable and interactive; they never delay the text or the main button.

**Still pictures (server rendering and fallback).** Each stop has a still picture in each theme, rendered from the real pages by `web/scripts/render-stills.mjs` once the garden has settled (page hidden, mist mask off, since the mask is applied again on top), for both themes and both screen shapes (wide 1440x900, narrow 390x844), encoded as WebP inside Chromium (21 to 115 KB each); the list of stops that have one is `web/app/three/stills.json`, so a page never requests a picture that doesn't exist. Re-run it (against the running built site, then rebuild) whenever a page with a new stop is added or the scene changes. Both themes' pictures are in the HTML with the hidden one switched off by CSS and both `loading="lazy"`, so only the one showing is downloaded (an intended exception to rule 39's eager first-screen picture: the garden is decorative and the live scene covers it). The server puts them in the garden's area, so the very first paint, view-source and the no-JavaScript page already show the garden. When the live scene is ready it cross-fades over the picture. The same pictures are the fallback for no WebGL, weak devices, saving data, and "Show the garden" switched off; under reduced motion the live scene is replaced by the stills and page changes cross-fade between them.

**Between pages.** The camera walks to the next stop in **2.8 s**, unhurried (ease-in-out), so the walk itself is felt and the next area has time to load. It doesn't block anything: the new page's content arrives at once and is usable; the walk finishes behind it. Navigating again mid-walk simply turns the camera toward the new stop from wherever it is.

**Theme change.** The garden re-lights from morning to evening (or back) over about 600ms: light colour and angle, sky band, lanterns, frost. Nothing reloads.

### Why each part of the garden is there

No 3D for its own sake: every element has a job in the story or in guiding the patient. Anything without a job is left out: the drifting pollen and the camera's pointer drift were removed for this reason, and the gateposts and the butterfly were removed on the owner's review (static, they read as hollow shapes in the mist).

| Element | Its job | Where it does it |
|---|---|---|
| **The path and its stops** | Wayfinding: each page is a recognisable place, and moving between pages is a short walk, so the person always knows where they are and that they moved | Every page |
| **The tree** | The person's progress: a leaf for each confirmed phrase today, a new branch at milestones, never withering | Home, Session summary |
| **Grass and snowdrops** | "I can hear you": while the microphone is open they sway with the loudness of the person's voice, a calm live level meter in the world | Speak, mic check |
| **A flower opening** | Reward: each confirmed phrase opens one hellebore by the bench | Speak, Session summary |
| **The lanterns** | Working state: their glow breathes while the recogniser is working ("Working on it..."), and they light the evening look | Speak; evening |
| **The ferns by the tree** | A quiet corner to shape your voice in; they sway in the wind like the rest of the garden | Voice |
| **The three stepping stones** | Setup progress: one stone per step, a flower opening on each finished step (goal gradient) | Setup |
| **Fallen trunk, rocks, beds, lamps, distant trees and firs** | The setting: they frame each stop's subject on the far side from the words and give the near side its calm mist | Every page |

Live today: the grass sways with the voice while the microphone is open (Speak, mic check); the lamps' glow breathes while the recogniser works; the grass, snowdrops, ferns and flowers part around the pointer as it passes over them, like a hand brushing through (a touch parts them once where it lands). The trees never move with the pointer (the owner's call: a whole tree swaying under the mouse felt wrong); their leaves only stir in the breeze. A small flock of birds wheels slowly over the park, so it feels alive, not abandoned. Not built yet: the tree's leaf per confirmed phrase, the hellebore opening per phrase, and the flower on each finished stepping stone; until then those pages say it in words. The witch hazel and the camellia were removed with the move to scanned models (the code-made versions didn't hold up beside the scans), so the coral record button and the one coral action stay the only coral on screen.

### How the garden is made and delivered (asset pipeline)

The models go through `web/scripts/assets/`:
1. **Source:** two kinds. **Scanned:** photogrammetry models from Poly Haven (CC0, `fetch_models.py`): the tree (tree_small_02), the fallen trunk, the stump, two moss-rock sets, ferns, celandine, the park bench and the street lamp, cleaned by `prepare_scanned.py` (only the parts named in its keep list survive, so a modular kit's spare pieces never float in the scene). **Made in code:** the flowers Poly Haven doesn't have (snowdrops, hellebore clumps with leathery palmate leaves and nodding cupped flowers, cyclamen) and the stepping stones, generated at full detail by `web/app/three/kit.ts` and written to glTF (`.glb`) with vertex colours.
2. **Bake:** where it helps, Blender bakes ambient occlusion into the vertex colours (crevices in bark, under petals), so the depth costs nothing at run time.
3. **Decimate:** Blender's Decimate modifier (collapse) removes unnecessary vertices to three budgets per asset: **LOD0** (near, desktop), **LOD1** (mid distance, and phones), **LOD2** (far).
4. **Optimise:** gltf-transform welds, deduplicates, prunes, quantises and compresses each tier (meshopt), into `web/public/models/<asset>-lod{0,1,2}.glb`.
5. **Budget:** a check fails the build if any hero asset file is over **2 MB** (the target is far below that).

**Real material textures.** The ground, the walk and the stepping stones use photographed PBR materials from ambientCG (CC0, public domain; `web/scripts/assets/fetch_textures.py` downloads them, keeps the colour and normal maps, and writes WebP to `web/public/textures/` with `CREDITS.txt`): PavingStones138 (old pavers, moss in the joints) for the walk, Grass004 for the lawn, Moss002 for its patches, Rock058 (grey) for the stepping stones, all at 1024 px. They are projected **triplanar** in the shader (`web/app/three/surfaces.ts`: sampled along all three axes and blended by facing, with normal mapping), so the ground and stones take them without stretched UVs. The scanned models keep their own photographed textures, resized and converted to WebP by gltf-transform.

**Distant trees are impostors.** Blender renders the full-detail tree and the firs (`bake_impostor.py`, Cycles, transparent background) to pictures, and each distant tree is two crossed cards carrying them (`web/app/three/impostors.ts`): real-looking trees in the mist for almost no triangles. Leafy models are never decimated (collapse decimation tears card foliage apart); they ship at full detail with fewer instances instead.

**A park, not just a garden (2026-10-28, after the owner's review).** Inspired by Central Park: gravel paths (ambientCG Gravel032) wind off the paved walk (a meadow loop to the west, a path climbing east to the hills, a spur to the picnic lawn), and park-green signposts with cream lettering stand at the junctions ("Meadow Loop", "The Clearing", "Hill Walk", "Picnic Lawn", "North Woods", "Lake Walk"). The benches are Central Park settees built in code (`kit.parkBench`: weathered wood slats, ambientCG Wood063, on curved cast-iron frames), two side by side facing the tree; the Poly Haven street-seating kit was dropped because its file is an exploded kit, not an assembled bench. **People:** three visitors made with MakeHuman (MPFB in headless Blender, CC0 assets; `scripts/assets/build_person.py` solves a sitting or standing pose bone by bone, bakes it and exports for the usual three tiers, about 180 KB each): two sitting at the picnic table, one stopped on the meadow loop; they are kept at a distance, where the haze softens them. A small flock of birds wheels overhead. The morning is brighter and clearer (a blue sky, stronger warm sun, fresher grass); the evening is a light, warm dusk.

**The fountain plaza (2026-10-28, second review).** The view the camera turns to after signing in read as a wood, so it became a park scene: a paved round plaza (r 3.4 m) west of the clearing with a two-tier fountain after Bethesda Fountain (`kit.fountain`, lathed pale stone, still teal water, thin streaks of water running over the rims), four settees round its edge facing it, and the meadow loop running through it. Signs say "The Fountain" from the walk and from the loop. Every gravel path runs on out of sight into the hills (west across the meadow from the plaza, east up the hill walk and past the picnic lawn, and on from both ways at the fork), so the park never stops at the edge of the view. The side firs stand further back (13 to 20 m) so the lawns are open. The settees are painted Central Park green on black iron (as the real ones in the less formal parts of the park) and stand on a gravel apron by the walk; their iron frames had been mounted backwards and are fixed. Six visitors: three more (a man at the fountain, a woman sitting on a plaza settee, a woman walking the west path), each T-shirt in its own colour (`scripts/assets/recolour.py`; every casual suit in the MakeHuman packs has the same blue tee). **Evening:** the distant tree pictures are unlit, so at dusk they glowed pale like cut-outs; they are now dimmed to a dusky blue-grey with the lamps (`impostorLight`), and the dusk haze is darker (#A49AA8), so the far trees read as silhouettes against the peach sky.

**The city and the far park (2026-10-28, third review).** A city skyline stands round the park at 86 to 100 m (`three/skyline.ts`: one mesh of brick, limestone, grey and glass blocks with setbacks, windows drawn by its shader, faded into the sky's horizon colour; in the evening some windows are lit), so the garden reads as a park inside a city. The fountain plaza moved further off (19 m from the clearing, a little left of the tree so it shows beside it, levelled on the hillside), larger (r 4.2 m, fountain at 1.3 times), with six settees and people sitting and standing round it. The far park is peopled for immersion only: settees along the far gravel paths, people sitting on them, walking the paths and standing in groups on the far lawns, all drawn with the visitors' lightest tier and instanced (a few draw calls for any number), and nothing stands within 2.8 m of the line from the clearing to the fountain. Everyone stands on gravel: paths, or round gravel pads under the settees, groups and the picnic table. The lawn runs out under the city, so no gap shows at the horizon; the morning haze is a softer green-grey (#CFDCD5). Desktop 40 to 52 fps on integrated graphics (mains), phones 60.

**Morning mist and lost graphics.** The pale mist over the words on the left let the garden through at 10% and read as a harsh white wash; in the morning it lets 22% through, the most at which every link still clears 4.5:1 (evening stays 10%), and the words still pass the contrast test against the real pixels. If the browser takes the graphics context away (it can, while the person is in another app), the garden is rebuilt when the tab is visible again; after three losses it settles for the still picture. The frame-rate check starts over each time the tab comes back, and only falls back to the still picture below 25 fps (40 fps first lowers the resolution).

**Leafy trees and shrubs.** The full trees (Poly Haven `island_tree_01` in the clearing, `island_tree_02` at the start of the walk) and the shrubs (`searsia_lucida`) are leafy scans of more than a million triangles. Collapse decimation tears their separate leaves apart (which is why the first tree looked dead and low-grade), so `prepare_scanned.py` instead replaces each leaf with one flat card in that leaf's own outline (its hull in texture space, five corners, three triangles instead of 24), keeps a share of the leaves per tier and enlarges each kept leaf so the crown stays full; only the wood is decimated. The fallen dead trunk at the start was replaced by the living tree. Things stand on the ground: soft contact shadows under every tree, shrub, bench, table and lamp, because the sun's own shadows only reach the few metres round the camera's subject. The ground rolls, and rises into soft hills on both sides and behind the fork, so the park has its own horizon.

Measured (2026-10-27, `node scripts/assets/build-models.mjs`, 16 assets): every tier of every model together is **15.3 MB**; the largest single file is the clearing tree's LOD0 at **1.9 MB**. Frame rate on integrated graphics (Intel UHD, the GPU a browser on this laptop uses by default), 1440x900: **43 fps** at the opening stop (the densest view) and **59 fps** at the fork, about 0.9 million triangles and 195 draw calls in view. What it took: plants don't cast the sun's shadow; grass is drawn in 4 m tiles only within 10 m; flat ground and the path use one top-down texture projection instead of three (pixel cost, not triangles, was the limit on integrated graphics); three point lights for the evening pools instead of one per lamp.

At run time the loader picks the tier by device (desktop starts from LOD0, phones from LOD1) and swaps by distance (each hero is a `THREE.LOD`). Repeated flowers use one tier per stop, chosen by the camera's distance to it.

### The tree (Home and the summary)
- **Pointer response (must feel right and never get in the way):**
  - The canvas sits **behind** content with `pointer-events: none`; it reads the pointer from `window`, so buttons, links and text always win.
  - Hover/move: the plants under the pointer part around it (grass, snowdrops, ferns, flowers); the tree itself doesn't move with the pointer, only its leaves stir in the breeze (the owner's call).
  - Touch: a tap parts the grass once where it lands; scrolling is **never** captured, and there is no drag-to-rotate that fights the page scroll.
  - Keyboard users aren't affected; the scene is decorative (`aria-hidden`).
- **Home growth:** a leaf blooms for each confirmed phrase today; a new branch at milestones; it never shrinks.
- **Performance and fallbacks:** as for the whole garden above. The PDF report and anywhere 3D can't go use a flat SVG of the tree. Every page must be fully usable with the scene absent.

### Garden sounds
- **What it sounds like:** a quiet winter garden: a light breeze, a robin singing now and then (robins really do sing on winter mornings), far-off birds. **No music, no melody, no water rushing, no sudden sounds.** Very low level, evenly mixed. It loops seamlessly (60 to 120 seconds long) so nobody notices the loop. In the evening theme the same garden, quieter, with fewer birds.
- **Where it comes from:** `web/public/sounds/garden.ogg`, a 90-second seamless loop (mono Opus, 690 KB) mixed from public-domain and CC0 recordings on Wikimedia Commons: "Gentle breeze and birds singing" and "Birds singing in garden" as the bed, and four short phrases from "Robin's song" (CC0) placed far apart; every layer wraps round the loop with crossfades, mixed quiet (-30 dB) with no sudden peaks. Credited on the Accessibility page and in `public/sounds/CREDITS.txt`. (A recording with geese honking was left out: sudden sounds.) The owner can still swap it (open decision 10).
- **When it plays:** only on signed-in pages. It starts **after sign-in** (pressing "Sign in" or "Create my account" is the user action browsers require before sound) with a 4-second fade-in, and the first time, a short note beside the toggle says how to turn it off. If the person turns it off, it stays off on this device until they turn it back on. The audio file loads only after sign-in, never on public pages.
- **When it stops (never negotiable):**
  - **Before the microphone opens** (record button, conversation mode, mic check): fades out in 150ms and only then does the mic start, so it never gets into a recording or confuses the recogniser. It returns, fading in, a second after the mic closes.
  - **While the corrected voice or a voice sample plays:** silent, then back afterwards.
  - When the tab is hidden, when another app takes audio focus, and on sign-out.
- **Screen readers:** the toggle is the first control after the skip link on signed-in pages, so turning it off is one keypress away if it clashes with a screen reader's voice.

### Transitions and loading
- **Route changes:** a 300 to 400ms staged transition (outgoing content fades and drops 8px, incoming content rises into place, shared elements like the record button morph between pages) while the garden's camera walks to the next stop behind it; GSAP, interruptible, never blocking clicks.
- **Fun loading (only when the wait is real, 400ms or more):** a small tree sprout that grows leaf by leaf while the recogniser works; a soft mint wave across skeletons. Always with the plain words ("Working on it…"). Loading animations never loop faster than about 1 turn/second and never flash.
- **Entrances:** within a screen, the heading then body then card rise 16px with opacity in 60 to 80ms staggers, once.
- **Micro-feedback:** press scales to 0.97 (160ms), toggles slide with a slight spring, the smooth caret glides, new results fade in with a faint blur-to-sharp.
- **Scroll (Lenis):** the lerp is moderate (about 0.1); anchor links and keyboard scrolling still work; native overscroll and the browser's find-in-page are respected.
- **Celebration:** the one place motion is generous (about 1.2s): the tree gains a branch, a few leaves lift off and drift. One time per session; skippable by tapping; absent under reduced motion.

### Motion rules
- Only `transform` and `opacity` animate; durations under 300ms for UI, longer only for the tree and the celebration. Use custom ease-out curves (`cubic-bezier(0.23, 1, 0.32, 1)`), never ease-in on UI.
- **`prefers-reduced-motion`:** keep opacity fades and state changes, drop travel, sway, parallax, smooth scrolling and the celebration's movement.
- Hover effects only where `(hover: hover) and (pointer: fine)`.
- Nothing animates on actions repeated hundreds of times (keyboard shortcuts, replay taps).
- Total motion budget per screen: the garden (one signature move at a time: the walk between stops or the tree's growth), staged entrances, and feedback on controls. Not more.

## Accessibility and care

- **WCAG 2.2 AA minimum, in both themes**; the palette is computed above; focus is always visible (3px ring: Teal Ink 6.19:1 in the light theme, mint 8.08:1 in the dark); full keyboard operation; logical order; skip link.
- **Sound:** garden sounds never play without a one-press off switch at the top of the page (WCAG 1.4.2), never on public pages, and never while the person is speaking or listening to their voice.
- **Screen readers:** the record button announces state changes (`aria-live=polite`); the result card is a labelled region; the 3D scene is `aria-hidden`; charts have a text summary.
- **Motor needs:** big targets, no precision gestures, no drag-only actions, no time-limited steps except the 15-minute link code (which can be regenerated), no double-tap.
- **Speech needs:** never require perfect speech to proceed: every spoken step has a typed alternative; no step times out while someone is speaking slowly (the 1.5s pause rule is shown, and the phrase length limit is 30s on live and 60s on phrase mode).
- **Cognitive load:** one task per screen, short sentences, same words everywhere, no hidden gestures, confirmations only for destructive acts.
- **Fatigue:** nothing demands daily use; no guilt copy; the tree doesn't wither.
- **Privacy and trust:** consent off by default and explained; recordings never stored without it; deletion is real and explained; the product says what it is and isn't (not a medical device, measures not validated).
- **Safety net:** a visible "Need help?" footer link to the Help page with the contact details (samples in the demo, said so on the page), and an honest line that this is not an emergency service.

## Words

- **Tone: a friend who cares, never a machine.** Talk the way a kind person sits beside you: soft, unhurried, a little warm, and honest. Use "I" and "we", contractions ("you're", "let's"), and short sentences. Never bark commands, never blame the person, never sound like a form.
- **Say it softly.** "Take your time, I'm listening." "I didn't quite catch that. Want to try once more?" "That one was tricky, and that's okay." "Nice, that's three in a row."
- **When something goes wrong, it's on us, not them.** "Something got stuck on our side. Give it a moment and I'll try again." Never "Invalid input", "Error 503", "You failed".
- **When things go well, be glad with them, quietly.** "You did it. Your tree grew a little today." No exclamation marks except in the one celebration, and never words like "Awesome!" or "Crushed it".
- **Ask before you assume.** "Would you like me to keep your recordings so you and your clinician can look back at them?" with a plain "Not right now" that never nags.
- **Never:** "cure", "restore your voice", "clinically proven", "AI-powered miracle", diagnosis terms, praise that sounds like a test score, or anything that makes a slow day feel like a failure.
- **Be literal and kind:** "Working on it…" not "Processing"; "Stop sharing" not "Revoke"; "Voice" not "Timbre".
- **Longer messages follow a shape:** what happened, in one sentence; what's fine; what to do next. Example: "I couldn't hear you that time. Nothing's lost. Try a little closer to the microphone when you're ready."
- **For clinicians:** still warm, a little more concise, never casual about patient data. "Thanks for waiting. We're checking your registration now."
- **Honest limits stated in the UI, gently:** "I get some words wrong, and that's exactly what 'Not quite' is for." Measures are approximate and say so.
- **No emojis, ever** (rule 21). Warmth comes from the words and the tree, not from pictures in the text.
- **Mock copy to retire:** "Dignity in every breath", "A sacred space for your vocal reflection", "restores the natural warmth of your original timbre", "relieves spastic vocal tremors". They overclaim, and the journal has no backend.

## Build plan

**Stack (decided):** React + TypeScript with **React Router in framework mode (Vite-based, server-rendered; `react-router`, `@react-router/dev`, `@react-router/node`, `@react-router/serve`, currently 8.5, MIT)** for real SSR; `@supabase/supabase-js` (browser only, so no session ever reaches the server); Tailwind CSS with the design tokens as CSS variables (ReactBits ships TS + Tailwind variants); GSAP + `@gsap/react`; Lenis; `three` + `@react-three/fiber` + `@react-three/drei`; `animejs`; `@fontsource-variable/atkinson-hyperlegible-next` (OFL; the variable-weight package); `@marsidev/react-turnstile` for the Cloudflare Turnstile widget; React Bits components copied in unmodified (`web/app/components/reactbits/`: BlurText, ClickSpark, CountUp; MIT) with `motion`, the animation library they are built on. The page server is `web/server.js`: Express with `@react-router/express`, `compression`, and `http-proxy-middleware` forwarding `/api/*`, `/ws/*` and `/health` to the speech API (a down API answers a plain 503, never internal details). `npm run dev` runs it with Vite inside; `npm start` runs the built site; every `npm run build` first runs `scripts/check-contrast.mjs` (rule 46). Plus `isbot` (used by the server renderer), `schema-dts` (typed structured data), `zxcvbn-ts` for the password meter and `@playwright/test` for the checks. All of these exist on npm and are MIT or OFL, except GSAP's own licence. The API stays FastAPI on :8000; the frontend lives in `web/` and its origin goes into `CORS_ALLOWED_ORIGINS`. Use `127.0.0.1`, not `localhost`, in development on Windows.

**Design skills to use while building (from the `claude-design-skillstack` and `ui-ux-pro-max` plugins).** Each is loaded before the work it covers, and the work is checked afterwards in a real browser.

| Work | Skill |
|---|---|
| The 3D tree: scene, lighting, pointer spring, performance | `react-three-fiber`, with `threejs-webgl` for what R3F doesn't wrap |
| How 3D, GSAP, Motion and springs fit together without fighting | `web3d-integration-patterns` |
| Route transitions, loading transitions, staged entrances, the celebration | `gsap-scrolltrigger` (Barba.js is built for multi-page sites and isn't used: React Router drives navigation, GSAP animates it) |
| Small object tweens: the tree's growth, leaves, the record ring | `animejs` |
| Component-level motion and gestures in React | `motion-framer`, `react-spring-physics` |
| Copied-in animated components (text reveal, count-up, lists) | `animated-component-libraries` (ReactBits and Magic UI) |
| Tilt and small decorative depth on cards, if any | `lightweight-3d-effects` |
| Current design patterns, palette and type sanity checks | `modern-web-design`, `ui-ux-pro-max` |
| If the tree later needs a modelled asset instead of a procedural one | `blender-web-pipeline` |

**Hosting: the most convenient route for this project (decided).** The speech API needs a GPU and a long-running Python server (the recogniser, the voices and the speech detector all live in it), and the only GPU you have is in this laptop, where recognition measured about 150 ms. Vercel is not a practical home for that server (measured below), though it can host the website itself. The route with the least friction:
1. **Now to 31 October: everything on this laptop.** The page server at `http://127.0.0.1:3000` (the dev server's port while building) and the speech API at `http://127.0.0.1:8000`; the microphone works there because the browser treats `127.0.0.1` as secure. Add `127.0.0.1` to the Turnstile widget's allowed domains. Keep the laptop plugged in (on battery the GPU is about 10x slower) and stop it sleeping. **Record a screen walkthrough of the whole journey**: it is the one thing that always works for a reviewer, whatever happens to the laptop on the day.
2. **If someone else needs a live link: one Cloudflare Tunnel from the laptop, with one address for everything.** Point Cloudflare Tunnel (free; you already use Cloudflare for Turnstile) at the **page server**, which also forwards `/api` and the WebSocket to the speech API. One address means **no CORS settings, one Turnstile hostname and nothing to keep in sync**. Its limit: the laptop must be on, awake and plugged in while people use it. A quick tunnel gets a new random address each run, so for a stable link use a named tunnel on a domain of your own (a cheap one is fine). Before sharing, run `scripts/attack_live.py --api <the tunnel address>`; the API is already hardened (sign-in required, rate limits, body limits, the live attacks pass 50 of 50), and the only open route is `/health`.
3. **Only if it must be online while the laptop is off: rent a GPU machine** and move the same server there (the models are a few gigabytes to download; allow a few hours the first time and check current hourly prices). A CPU-only host also works, but it is much slower and needs about 4 GB of memory (measured, see the table below).
4. **Vercel is optional.** With real SSR it can run the page-rendering server (there is a Vercel adapter for React Router), so unlike a plain static site it can host the *website*. It does not remove the need for a home for the speech API (see the measurements below), so it needs the API from step 2 or 3 behind it, and it adds a second address, CORS settings and its own redirects and headers. It is not needed for the demo.

**Could the speech API run on Vercel itself? Measured on this laptop (12th-gen Core i5-12450H, mains power), real API, real clips, live Supabase, GPU hidden so it ran on the CPU in 32-bit, with the process limited to the given cores:**

| Setup (the real `/api/rectify`) | What the patient waits (median, slowest 1 in 10) | Speech recognition alone (median) | Memory used |
|---|---|---|---|
| This laptop's GPU (RTX 3050), for comparison | about 0.35 s, about 1 s (0.9 to 1.2 s across runs) | about 0.15 s | not measured |
| CPU only, all 12 threads | 0.87 s, 2.35 s | 0.68 s | 3.9 GB |
| CPU only, **2 cores** (Vercel Pro's size) | **3.5 s, 6.9 s** | 3.1 s | 3.9 GB |
| CPU only, **1 core** (Vercel Hobby's size) | **4.4 s, 6.6 s** | 3.5 s | 3.8 GB |

Start-up: the model loaded in about 16 to 18 s once the disk cache was warm, but **157 s** on the first run, when its 2.4 GB had to be read from disk. On a serverless platform every cold start pays something like this.

Vercel's own limits, read from its Functions limits page on the day of this work: memory **2 GB / 1 vCPU (Hobby) or 4 GB / 2 vCPU (Pro)**; function size **500 MB for Python**, or up to **5 GB for "large functions" (beta)**; **300 s** maximum run time on Hobby; request bodies up to **4.5 MB**; WebSockets in **public beta**; **no GPU mentioned**. Set against our numbers:

- **Memory:** the server used 3.8 to 3.9 GB. Hobby's 2 GB is out; Pro's 4 GB leaves almost no headroom.
- **Size:** the model alone is 2.4 GB, so it can't fit the normal 500 MB Python limit and would need the beta large-functions feature. I could not measure the CPU-only torch package's size, so the total is not confirmed.
- **Speed:** 3.5 to 4.4 s per phrase on 1 to 2 cores, and nearly 7 s in the slow cases, against about 0.35 s on the GPU. For someone speaking with effort, a wait of several seconds on every phrase would be felt.
- **Cold starts:** each new instance loads 2.4 GB first, which can take from about 20 s to over 2 minutes.
- **Live conversation mode:** needs WebSockets, which are only in beta there.

**Conclusion:** it is technically possible on a paid Pro plan with beta features, but it would be slow, tight on memory and fragile, so Vercel is **not** a good home for the speech API. Vercel can host the website; the API belongs on the laptop (tunnel) or on a GPU machine. These timings are from this laptop's fast cores, so a cloud vCPU may be slower, not faster.

**What real SSR changes about steps 1 and 2.** Two programs now run on the laptop instead of one: the **page server** (Node, on `127.0.0.1:3000`) and the **speech API** (Python, on `127.0.0.1:8000`). The page server is the front door: it renders pages, applies the headers, redirects and 404s, and forwards `/api` and the WebSocket to the speech API, so the browser still sees one address and there are still no CORS settings. The tunnel in step 2 points at the page server, not at the API. The API no longer serves the frontend; the earlier "API serves the built site" idea is dropped.

**Needs from the project owner:** the Turnstile **site key** (public; you have it); the Supabase URL and **anon** key for the browser (the service-role key never goes near the frontend); and the site's address once there is one (`VITE_SITE_URL`, used for canonical tags, the sitemap and `og:image`).

**The contact details (what they are for, and the demo ones).** Help needs one email and one phone number. People will use them for: trouble signing in or hearing their voice; asking what's stored or asking for their data to be deleted; clinicians asking about verification; reporting a bug or something that felt wrong. They are **not** an emergency line, and the Help page says so in a gentle sentence and points to local emergency services.

For the demo, use sample values that cannot belong to anyone: the email `hello@epakovoice.example` (the `.example` ending is reserved for examples and can never be a real address) and the phone number `+44 20 7946 0958` (this range is reserved by the UK regulator for use in fiction and can't ring anyone). They live in one place, public settings (`VITE_SUPPORT_EMAIL`, `VITE_SUPPORT_PHONE`, `VITE_DEMO_CONTACT=true`), and are still `mailto:` and `tel:` links so rules 11 and 12 can be tested. Because a patient might try to use them, the Help page says plainly in one soft line: "This is a demo version, so the email and phone number here are samples and don't reach anyone. The form on this page does reach our team." The build **refuses** to finish if either value is missing, or if a sample value is used without `VITE_DEMO_CONTACT=true` (so a sample can never be published as if it were real), and a build for real patients is simply one with `VITE_DEMO_CONTACT` unset and real values. (The local demo itself runs a production build, so "production build" can't be what decides it.)

**File shape (as built, `web/`):** `app/routes/` (one file per page), `app/components/`, `app/lib/` (`theme.ts`, `site.ts`, and `api.ts`, `auth.ts`, `sound.ts` to come), `app/three/GardenHost.tsx` (the still picture and the one canvas behind every page; reads each route's `handle.garden`), `app/three/Scene.tsx` (canvas, camera walk, light, frame-rate monitor), `app/three/World.tsx` and `Tree.tsx` (the garden and the tree from the models), `app/three/kit.ts` (the shapes the pipeline builds from), `app/three/surfaces.ts` (textured materials), `app/three/models.ts` (loading the glTF tiers), `app/three/stops.ts`, `app/three/store.ts` (voice and working signals from the page); `scripts/assets/` (the model and texture pipeline), `scripts/render-stills.mjs`, `scripts/check-contrast.mjs`, `tests/`.

**Performance budget:** first contentful paint under 1.5s on a mid phone; JS for Welcome (without Three.js) under 150 KB gzipped; Three.js, the glTF loader and the garden code lazy-loaded after the page is interactive (measured: 273 KB gzipped); the models after that (1.64 MB for every tier on desktops, less on phones, which never load LOD0); each still picture about 60 KB; the sound loop under 1 MB and loaded only after sign-in; 60 fps garden on a mid laptop and 30 fps or better on a mid phone (or the still picture), paused whenever it isn't needed.

**Quality gates (every screen):** the [site-wide rules](#site-wide-rules) suite is green at every width and in both themes; keyboard-only pass; screen-reader pass on Speak; 200% zoom; 390px, 768px and 1440px screenshots checked by eye; reduced-motion pass; Lighthouse accessibility 95+; the end-to-end journey in `scripts/e2e_live.py` stays green; Karpathy review (surgical, no dead code) before each commit.

**Staying on plan.** This document is the plan, and the build checks itself against it on a schedule rather than from memory:
- **Before each stage** (scaffold, shared components, garden, each screen, each rule group), re-read the sections of this file that the stage touches, plus the Site-wide rules and the Do's and Don'ts.
- **After each stage**, go back through those sections line by line and tick what is done, what is not, and what changed.
- **If the build needs to differ from this file** (something doesn't work, or a better way turns up), change this file first, say why in one line, and tell the owner. The code never quietly drifts away from the spec.

**Cut line for the 31 October deadline** (today is 26 October):
1. **Must:** Welcome, Sign up/in with CAPTCHA and the password meter, Setup (consent, voice, mic), Home, Speak (phrase mode + confirm/correct), Session summary, Me (consent, delete), the footer, Terms, Privacy, Accessibility, Help and the 404 page, **real server-side rendering with its page server** (rule 35), **both themes with the toggle** (rule 46), **the persistent garden with a stop and still pictures for every Must page** (rule 47), **garden sounds with the toggle** (rule 48), and every [site-wide rule](#site-wide-rules) **except** rules 43 to 45 (below).
2. **Should:** the **contact form** (rule 45; one small migration and one route), Voice screen, Progress, Care team (link code, revoke, verified label), **the clinician pages**: sign-up, verification form (Tier 1), "We're checking", patient list, link-code entry, patient and session view with the assessment form, and the PDF. The verification form needs one database migration (new columns and rules on `clinicians`) and the administrator's manual check; budget a full day for it.
3. **Could:** Conversation mode, authenticator-app two-step sign-in (Tier 1 optional), the richer garden details (the tree's leaves per phrase, the hellebore opening per phrase, the stepping-stone flowers), text size, and **Search Console** (rule 44; it can't be done until the site has a public address, so it waits for the tunnel or a domain). **Deferred:** Google Analytics and its cookie choices (rule 43), by the owner's decision.
4. **Cut:** journal, family accounts, notifications, document upload (Tier 2).

Honest note: the Must list alone is about three days of careful work with the checks, the garden on every page adds roughly another day, and the clinician pages are another two. If Tuesday evening isn't green, drop Should items from the bottom up and keep the rules, not the other way round.

## Open decisions

Decided: clinician pages and verification are in (Tier 1); everything local first, then a single Cloudflare Tunnel if a live link is needed, a rented GPU only if it must stay online with the laptop off; demo contact details (flagged, sample, refused by a production build); the warm friendly voice; the Welcome line "Say it your way. We'll help it be heard."; the Turnstile site key exists. Still open:

1. **Real support email and phone**, to replace the demo contact before any real patient uses the product.
2. **Whether a live link is needed at all for the submission**, or the local demo plus a screen recording is enough (this decides whether step 2 of Hosting is built).
3. **Who does the manual clinician check**, and which registers to accept at first (suggest: RCI for speech-language pathologists and audiologists, NMC for doctors, plus "Other" reviewed by hand).
4. **The owner's name for the copyright line and the legal pages** ("Epako Voice" alone, or a person or organisation).
5. **A legal read of Terms and Privacy** by someone qualified before real patients use it, including India's DPDP Act 2023.
6. **Google Analytics (deferred):** the owner said "no for now". Decide later whether to turn it on (public pages only, after consent, with your GA4 measurement id) or to use a self-hosted counter, or to have no analytics on a health product.
7. **Which mailbox receives contact-form messages** and which email route to use for the demo (suggest SMTP through the owner's mailbox with an app password). Decided already: messages are emailed to the team, saved in the database, deleted after 12 months, and the visitor sees a clear "sent to our team by email" message.
8. **A domain:** yes, but **after the app is built and working properly on localhost**. Needed later for a stable tunnel address, Search Console, and meaningful canonical tags, sitemap and share previews. Name and registrar still to choose then.
9. **Library licences:** read GSAP's "no charge" terms and each ReactBits component's licence against how the project is submitted or used, before shipping.
10. **The garden sound recording:** I'll find two or three CC0 winter-garden recordings and trim them; the owner listens and picks one.
