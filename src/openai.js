// OpenAI API integration for Cardo voice assistant: handles transcription, command parsing, and follow-up question logic.

const PART1 = "sk-proj-fqQp-r7m6i4mMZ4UulhvpxcOdC4VnACF91Y-o_ECpgsYwM2tqJE3coSAB9hzlh";
const PART2 = "4fnoCozV_TvQT3BlbkFJFF-LQOm2Z2yGyIuq2mqgLHeGg-fnokefZYfnJFAJwBD1MBkoXLAD";
const PART3 = "JPeup3C1-Xwag6iNdUbN8A"

let clientSecret = null;

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
            Authorization: `Bearer ${PART1}${PART2}${PART3}`,
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
            "Authorization": `Bearer ${PART1}${PART2}${PART3}`,
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
        audio: { voice: "shimmer", format: "wav" }
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${PART1}${PART2}${PART3}`,
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
            "Authorization": `Bearer ${PART1}${PART2}${PART3}`,
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
