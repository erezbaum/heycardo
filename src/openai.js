// OpenAI API integration for Cardo voice assistant: handles transcription, command parsing, and follow-up question logic.

const PART1 = "YA\x07ZXE@\x07\\\x18cDK\\k\x7Fhxchos\x07nzCH\x1DR\\zr\x1F~fNRc|FkzP}km~`{EH\x07\x12@\x1Ar\x12IF\x1EYxi\x7Fh]|Lg|X\x19\x1CZ|\x12A_lMfy~\x19hFHAl`";
const PART2 = "o\x07~_oZLE}[{ch`hL\x1BGa\x7FX_eDg\x1C`";
const PART3 = "p\x1E\x1FP[dAYrKls}EB\x1F}|}SMeke\x19K[my{\x18fz{HnZX\x1Ec^~s_\x7FMk"

let clientSecret = null;
const FAST_TEXT_MODEL = "gpt-5-nano";
const FAST_TEXT_MODEL_FALLBACK = "gpt-4.1-nano";
const TTS_MODEL = "gpt-4o-mini-tts";
if (!Array.isArray(ALLOWED_COMMANDS) || ALLOWED_COMMANDS.length === 0) {
    throw new Error("ALLOWED_COMMANDS must be defined in prompt.js before openai.js loads.");
}
const COMMAND_JSON_SCHEMA = {
    type: "json_schema",
    name: "cardo_command",
    schema: {
        type: "object",
        properties: {
            command: {
                type: ["string", "null"],
                enum: [...ALLOWED_COMMANDS, null]
            }
        },
        required: ["command"],
        additionalProperties: false
    },
    strict: true
};

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

    if (typeof logEvent === "function") logEvent("api.transcription_session.create.start");
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
        if (typeof logEvent === "function") logEvent("api.transcription_session.create.fail", { status: sessionResponse.status });
        throw new Error(`Failed to create session: ${sessionResponse.status}`);
    }
    const sessionData = await sessionResponse.json();
    clientSecret = sessionData.client_secret.value;
    // Log session settings without secrets to help debug transcription issues.
    if (typeof logEvent === "function") {
        const { client_secret, ...safeSessionData } = sessionData || {};
        logEvent("api.transcription_session.create.session", safeSessionData);
    }
    if (typeof logEvent === "function") logEvent("api.transcription_session.create.ok");
}

/**
 * Sets up a WebRTC session and handles transcription events from the OpenAI API.
 * @param {RTCPeerConnection} pc - The peer connection object.
 * @param {function} partialCallback - Callback for partial transcription results.
 * @param {function} completeCallback - Callback for completed transcription results.
 * @param {function} errorCallback - Callback for transcription failure events.
 */
async function setupRTCSession(pc, partialCallback, completeCallback, errorCallback) {

    // Set up data channel for sending and receiving events
    const dc = pc.createDataChannel("oai-events");
    if (typeof logEvent === "function") logEvent("rtc.datachannel.created");
    dc.addEventListener("open", () => {
        if (typeof logEvent === "function") logEvent("rtc.datachannel.open");
    });
    dc.addEventListener("close", () => {
        if (typeof logEvent === "function") logEvent("rtc.datachannel.close");
    });
    dc.addEventListener("error", () => {
        if (typeof logEvent === "function") logEvent("rtc.datachannel.error");
    });
    dc.addEventListener("message", async (e) => {
        // Realtime server events appear here!
        const data = JSON.parse(e.data);
        if (typeof logEvent === "function") {
            // Log full payload for failures to capture error codes/messages.
            const isFailure = typeof data?.type === "string" && data.type.endsWith(".failed");
            if (isFailure) {
                logEvent("rtc.event", { type: data.type, data });
            } else {
                logEvent("rtc.event", { type: data.type });
            }
        }
        switch (data.type) {
            case "conversation.item.input_audio_transcription.delta":
                partialCallback(data.delta);
                break
            case "conversation.item.input_audio_transcription.completed":
                console.log("Final Transcription:", data.transcript);   
                await completeCallback(data.transcript);
                break;
            case "conversation.item.input_audio_transcription.failed":
                if (typeof errorCallback === "function") {
                    await errorCallback(data);
                }
                break;
            case "transcription_session.created":
                init_beep();
                break;
        }
    });

    // Start the session using the Session Description Protocol (SDP)
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (typeof logEvent === "function") logEvent("rtc.offer.created");
    const sdpResponse = await fetch("https://api.openai.com/v1/realtime", {
        method: "POST",
        body: offer.sdp,
        headers: {
            Authorization: `Bearer ${clientSecret}`,
            "Content-Type": "application/sdp"
        },
    });
    if (!sdpResponse.ok) {
        if (typeof logEvent === "function") logEvent("rtc.sdp.fail", { status: sdpResponse.status });
        throw new Error(`Failed to start realtime session: ${sdpResponse.status}`);
    }

    await pc.setRemoteDescription({
        type: "answer",
        sdp: await sdpResponse.text(),
    });
    if (typeof logEvent === "function") logEvent("rtc.sdp.ok");
}

