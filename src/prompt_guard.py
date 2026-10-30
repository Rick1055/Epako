"""
Prompt injection and adversarial instruction guardrail (OWASP LLM01).

Epako Voice uses on-device acoustic models (Parakeet-TDT, Silero, Piper) and deterministic NLP
rather than an instruction-following LLM. This guardrail provides defense-in-depth
by detecting and blocking adversarial prompt injection attempts, delimiter hijacking,
and instruction override sequences in user-supplied text.
"""
import re
from typing import Tuple

_INJECTION_PATTERNS = [
    re.compile(r"\bignore\s+(?:all\s+|any\s+)?(?:previous|prior|above)\s+(?:instructions|prompts|rules|commands)\b", re.IGNORECASE),
    re.compile(r"\b(?:disregard|forget|bypass)\s+(?:all\s+)?(?:rules|instructions|safety|filters|constraints)\b", re.IGNORECASE),
    re.compile(r"\b(?:system\s+prompt|system\s+instructions|system\s+message)\b", re.IGNORECASE),
    re.compile(r"\byou\s+are\s+now\s+(?:in\s+developer\s+mode|dan|an?\s+unrestricted|a\s+new\s+ai)\b", re.IGNORECASE),
    re.compile(r"\b(?:jailbreak|dan\s+mode|developer\s+mode\s+output)\b", re.IGNORECASE),
    re.compile(r"<\s*\|?\s*im_start\s*\|?>|<\s*\|?\s*im_end\s*\|?>", re.IGNORECASE),  # ChatML delimiter injection
    re.compile(r"\[\s*INST\s*\]|\[\s*/INST\s*\]", re.IGNORECASE),  # Llama instruction delimiters
    re.compile(r"(?:###\s*(?:System|Assistant|Human)\s*:)", re.IGNORECASE),  # Markdown role delimiters
]


def check_prompt_injection(text: str) -> Tuple[bool, str]:
    """
    Checks if the supplied text contains known prompt injection or jailbreak patterns.
    Returns (True, reason) if blocked, or (False, "") if clean.
    """
    if not text or not isinstance(text, str):
        return False, ""

    for pattern in _INJECTION_PATTERNS:
        match = pattern.search(text)
        if match:
            return True, f"Adversarial instruction or prompt injection detected: '{match.group(0)}'"

    return False, ""

