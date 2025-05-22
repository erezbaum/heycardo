
const PART1 = "sk-proj-fqQp-r7m6i4mMZ4UulhvpxcOdC4VnACF91Y-o_ECpgsYwM2tqJE3coSAB9hzlh";
const PART2 = "4fnoCozV_TvQT3BlbkFJFF-LQOm2Z2yGyIuq2mqgLHeGg-fnokefZYfnJFAJwBD1MBkoXLAD";
const PART3 = "JPeup3C1-Xwag6iNdUbN8A"

let clientSecret = null;

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

async function getFollowupQuestionAudio2(userInput) {
    startTimer('question2');
    const payload = {
        model: "gpt-4.1-nano",
        messages: [
            { role: "system", content: GENERATE_QUESTION_TEXT_PROMPT },
            { role: "user", content: userInput }
        ]
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
    const questionText = data.choices[0].message.content;
    console.log("Question Text", questionText);

    const payload2 = {
        model: "tts-1", //"gpt-4o-mini-tts",
        input: questionText,
        voice: "shimmer",
        response_format: "wav",
        //speed: 1.5,
    };

    const response2 = await fetch('https://api.openai.com/v1/audio/speech', {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${PART1}${PART2}${PART3}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload2)
    });

    if (!response2.ok) {
        throw new Error(`HTTP error! status: ${response2.status}`);
    }
    const audioBlob = await response2.blob();
    const questionAudio = URL.createObjectURL(audioBlob);

    stopTimer('question2');
    return {questionText, questionAudio};
}


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
