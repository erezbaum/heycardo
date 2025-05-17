let gainNode = null;
let audioCtx = null;

const BEEP_FREQUENCY = 440;  // Hz

function init_beep() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    gainNode = audioCtx.createGain();
    const oscillator = audioCtx.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(BEEP_FREQUENCY, audioCtx.currentTime);
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.start();
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
}

function playSmallBeep () {playBeep(50, 0.1);}
function playBigBeep () {playBeep(100, 1);}

function playBeep(duration, gain) {
    if (!gainNode) {
        init_beep();
    }
    const now = audioCtx.currentTime;
    const end = now + duration / 1000;

    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gain, now);     // Instant on
    gainNode.gain.setValueAtTime(0, end);     // Instant off after duration
}

let _timers = {};
function startTimer(name) {
    _timers[name] = performance.now();
}
function stopTimer(name) {
    const elapsed = performance.now() - _timers[name];
    console.log(`Time for ${name}: ${elapsed.toFixed(2)} ms`);
}