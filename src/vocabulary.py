"""
Words compared by how they sound, so a misheard word can be matched to one the patient actually uses.

Sounds come from espeak-ng, bundled with Piper (already installed for the voices), so nothing leaves the machine.
"""
import functools
import heapq
import re

try:
    from .feedback_engine import words
    from .local_tts import ESPEAK_LOCK
except ImportError:
    from feedback_engine import words
    from local_tts import ESPEAK_LOCK

# Set on TORGO speakers F03, M02, M05 and reported once on F01, F04, M01, M03, M04 (2026-10-25, scripts/simulate_learning.py):
# repeated words +16.5 points first-try exact, no extra harm; mostly-new words +0.0, no extra harm. Window and share
# sit on a plateau (5/10/20 and 0.7 give the same result), so they are not tuned to these speakers.
SNAP_DISTANCE = 0.67  # snap only to a known word at most this far apart in sounds (2 of 3 sounds may differ)
UNSURE_BELOW = 0.9    # only words the recogniser was less sure of than this are snapped
REPEAT_WINDOW = 10    # how many of the patient's last confirmed texts decide whether to snap at all
REPEAT_SHARE = 0.7    # snapping is on when at least this share of them reused known words; on new words it does harm
MAX_WORDS = 3000      # most-used words kept and searched: bounds CPU per word and keeps the row far below its 200 kB limit

_SOUND = re.compile(r"eɪ|aɪ|oʊ|aʊ|ɔɪ|tʃ|dʒ|.")   # diphthongs and affricates are one sound each


@functools.lru_cache(maxsize=1)
def _espeak():
    from piper import espeakbridge
    from piper.phonemize_espeak import ESPEAK_DATA_DIR
    espeakbridge.initialize(str(ESPEAK_DATA_DIR))
    return espeakbridge


@functools.lru_cache(maxsize=20000)
def phonemes(word):
    """The word's sounds (IPA), without stress or length marks: they do not change which word it is."""
    with ESPEAK_LOCK:
        espeak = _espeak()
        espeak.set_voice("en-us")
        ipa = "".join(p for p, _, _ in espeak.get_phonemes(word.lower()))
    return tuple(_SOUND.findall(re.sub(r"[ˈˌː\s]", "", ipa)))


def distance(a, b):
    """0.0 when two words sound the same, up to 1.0 when they share no sounds in order."""
    pa, pb = phonemes(a), phonemes(b)
    prev = list(range(len(pb) + 1))
    for i, x in enumerate(pa, 1):
        cur = [i]
        for j, y in enumerate(pb, 1):
            cur.append(min(prev[j - 1] + (x != y), prev[j] + 1, cur[j - 1] + 1))
        prev = cur
    return prev[-1] / max(len(pa), len(pb), 1)


def unsure(recognised):
    """Words the recogniser was unsure of, from its [{"word", "confidence"}] list (None: no confidence, so none)."""
    return {w for r in recognised or [] if r["confidence"] < UNSURE_BELOW for w in words(r["word"])}


class Vocabulary:
    """
    The words this patient has confirmed meaning, with how often: {word: count}.
    A plain dict so the caller owns persistence (patient_profiles.vocabulary).
    """

    def __init__(self, counts=None):
        self.counts = counts if counts is not None else {}

    def add(self, text):
        for w in words(text):
            self.counts[w] = self.counts.pop(w, 0) + 1   # re-inserted: the newest word wins a tie when pruning
        if len(self.counts) > MAX_WORDS:
            self.counts = dict(self._most_used())

    def _most_used(self):
        """The MAX_WORDS most-used (word, count) pairs; on equal counts the more recently added word wins."""
        if len(self.counts) <= MAX_WORDS:
            return list(self.counts.items())
        ranked = heapq.nlargest(MAX_WORDS, enumerate(self.counts.items()), key=lambda e: (e[1][1], e[0]))
        return [kv for _, kv in ranked]

    def repeating(self, recent):
        """True when the patient is mostly reusing words: snapping only helps then (on new words it does harm).
        recent: their confirmed texts, newest last; a text counts if every word in it was said at least twice."""
        window = recent[-REPEAT_WINDOW:]
        if len(window) < REPEAT_WINDOW:
            return False
        reused = sum(bool(words(t)) and all(self.counts.get(w, 0) >= 2 for w in words(t)) for t in window)
        return reused >= REPEAT_SHARE * REPEAT_WINDOW

    def closest(self, word):
        """The known word this one was probably meant to be, or None when unsure."""
        word = word.lower()
        if not self.counts or word in self.counts:
            return None
        ranked = sorted((distance(word, known), -n, known) for known, n in self._most_used())
        best = ranked[0]
        if best[0] > SNAP_DISTANCE:
            return None
        if len(ranked) > 1 and ranked[1][:2] == best[:2]:
            return None   # equally close and equally common: guessing would put words in their mouth
        return best[2]

    def snap(self, text, unsure_words):
        """Replaces only words in `unsure_words`: a word the recogniser was sure of is usually right, and snapping it does harm."""
        def swap(m):
            to = self.closest(m.group(0)) if m.group(0).lower() in unsure_words else None
            if to is None:
                return m.group(0)
            return to.capitalize() if m.group(0)[0].isupper() else to
        return re.sub(r"[A-Za-z0-9']+", swap, text)
