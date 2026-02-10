// Main application logic for Cardo voice assistant demo: manages state, handles transcription events, and UI updates.

let pc = null;
let ms = null; // Store MediaStream globally
let inactivityTimeout = null; // Track inactivity timeout
const INACTIVITY_DURATION = 5 * 60 * 1000; // 5 minutes in ms
let restartTimeout = null; // restart timeout 
const RESTART_WAIT_DURATION = 15 * 1000; // 15 seconds in ms
const hi_regex = /^\s*(hey|hi|high|hello)[^a-zA-Z0-9]+(cardo|kardo|caldo)\b/i;

let hey_cardo_found = false;

let appState = null;
let firstUserInput = null;
let followUpQuestion = null;

let partialTranscript = "";

/**
 * Handles partial transcription results and updates state if greeting is detected.
 * @param {string} delta - The latest partial transcript segment.
 */
const onPartialTranscript = (delta) => {
    if (appState === "listening-for-hey-cardo-after-command") {
        setListeningState();
        appState = "listening-for-hey-cardo";
    }
    if (appState === "listening-for-hey-cardo") {
        partialTranscript += delta;
        if (hasCardoGreeting(partialTranscript)) {
            appState = "listening-for-command";
            setActiveListeningState();
        }
    }
}

/**
 * Handles completed transcription results and routes to appropriate handler based on state.
 * @param {string} userInput - The final transcript from the user.
 */
const onFinalTranscript = async (userInput) => {
    console.log("Completed Input:", userInput);
    partialTranscript = ""; // Reset partial input
    if (inactivityTimeout) clearTimeout(inactivityTimeout);
    inactivityTimeout = setTimeout(stopSession, INACTIVITY_DURATION);

    if (appState === "listening-for-command" || appState === "listening-for-hey-cardo" || appState === "listening-for-hey-cardo-after-command") {
        if (hasCardoGreeting(userInput)) {
            await processFirstUserInput(userInput)
        } else {
            console.log("No greeting found, ignoring input.");
            appState = "listening-for-hey-cardo";
            setListeningState();
        }
    } else if (appState === "listening-for-answer") {
        if (restartTimeout) clearTimeout(restartTimeout);
        restartTimeout = null;
        await processUserAnswer(userInput);
    }
}

/**
 * Handles transcription failures from Realtime events.
 * @param {object} eventData - Failure event payload from Realtime.
 */
const onTranscriptionError = async (eventData) => {
    const error = eventData && eventData.error ? eventData.error : {};
    const code = error.code || error.type || "unknown_error";
    const message = error.message || "Transcription failed.";

    if (typeof logEvent === "function") {
        logEvent("transcription.failed", { code, message, event_id: eventData && eventData.event_id });
    }

    if (code === "insufficient_quota") {
        showErrorMessage("OpenAI quota exceeded for this API key/project. Add billing/credits, then restart.");
    } else {
        showErrorMessage(`Transcription failed: ${message}`);
    }

    stopSession();
}

/**
 * Processes the user's first input to determine if it is a command or requires a follow-up.
 * @param {string} userInput - The user's initial input.
 */
async function processFirstUserInput(userInput) {
    console.log("First User Input:", userInput);
    let command = await parseCommand(userInput);
    if (command) {
        executeCommand(command);
        console.log("Command Found:", command);
        appState = "listening-for-hey-cardo-after-command";
    } else {
        firstUserInput = userInput;
        try {
            const { questionText, questionAudio } = await getFollowupQuestionAudio(userInput);
            console.log("Follow-up Question:", questionText);
            playAudio(questionAudio, 1.2);
            followUpQuestion = questionText;
            appState = "listening-for-answer";
            setRestartTimeout();
        } catch (e) {
            console.error(e);
            if (typeof showErrorMessage === "function") {
                showErrorMessage(`Follow-up audio failed: ${e.message || e}`);
            }
            appState = "listening-for-hey-cardo";
            setListeningState();
        }
    }
}

/**
 * Processes the user's answer to a follow-up question to determine the intended command.
 * @param {string} userInput - The user's answer to the follow-up question.
 */
