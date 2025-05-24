/**
 * Utility functions for audio beep playback and simple timing.
 * Provides functions to play small and big beeps using the Web Audio API,
 * as well as basic performance timing utilities.
 */

let gainNode = null;
let audioCtx = null;

const BEEP_FREQUENCY = 440;  // Hz

/**
 * Initializes the audio context and gain node if they do not already exist.
 */
function init_beep() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (!gainNode) {
        gainNode = audioCtx.createGain();
        gainNode.connect(audioCtx.destination);
    }
}

/**
 * Plays a short, quiet beep.
 */
function playSmallBeep () {playBeep(50, 0.1);}

/**
 * Plays a longer, louder beep.
 */
function playBigBeep () {playBeep(100, 1);}

/**
 * Plays a beep sound with the specified duration (ms) and gain (volume).
 * @param {number} duration - Duration of the beep in milliseconds.
 * @param {number} gain - Gain (volume) of the beep, between 0 and 1.
 */
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

/**
 * Starts a timer with the given name.
 * @param {string} name - The name of the timer.
 */
function startTimer(name) {
    _timers[name] = performance.now();
}

/**
 * Stops the timer with the given name and logs the elapsed time.
 * @param {string} name - The name of the timer.
 */
function stopTimer(name) {
    const elapsed = performance.now() - _timers[name];
    console.log(`Time for ${name}: ${elapsed.toFixed(2)} ms`);
}