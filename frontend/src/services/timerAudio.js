let audioContext = null;

function getContext() {
  if (!audioContext) {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) {
      return null;
    }
    audioContext = new Context();
  }
  return audioContext;
}

export async function primeAudio() {
  const ctx = getContext();
  if (!ctx) {
    return;
  }

  if (ctx.state === "suspended") {
    await ctx.resume();
  }
}

function createGain(ctx, start, peak, attack, release, destination) {
  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(0.0001, start);
  gainNode.gain.exponentialRampToValueAtTime(peak, start + attack);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, start + attack + release);
  gainNode.connect(destination);
  return gainNode;
}

export async function playTickSound() {
  const ctx = getContext();
  if (!ctx) {
    return;
  }

  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  const now = ctx.currentTime;

  const bellGain = createGain(ctx, now, 0.022, 0.004, 0.09, ctx.destination);
  const bell = ctx.createOscillator();
  bell.type = "triangle";
  bell.frequency.setValueAtTime(1320, now);
  bell.connect(bellGain);
  bell.start(now);
  bell.stop(now + 0.12);

  const bodyGain = createGain(ctx, now + 0.01, 0.015, 0.004, 0.12, ctx.destination);
  const body = ctx.createOscillator();
  body.type = "sine";
  body.frequency.setValueAtTime(660, now + 0.01);
  body.connect(bodyGain);
  body.start(now + 0.01);
  body.stop(now + 0.15);
}

export async function playFinalWhistle() {
  const ctx = getContext();
  if (!ctx) {
    return;
  }

  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.05, now + 0.03);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.82);
  master.connect(ctx.destination);

  const whistle = ctx.createOscillator();
  whistle.type = "sine";
  whistle.frequency.setValueAtTime(1750, now);
  whistle.frequency.exponentialRampToValueAtTime(1520, now + 0.22);
  whistle.frequency.exponentialRampToValueAtTime(1710, now + 0.48);
  whistle.frequency.exponentialRampToValueAtTime(1380, now + 0.8);

  const vibrato = ctx.createOscillator();
  vibrato.type = "sine";
  vibrato.frequency.setValueAtTime(10, now);

  const vibratoGain = ctx.createGain();
  vibratoGain.gain.setValueAtTime(22, now);
  vibrato.connect(vibratoGain);
  vibratoGain.connect(whistle.frequency);

  whistle.connect(master);
  vibrato.start(now);
  whistle.start(now);
  vibrato.stop(now + 0.84);
  whistle.stop(now + 0.84);
}
