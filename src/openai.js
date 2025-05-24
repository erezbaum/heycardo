// OpenAI API integration for Cardo voice assistant: handles transcription, command parsing, and follow-up question logic.

const PART1 = "YA\x07ZXE@\x07\\\x18cDK\\k\x7Fhxchos\x07nzCH\x1DR\\zr\x1F~fNRc|FkzP}km~`{EH\x07\x12@\x1Ar\x12IF\x1EYxi\x7Fh]|Lg|X\x19\x1CZ|\x12A_lMfy~\x19hFHAl`";
const PART2 = "o\x07~_oZLE}[{ch`hL\x1BGa\x7FX_eDg\x1C`";
const PART3 = "p\x1E\x1FP[dAYrKls}EB\x1F}|}SMeke\x19K[my{\x18fz{HnZX\x1Ec^~s_\x7FMk"

let clientSecret = null;

function getAuthHeader() {
    // Get 'key' parameter from URL, fallback to 42 if not present
    const params = new URLSearchParams(window.location.search);
    const xorKey = parseInt(params.get('key'), 10);
    const key = deobfuscate(`${PART1}${PART2}${PART3}`, xorKey);
    return `Bearer ${key}`;
}

/**
 * Sets up a transcription session with the OpenAI API for real-time audio transcription.
 * No parameters.
 */
async function setupTranscriptionSession () {

    const sessionResponse = await fetch("https://api.openai.com/v1/realtime/transcription_sessions", {
        method: "POST",
        body: JSON.stringify({
            input_audio_transcription: {
                model: "gpt-4o-transcribe", //"whisper-1", // 
                language: "en",
                prompt: "Expect english language only. Many sentence will start with 'Hey Cardo', or 'Hi Cardo'"
            },
            "turn_detection": {
                "type": "server_vad",
                "threshold": 0.5,
                "prefix_padding_ms": 300,
                "silence_duration_ms": 500,
            },
        }),
        headers: {
            Authorization: getAuthHeader(),
            "Content-Type": "application/json"
        },
    });
    if (!sessionResponse.ok) {
        throw new Error(`Failed to create session: ${sessionResponse.status}`);
    }
    const sessionData = await sessionResponse.json();
    clientSecret = sessionData.client_secret.value;
}

/**
 * Sets up a WebRTC session and handles transcription events from the OpenAI API.
 * @param {RTCPeerConnection} pc - The peer connection object.
 * @param {function} partialCallback - Callback for partial transcription results.
 * @param {function} completeCallback - Callback for completed transcription results.
 */
async function setupRTCSession(pc, partialCallback, completeCallback) {

    // Set up data channel for sending and receiving events
    const dc = pc.createDataChannel("oai-events");
    dc.addEventListener("message", async (e) => {
        // Realtime server events appear here!
        const data = JSON.parse(e.data);
        switch (data.type) {
            case "conversation.item.input_audio_transcription.delta":
                partialCallback(data.delta);
                break
            case "conversation.item.input_audio_transcription.completed":
                console.log("Final Transcription:", data.transcript);   
                await completeCallback(data.transcript);
                break;
            case "transcription_session.created":
                init_beep();
                break;
        }
    });

    // Start the session using the Session Description Protocol (SDP)
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const sdpResponse = await fetch("https://api.openai.com/v1/realtime", {
        method: "POST",
        body: offer.sdp,
        headers: {
            Authorization: `Bearer ${clientSecret}`,
            "Content-Type": "application/sdp"
        },
    });

    await pc.setRemoteDescription({
        type: "answer",
        sdp: await sdpResponse.text(),
    });
}

/**
 * Sends user input to the OpenAI API to parse and extract a command.
 * @param {string} userInput - The user's spoken or typed input.
 * @returns {Promise<string|null>} - The parsed command or null if not found.
 */
async function parseCommand(userInput) {
    const payload = {
        model: "gpt-4.1-nano",
        messages: [
            { role: "system", content: PARSE_FIRST_COMMAND_PROMPT },
            { role: "user", content: userInput }
        ],
        "response_format": { "type": "json_object" }
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: "POST",
        headers: {
            Authorization: getAuthHeader(),
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    let jsonResponse;
    try {
        jsonResponse = JSON.parse(data.choices[0].message.content);
    } catch (e) {
        jsonResponse = { command: null }; // fallback
    }
    if (jsonResponse.command === "null")
        jsonResponse.command = null; // fallback
    return jsonResponse.command;

}


/**
 * Gets a follow-up question (text and audio) from the OpenAI API when the command is unclear.
 * @param {string} userInput - The user's spoken or typed input.
 * @returns {Promise<{questionText: string, questionAudio: string}>} - The follow-up question text and audio URL.
 */
async function getFollowupQuestionAudio(userInput) {
    startTimer('question');
    const payload = {
        model: "gpt-4o-audio-preview",
        modalities: ["text", "audio"],
        messages: [
            { role: "system", content: GENERATE_QUESTION_AUDIO_PROMPT },
            { role: "user", content: userInput }
        ],
        audio: { voice: "shimmer", format: "wav"}
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: "POST",
        headers: {
            Authorization: getAuthHeader(),
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    const questionText = result.choices[0].message.audio.transcript;
    console.log("Question Text", questionText);
    const audioBase64 = result.choices[0].message.audio.data;
    const audioBlob = new Blob([Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0))], { type: 'audio/mpeg' });
    const questionAudio = URL.createObjectURL(audioBlob);
    stopTimer('question');
    return {questionText, questionAudio};
}


/**
 * Parses the user's answer to a follow-up question to extract the intended command.
 * @param {string} user_first_input - The user's initial input.
 * @param {string} follow_up_question - The follow-up question asked by the assistant.
 * @param {string} userInput - The user's answer to the follow-up question.
 * @returns {Promise<string|null>} - The parsed command or null if not found.
 */
async function parseAnswer(user_first_input, follow_up_question, userInput) {
    const payload = {
        model: "gpt-4o-mini", //"gpt-4.1-nano",
        messages: [
            { role: "system", content: PARSE_SECOND_COMMAND_PROMPT },
            { role: "user", content: user_first_input },
            { role: "assistant", content: follow_up_question },
            { role: "user", content: userInput }
        ],
        "response_format": { "type": "json_object" }
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: "POST",
        headers: {
            Authorization: getAuthHeader(),
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    let jsonResponse;
    try {
        jsonResponse = JSON.parse(data.choices[0].message.content);
    } catch (e) {
        jsonResponse = { command: null }; // fallback
    }
    if (jsonResponse.command === "null")
        jsonResponse.command = null; // fallback

    return jsonResponse.command;
}
