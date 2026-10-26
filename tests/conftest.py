"""Shared fixtures. Tests that stream audio through /ws/rectify with noise bursts and silence use a loudness stand-in for
the Silero speech detector (noise is not speech to the real one); a test that asks for `real_stream_vad` gets the real one."""
import sys
from pathlib import Path
from unittest import mock

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))


class LoudnessVAD:
    """Stand-in with StreamVAD's interface: a chunk 'is speech' when it is louder than a fixed level."""

    def feed(self, chunk):
        return 1.0 if len(chunk) and float(np.sqrt(np.mean(np.square(chunk)))) > 0.015 else 0.0


@pytest.fixture
def real_stream_vad():
    """Opts a test out of the loudness stand-in."""


@pytest.fixture(autouse=True)
def stream_vad(request):
    if "real_stream_vad" in request.fixturenames:
        yield
        return
    import api
    with mock.patch.object(api, "StreamVAD", LoudnessVAD):
        yield
