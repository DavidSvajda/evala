let enabled = true,
  audio;
export function setMoveSoundEnabled(value) {
  enabled = value !== false;
}
function unlock() {
  if (!enabled) return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    if (audio?.state === 'interrupted' || audio?.state === 'closed') {
      if (audio.state !== 'closed') audio.close().catch(() => {});
      audio = null;
    }
    audio ||= new Audio();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
  } catch {
    /* Sound never blocks a move. */
  }
}
// Resume within the user gesture, before asynchronous puzzle/server responses.
document.addEventListener('pointerdown', unlock, { capture: true, passive: true });
document.addEventListener('pointerup', unlock, { capture: true, passive: true });
document.addEventListener('click', unlock, { capture: true, passive: true });
document.addEventListener('keydown', unlock, { capture: true });
export function playMoveSound() {
  if (!enabled) return;
  unlock();
  if (!audio) return;
  const current = audio;
  if (audio.state === 'suspended') {
    audio
      .resume()
      .then(() => {
        if (audio === current) emitSound();
      })
      .catch(() => {});
  } else emitSound();
}
function emitSound() {
  if (!enabled || !audio || audio.state !== 'running') return;
  try {
    const oscillator = audio.createOscillator(),
      gain = audio.createGain(),
      now = audio.currentTime;
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(640, now);
    oscillator.frequency.exponentialRampToValueAtTime(220, now + 0.055);
    gain.gain.setValueAtTime(0.055, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.07);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  } catch {
    /* Audio is optional on unsupported or suspended devices. */
  }
}