async function processUserAnswer(userInput) {
    console.log("User Answer:", userInput);
    const wakeWordDetected = hasCardoGreeting(userInput);
    let command = await parseAnswer(firstUserInput, followUpQuestion, userInput);
    console.log("Parsed Command:", command);
    if (command) {
        executeCommand(command);
        appState = "listening-for-hey-cardo-after-command";
    } else {
        appState = "listening-for-hey-cardo";
        if (wakeWordDetected) {
            playAudio('resources/try-again.wav');
        } else {
            console.log("No wake word in follow-up answer, remaining silent.");
        }
        setListeningState();
    }
}

/**
 * Sets or resets the timeout for returning to the listening state after waiting for an answer.
 * No parameters.
 */
function setRestartTimeout() {
    if (restartTimeout) clearTimeout(restartTimeout);
    restartTimeout = setTimeout(() => {
        appState = "listening-for-hey-cardo";
        setListeningState();
        if (restartTimeout) clearTimeout(restartTimeout);
        restartTimeout = null;
    }, RESTART_WAIT_DURATION);
}

/**
 * Resets the application to the listening state and clears any answer wait timeout.
 * No parameters.
 */
function resetToListeningState() {
    appState = "listening-for-hey-cardo";
    setListeningState();
    if (answerWaitTimeout) clearTimeout(answerWaitTimeout);
    answerWaitTimeout = null;
}

/**
 * Starts the transcription and RTC session, initializes audio input, and sets initial state.
 * No parameters.
 */
async function startSession() {

    if (typeof logEvent === "function") logEvent("startSession.begin");

    // Request microphone access first so permission prompt appears immediately.
    try {
        ms = await navigator.mediaDevices.getUserMedia({
            audio: true
        });
        if (typeof logEvent === "function") logEvent("mic.granted", { tracks: ms.getTracks().length });
    } catch (e) {
        if (typeof logEvent === "function") logEvent("mic.denied", { message: e.message || String(e) });
        throw e;
    }

    await setupTranscriptionSession();
    if (typeof logEvent === "function") logEvent("transcription.session.created");

    // Create a peer connection
    pc = new RTCPeerConnection();
    if (typeof logEvent === "function") logEvent("pc.created");
    pc.addEventListener("iceconnectionstatechange", () => {
        if (typeof logEvent === "function") logEvent("pc.ice", { state: pc.iceConnectionState });
    });
    pc.addEventListener("connectionstatechange", () => {
        if (typeof logEvent === "function") logEvent("pc.connection", { state: pc.connectionState });
    });
    pc.addEventListener("signalingstatechange", () => {
        if (typeof logEvent === "function") logEvent("pc.signaling", { state: pc.signalingState });
    });

    pc.addTrack(ms.getTracks()[0]);
    if (typeof logEvent === "function") logEvent("pc.track.added");

    await setupRTCSession(pc, onPartialTranscript, onFinalTranscript, onTranscriptionError);
    if (typeof logEvent === "function") logEvent("rtc.session.ready");

    appState = "listening-for-hey-cardo";
    setListeningState();
    if (typeof logEvent === "function") logEvent("state.listening");

}

/**
 * Stops the current session, closes connections, and resets UI state.
 * No parameters.
 */
function stopSession() {
    if (pc) {
        pc.close();
        pc = null;
    }
    if (ms) {
        ms.getTracks().forEach(track => track.stop());
        ms = null;
    }
    if (inactivityTimeout) {
        clearTimeout(inactivityTimeout);
        inactivityTimeout = null;
    }
    setMuteState();
}

/**
 * Executes the given command, updates UI, and plays confirmation audio.
 * @param {string} command - The command to execute.
 */
function executeCommand(command) {
    showStatusMessage(command);
    setCommandState();
    playAudio('resources/ok.wav')
    setRestartTimeout();
}

/**
 * Checks if the given string starts with a Cardo greeting.
 * @param {string} str - The string to check for a greeting.
 * @returns {boolean} - True if greeting is found, false otherwise.
 */
function hasCardoGreeting(str) {
    return hi_regex.test(str);
}