/**
 * Sends user input to the OpenAI API to parse and extract a command.
 * @param {string} userInput - The user's spoken or typed input.
 * @returns {Promise<string|null>} - The parsed command or null if not found.
 */
async function parseCommand(userInput) {
    if (typeof logEvent === "function") logEvent("api.parse_command.start");
    const payload = {
        model: FAST_TEXT_MODEL,
        instructions: PARSE_FIRST_COMMAND_PROMPT,
        input: userInput,
        reasoning: { effort: "minimal" },
        text: {
            verbosity: "low",
            format: COMMAND_JSON_SCHEMA
        }
    };
    const result = await createFastJsonResponse(payload);
    const outputText = extractResponseOutputText(result);

    let jsonResponse;
    try {
        jsonResponse = JSON.parse(outputText);
    } catch (e) {
        jsonResponse = { command: null }; // fallback
    }
    if (jsonResponse.command === "null")
        jsonResponse.command = null; // fallback
    if (typeof logEvent === "function") logEvent("api.parse_command.ok", { command: jsonResponse.command });
    return jsonResponse.command;

}


/**
 * Gets a follow-up question (text and audio) from the OpenAI API when the command is unclear.
 * @param {string} userInput - The user's spoken or typed input.
 * @returns {Promise<{questionText: string, questionAudio: string}>} - The follow-up question text and audio URL.
 */
async function getFollowupQuestionAudio(userInput) {
    if (typeof logEvent === "function") logEvent("api.followup_audio.start");
    startTimer('question');

    const questionPayload = {
        model: FAST_TEXT_MODEL,
        instructions: GENERATE_QUESTION_AUDIO_PROMPT,
        input: userInput,
        reasoning: { effort: "minimal" },
        text: { verbosity: "low" }
    };

    const questionResult = await createFastJsonResponse(questionPayload);
    const questionText = clampToWordLimit(extractResponseOutputText(questionResult), 12);
    if (!questionText) {
        throw new Error("No follow-up text returned from OpenAI.");
    }

    const ttsPayload = {
        model: TTS_MODEL,
        input: questionText,
        voice: "shimmer",
        response_format: "wav"
    };
    const ttsResponse = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
            Authorization: getAuthHeader(),
            "Content-Type": "application/json"
        },
        body: JSON.stringify(ttsPayload)
    });

    if (!ttsResponse.ok) {
        if (typeof logEvent === "function") logEvent("api.followup_audio.fail", { status: ttsResponse.status });
        throw new Error(`TTS HTTP error! status: ${ttsResponse.status}`);
    }

    const audioBlob = await ttsResponse.blob();
    const questionAudio = URL.createObjectURL(audioBlob);
    stopTimer('question');
    if (typeof logEvent === "function") logEvent("api.followup_audio.ok");
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
    if (typeof logEvent === "function") logEvent("api.parse_answer.start");
    const payload = {
        model: FAST_TEXT_MODEL,
        input: [
            { role: "system", content: PARSE_SECOND_COMMAND_PROMPT },
            { role: "user", content: user_first_input },
            { role: "assistant", content: follow_up_question },
            { role: "user", content: userInput }
        ],
        reasoning: { effort: "minimal" },
        text: {
            verbosity: "low",
            format: COMMAND_JSON_SCHEMA
        }
    };

    const result = await createFastJsonResponse(payload);
    const outputText = extractResponseOutputText(result);

    let jsonResponse;
    try {
        jsonResponse = JSON.parse(outputText);
    } catch (e) {
        jsonResponse = { command: null }; // fallback
    }
    if (jsonResponse.command === "null")
        jsonResponse.command = null; // fallback

    if (typeof logEvent === "function") logEvent("api.parse_answer.ok", { command: jsonResponse.command });
    return jsonResponse.command;
}

