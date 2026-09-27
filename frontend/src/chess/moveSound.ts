/** A short, quiet wooden click generated locally; no sound file or network request. */
let context: AudioContext | undefined;

export function playMoveSound() {
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume().catch(() => {});
    const length = Math.floor(context.sampleRate * 0.085);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const time = i / context.sampleRate;
      samples[i] = (Math.random() * 2 - 1) * Math.exp(-time * 54);
    }
    const noise = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const volume = context.createGain();
    noise.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.value = 1100;
    volume.gain.value = 0.2;
    noise.connect(filter).connect(volume).connect(context.destination);
    noise.start();
    noise.onended = () => { noise.disconnect(); filter.disconnect(); volume.disconnect(); };
  } catch { /* Audio is optional when the browser or device blocks playback. */ }
}
