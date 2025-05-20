let pc = null;
let ms = null; // Store MediaStream globally
let inactivityTimeout = null; // Track inactivity timeout
const INACTIVITY_DURATION = 5 * 60 * 1000; // 5 minutes in ms
let restartTimeout = null; // restart timeout 
const RESTART_WAIT_DURATION = 15 * 1000; // 15 seconds in ms
const hi_regex = /^\s*(hey|hi|high|hello)[^a-zA-Z0-9]+(cardo|kardo|caldo)\b/i;

let hey_cardo_found = false;

let STATE = null
let user_first_input = null;
let follow_up_question = null;

let partial_input = "";
const handlePartialInput = (delta) => {
    if (STATE === "listening-for-hey-cardo-after-command") {
        setListeningState();
        STATE = "listening-for-hey-cardo";
    }
    if (STATE === "listening-for-hey-cardo") {
        partial_input += delta;
        if (startsWithCardoGreeting(partial_input)) {
            STATE = "listening-for-command";
            setActiveListeningState();
            // startTimer('playSmallBeep');
            // playSmallBeep();
            // stopTimer('playSmallBeep');
        }
    }
}

const handleCompletedInput = async (userInput) => {
    console.log("Completed Input:", userInput);
    partial_input = ""; // Reset partial input
    if (inactivityTimeout) clearTimeout(inactivityTimeout);
    inactivityTimeout = setTimeout(stopSession, INACTIVITY_DURATION);

    if (STATE === "listening-for-command" || STATE === "listening-for-hey-cardo" || STATE === "listening-for-hey-cardo-after-command") {
        if (startsWithCardoGreeting(userInput)) {
            await handleFirstUserInput(userInput)
        } else {
            console.log("No greeting found, ignoring input.");
            STATE = "listening-for-hey-cardo";
            setListeningState();
        }
    } else if (STATE === "listening-for-answer") {
        if (restartTimeout) clearTimeout(restartTimeout);
        restartTimeout = null;
        await handleAnswer(userInput);
    }
}

async function handleFirstUserInput(userInput) {
    console.log("First User Input:", userInput);
    let command = await parseCommand(userInput);
    if (command) {
        runCommand(command);
        console.log("Command Found:", command);
        STATE = "listening-for-hey-cardo-after-command";
    } else {
        user_first_input = userInput;
        const { questionText, questionAudio } = await getFollowupQuestionAudio(userInput);
//        const { questionText, questionAudio } = await getFollowupQuestionAudio2(userInput);
        console.log("Follow-up Question:", questionText);
        startTimer('playAudio');
        playAudio(questionAudio);
        stopTimer('playAudio');
        follow_up_question = questionText;
        STATE = "listening-for-answer";
        setRestartTimout();
    }
}

async function handleAnswer(userInput) {
    console.log("User Answer:", userInput);
    let command = await parseAnswer(user_first_input, follow_up_question, userInput);
    console.log("Parsed Command:", command);
    if (command) {
        runCommand(command);
        STATE = "listening-for-hey-cardo-after-command";
    } else {
        STATE = "listening-for-hey-cardo";
        playAudio('try-again.wav');
        setListeningState();
    }
}

function setRestartTimout() {
    if (restartTimeout) clearTimeout(restartTimeout);
    restartTimeout = setTimeout(() => {
        STATE = "listening-for-hey-cardo";
        setListeningState();
        if (restartTimeout) clearTimeout(restartTimeout);
        restartTimeout = null;
    }, RESTART_WAIT_DURATION);
}

function noAnswer() {
    STATE = "listening-for-hey-cardo";
    setListeningState();
    if (answerWaitTimeout) clearTimeout(answerWaitTimeout);
    answerWaitTimeout = null;
}

async function startSession() {

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
    playAudio('ok.wav')
    setRestartTimout();
}

function startsWithCardoGreeting(str) {
    return hi_regex.test(str);
}
