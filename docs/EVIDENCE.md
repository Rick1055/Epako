# Does Epako Voice help? What has been measured (28 October 2026)

Plain numbers, with their limits. Source data: the full TORGO corpus (`scripts/eval_torgo.py`, 7,884 clips,
`outputs/eval_torgo.json`) and the learning replay (`scripts/simulate_learning.py` on `outputs/eval_torgo_rows.jsonl`,
10 shuffled orders per speaker).

## 1. Before any learning: the recogniser does the work

Word error rate on dysarthric speakers, recogniser alone vs after the fixed repair step (no learning yet):

| Speaker | Recogniser alone | After repair |
|---|---|---|
| F01 | 57 % | 57 % |
| F03 | 31 % | 31 % |
| F04 | 17 % | 17 % |
| M01 | 60 % | 60 % |
| M02 | 50 % | 50 % |
| M03 | 9 % | 9 % |
| M04 (severe) | 90 % | 80 % |
| M05 | 43 % | 42 % |
| Control speakers | 11 to 12 % | same |

The fixed repair step adds almost nothing on its own. What a new patient gets on day one is the recogniser's accuracy.

## 2. With learning: large gains on the phrases a patient repeats

The replay feeds each speaker's real recogniser output to the app in a random order, with a patient who always
confirms or corrects (the best case). It reports how often the **first answer is exactly right** in the second half
of the stream, without and with what the app learned in the first half.

**Every utterance (mostly one-off words, as TORGO is):** no gain, from −1.5 to +0.9 points. The app cannot learn a
word it has never been corrected on.

**Only what the speaker said at least 3 times (the real use: a patient's everyday phrases), with learning and the
patient's own vocabulary:**

| Speaker | Utterances | First answer right, without | With learning | Change |
|---|---|---|---|---|
| F03 | 79 | 51.5 % | 68.5 % | +17.0 points |
| M02 | 36 | 27.2 % | 58.9 % | +31.7 points |
| M05 | 59 | 34.3 % | 54.3 % | +20.0 points |
| **M01 (held out)** | 28 | 35.7 % | 72.1 % | **+36.4 points** |
| **M03 (held out)** | 34 | 68.2 % | 74.1 % | **+5.9 points** |
| **M04 (held out, severe)** | 24 | 20.0 % | 51.7 % | **+31.7 points** |

F03, M02 and M05 were used to tune when vocabulary snapping switches on; M01, M03 and M04 were not, so their numbers
are the fair ones. F01 and F04 repeat too little to measure.

## 3. Limits (say these when quoting the numbers)

- A replay, not real patients: the simulated patient always gives perfect feedback. Real feedback will be noisier.
- Small samples on the repeated-phrase test (24 to 79 utterances per speaker); TORGO is read speech, not conversation.
- No confidence intervals on the replay yet; the 10 shuffled orders give a mean, not a spread.
- Nothing here is a clinical outcome. The app is a communication and practice aid, not a medical device.

## 4. What this means for the pitch

Not "we correct dysarthric speech" (day-one accuracy is the recogniser's), but: **"it learns your everyday phrases.
On phrases a speaker said three or more times, the first answer was right far more often after learning: +6 to +36
points on speakers it was never tuned on."** The Progress screen now shows what it has learned for each patient.