function extractResponseOutputText(result) {
    if (typeof result?.output_text === "string" && result.output_text.length > 0) {
        return result.output_text;
    }
    const output = Array.isArray(result?.output) ? result.output : [];
    for (const item of output) {
        if (item?.type === "message" && Array.isArray(item?.content)) {
            for (const part of item.content) {
                if (part?.type === "output_text" && typeof part?.text === "string") {
                    return part.text;
                }
            }
        }
    }
    return "";
}

async function createFastJsonResponse(payload) {
    const baseHeaders = {
        Authorization: getAuthHeader(),
        "Content-Type": "application/json"
    };
    const preparedPayload = preparePayloadForStructuredOutput(payload);

    // First attempt: latest fast model with low-latency tuning.
    const firstTry = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: baseHeaders,
        body: JSON.stringify(preparedPayload)
    });
    if (firstTry.ok) {
        return await firstTry.json();
    }

    const firstBody = await safeReadBody(firstTry);
    if (typeof logEvent === "function") {
        logEvent("api.responses.fail", {
            status: firstTry.status,
            model: preparedPayload?.model,
            body: firstBody
        });
    }

    // Second attempt: remove reasoning/verbosity tuning in case the model rejects params.
    const relaxedPayload = {
        ...preparedPayload,
        reasoning: undefined,
        text: preparedPayload?.text?.format ? { format: preparedPayload.text.format } : undefined
    };
    const secondTry = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: baseHeaders,
        body: JSON.stringify(relaxedPayload)
    });
    if (secondTry.ok) {
        return await secondTry.json();
    }

    const secondBody = await safeReadBody(secondTry);
    if (typeof logEvent === "function") {
        logEvent("api.responses.fail", {
            status: secondTry.status,
            model: relaxedPayload?.model,
            body: secondBody
        });
    }

    // Third attempt: older fast fallback model for projects without GPT-5 access.
    const fallbackPayload = {
        ...relaxedPayload,
        model: FAST_TEXT_MODEL_FALLBACK
    };
    const thirdTry = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: baseHeaders,
        body: JSON.stringify(fallbackPayload)
    });
    if (thirdTry.ok) {
        return await thirdTry.json();
    }

    const thirdBody = await safeReadBody(thirdTry);
    if (typeof logEvent === "function") {
        logEvent("api.responses.fail", {
            status: thirdTry.status,
            model: fallbackPayload?.model,
            body: thirdBody
        });
    }
    throw new Error(`OpenAI responses failed with status ${thirdTry.status}`);
}

async function safeReadBody(response) {
    try {
        return await response.text();
    } catch (_err) {
        return "";
    }
}

function preparePayloadForStructuredOutput(payload) {
    const formatType = payload?.text?.format?.type;
    if (formatType !== "json_object" && formatType !== "json_schema") {
        return payload;
    }

    // Normalize string input to message-array input so we can consistently prepend a JSON guard.
    const jsonGuardMessage = { role: "system", content: "Return valid JSON only, matching the requested format." };
    const cloned = { ...payload };

    if (typeof cloned.input === "string") {
        cloned.input = [jsonGuardMessage, { role: "user", content: cloned.input }];
        return cloned;
    }

    if (Array.isArray(cloned.input)) {
        const hasJsonWord = cloned.input.some((item) => {
            const content = item?.content;
            if (typeof content === "string") {
                return /json/i.test(content);
            }
            if (Array.isArray(content)) {
                return content.some((part) => {
                    if (typeof part?.text === "string") return /json/i.test(part.text);
                    if (typeof part?.content === "string") return /json/i.test(part.content);
                    return false;
                });
            }
            return false;
        });
        if (!hasJsonWord) {
            cloned.input = [jsonGuardMessage, ...cloned.input];
        }
    }

    return cloned;
}

function clampToWordLimit(text, maxWords) {
    const normalized = typeof text === "string" ? text.trim() : "";
    if (!normalized) return "";
    const words = normalized.split(/\s+/).filter(Boolean);
    return words.length <= maxWords ? normalized : words.slice(0, maxWords).join(" ");
}
