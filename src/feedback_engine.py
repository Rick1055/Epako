import difflib
import heapq
import re

MIN_CONFIRMATIONS = 2   # a correction must be confirmed this many times before it is applied
MIN_CONFIDENCE = 0.6    # and be right at least this often
MAX_WORD_LETTERS = 45   # longest dictionary word (pneumonoultramicroscopicsilicovolcanoconiosis); longer is junk, never stored
MAX_CORRECTIONS = 5000  # rules kept: even full of 45-letter words the table stays below its 1 MB database limit


def words(text):
    return re.findall(r"[a-z0-9']+", text.lower())


class FeedbackEngine:
    """
    Per-patient word-level memory learned from the patient's yes/no confirmations.

    table: heard word -> {"to": intended word, "ok": times confirmed, "bad": times rejected}.
    The table is a plain dict so the caller owns persistence (patient_profiles.phonetic_corrections).
    """

    def __init__(self, table=None):
        self.table = table if table is not None else {}

    def apply(self, text):
        def swap(m):
            e = self.table.get(m.group(0).lower())
            if e and e["ok"] >= MIN_CONFIRMATIONS and e["ok"] / (e["ok"] + e["bad"]) >= MIN_CONFIDENCE:
                return e["to"].capitalize() if m.group(0)[0].isupper() else e["to"]
            return m.group(0)
        return re.sub(r"[A-Za-z0-9']+", swap, text)

    def learn(self, raw_text, shown_text, final_text):
        """
        raw_text: what the ASR heard; shown_text: what the patient was shown; final_text: what they meant.
        Rejected rules are penalised, confirmed ones rewarded. Returns 1 - wrong_words/len(final)
        for the shown text, so a fully correct sentence scores 1.0.
        """
        raw, shown, final = words(raw_text), words(shown_text), words(final_text)

        wrong, penalised = 0, set()
        for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, shown, final).get_opcodes():
            if op == "equal":
                continue
            wrong += max(i2 - i1, j2 - j1)
            if op == "replace" and i2 - i1 == j2 - j1:
                for s in shown[i1:i2]:
                    for heard, e in self.table.items():
                        if e["to"] == s and heard in raw:  # this rule produced the rejected word
                            e["bad"] += 1
                            penalised.add(heard)

        for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, raw, final).get_opcodes():
            if op == "replace" and i2 - i1 == j2 - j1:  # shortcut: only 1-to-1 word swaps are learned
                for heard, meant in zip(raw[i1:i2], final[j1:j2]):
                    if max(len(heard), len(meant)) > MAX_WORD_LETTERS:
                        continue
                    e = self.table.get(heard)
                    if e is None or e["to"] == meant:
                        e = self.table.setdefault(heard, {"to": meant, "ok": 0, "bad": 0})
                        e["ok"] += 1
                    else:
                        e["bad"] += heard not in penalised  # already punished above
                        if e["bad"] > e["ok"]:
                            self.table[heard] = {"to": meant, "ok": 1, "bad": 0}

        if len(self.table) > MAX_CORRECTIONS:   # least-confirmed rules go first; on a tie the older one
            kept = {k for _, (k, _) in heapq.nlargest(MAX_CORRECTIONS, enumerate(self.table.items()), key=lambda e: (e[1][1]["ok"], e[0]))}
            self.table = {k: e for k, e in self.table.items() if k in kept}

        return max(0.0, 1.0 - wrong / max(len(final), 1))
