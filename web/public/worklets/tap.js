// The microphone's tap (app/lib/recorder.ts): copies each block of samples out of the audio thread.
registerProcessor("tap", class extends AudioWorkletProcessor {
  process(inputs) {
    const c = inputs[0][0];
    if (c) this.port.postMessage(c.slice(0));
    return true;
  }
});
