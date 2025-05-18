let gainNode = null;
let audioCtx = null;

const BEEP_FREQUENCY = 440;  // Hz

function init_beep() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (!gainNode) {
        gainNode = audioCtx.createGain();
        gainNode.connect(audioCtx.destination);
    }
}

function playSmallBeep () {playBeep(50, 0.1);}
function playBigBeep () {playBeep(100, 1);}

function playBeep(duration, gain) {
 //   startTimer("playBeep");
//    console.log(`playBeep duration:${duration}, gain:${gain}`);
    init_beep();

    const oscillator = audioCtx.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(BEEP_FREQUENCY, audioCtx.currentTime);

    oscillator.connect(gainNode);

    const now = audioCtx.currentTime;
    const end = now + duration / 1000;

    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gain, now);     // Instant on
    gainNode.gain.setValueAtTime(0, end);        // Instant off after duration

    oscillator.start(now);
    oscillator.stop(end);
    oscillator.onended = () => {
        oscillator.disconnect();
    };
//    stopTimer("playBeep");
}

let _timers = {};
function startTimer(name) {
    _timers[name] = performance.now();
}
function stopTimer(name) {
    const elapsed = performance.now() - _timers[name];
    console.log(`Time for ${name}: ${elapsed.toFixed(2)} ms`);
}