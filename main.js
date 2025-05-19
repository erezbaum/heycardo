let pc = null;
let ms = null; // Store MediaStream globally
let inactivityTimeout = null; // Track inactivity timeout
const INACTIVITY_DURATION = 1 * 60 * 1000; // 5 minutes in ms
const hi_regex = /^\s*(hey|hi|high|hello)[^a-zA-Z0-9]+(cardo|kardo|caldo)\b/i;

let hey_cardo_found = false;

let STATE = null

let partial_input = "";
const handlePartialInput = (partial_input) => {
    if (STATE === "listening-for-hey-cardo-after-command") {
        setListeningState();
        showStatusMessage();
        STATE = "listening-for-hey-cardo";    
    }
    if (STATE === "listening-for-hey-cardo") {
        partial_input += data.delta;
        if (startsWithCardoGreeting(partial_input)) {
            STATE = "listening-for-command";
            showStatusMessage("???");
            playSmallBeep();
        }
    }
}

const handleCompletedInput = async (data) => {
    userInput = data.transcript;
    partial_input = ""; // Reset partial input
    if (inactivityTimeout) clearTimeout(inactivityTimeout);
    inactivityTimeout = setTimeout(stopSession, INACTIVITY_DURATION);

    if (STATE === "listening-for-command" || STATE === "listening-for-hey-cardo" || STATE === "listening-for-hey-cardo-after-command") {
        if (startsWithCardoGreeting(userInput)) {
            await handleFirstUserInput(userInput)
        } else {
            console.log("No greeting found, ignoring input.");
            STATE = "listening-for-hey-cardo";
            showStatusMessage();
        }
    }
    if (STATE === "listening-for-answer") {
        await handleAnswer(userInput);
    }
}

async function handleFirstUserInput(userInput) {
    let command = await parseCommand(userInput);
    if (command) {
        runCommand(command);
        STATUS = "listening-for-hey-cardo-after-command";
    } else {
        const audioURL = await getFollowupQuestionAudio(userInput);
        playAudio(audioURL);
        STATE = "listenining-for-answer";
    }
}

async function handleAnswer(userInput) {
    let command = await parseAnswer(userInput);
    if (command) {
        runCommand(command);
        STATUS = "listening-for-hey-cardo-after-command";
    } else {
        STATUS = "listening-for-hey-cardo";
        showStatusMessage();
    }
}




async function startSession() {

    document.addEventListener('first-user-input', HandleFirstUserInput)

    await setupTranscriptionSession();

    // Create a peer connection
    pc = new RTCPeerConnection();

    // Add local audio track for microphone input in the browser
    ms = await navigator.mediaDevices.getUserMedia({
        audio: true
    });
    pc.addTrack(ms.getTracks()[0]);

    await setupRTCSession(pc, handlePartialInput, handleCompletedInput);

    STATE = "listening-for-hey-cardo";
    setListeningState();
    showStatusMessage();

}

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


function runCommand(command) {
    showStatusMessage(command);
    setCommandState();
    playBigBeep();
}

function startsWithCardoGreeting(str) {
    return hi_regex.test(str);
}
