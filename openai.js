let pc = null;
let ms = null; // Store MediaStream globally
let inactivityTimeout = null; // Track inactivity timeout
const INACTIVITY_DURATION = 1 * 60 * 1000; // 5 minutes in ms
const PART1 = "sk-proj-fqQp-r7m6i4mMZ4UulhvpxcOdC4VnACF91Y-o_ECpgsYwM2tqJE3coSAB9hzlh";
const PART2 = "4fnoCozV_TvQT3BlbkFJFF-LQOm2Z2yGyIuq2mqgLHeGg-fnokefZYfnJFAJwBD1MBkoXLAD";
const PART3 = "JPeup3C1-Xwag6iNdUbN8A"
const hi_regex = /^\s*(hey|hi|high|hello)[^a-zA-Z0-9]+(cardo|kardo|caldo)\b/i;


function startsWithCardoGreeting(str) {
    return hi_regex.test(str);
}

async function init_session() {

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
        console.error('Failed to create session:', sessionResponse.statusText);
        setError('Failed to create session with OpenAI');
        return;
    }
    const sessionData = await sessionResponse.json();
    const EPHEMERAL_KEY = sessionData.client_secret.value;

    // Create a peer connection
    pc = new RTCPeerConnection();

    // Add local audio track for microphone input in the browser
    ms = await navigator.mediaDevices.getUserMedia({
        audio: true
    });
    pc.addTrack(ms.getTracks()[0]);

    let hey_cardo_found = false;
    let partial_input = "";

    // Set up data channel for sending and receiving events
    const dc = pc.createDataChannel("oai-events");
    dc.addEventListener("message", async (e) => {
        // Realtime server events appear here!
        const data = JSON.parse(e.data);
        switch (data.type) {
            case "conversation.item.input_audio_transcription.delta":
                //             console.log(`Partial: ${partial_input}`);
                if (!hey_cardo_found) {
                    if (!partial_input) {
                        setListeningState();
                        showStatusMessage();
                    }
                    partial_input += data.delta;
                    if (startsWithCardoGreeting(partial_input)) {
                        hey_cardo_found = true;
                        showStatusMessage("???");
                        playSmallBeep();
                    }
                }
                break
            case "conversation.item.input_audio_transcription.completed":
                //                console.log(`Completed: ${data.transcript}`);
                startTimer("openai");
                await handle_transcription_text(data.transcript);
                stopTimer("openai");
                partial_input = ""; // Reset partial input
                hey_cardo_found = false; // Reset the flag for the next session
                // Reset inactivity timeout
                if (inactivityTimeout) clearTimeout(inactivityTimeout);
                inactivityTimeout = setTimeout(() => {
                    close_session();
                }, INACTIVITY_DURATION);
                break;
            case "transcription_session.created":
                init_beep();
                break;
            default:
            //                console.log("Unknown event type:", data.type);
        }
    });

    // Start the session using the Session Description Protocol (SDP)
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const sdpResponse = await fetch("https://api.openai.com/v1/realtime", {
        method: "POST",
        body: offer.sdp,
        headers: {
            Authorization: `Bearer ${EPHEMERAL_KEY}`,
            "Content-Type": "application/sdp"
        },
    });

    await pc.setRemoteDescription({
        type: "answer",
        sdp: await sdpResponse.text(),
    });
}

function close_session() {
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

async function handle_transcription_text(userInput) {
    if (!startsWithCardoGreeting(userInput)) {
        console.log("No greeting found, ignoring input.");
        return;
    }
    const payload = {
        model: "gpt-4.1-nano",
        messages: [
            { role: "system", content: systemPrompt },
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

    if (jsonResponse.command) {
        showStatusMessage(jsonResponse.command);
        setCommandState();
        playBigBeep();
    }

    // console.log(jsonResponse);

}


async function handle_transcription_audio(userInput) {
    if (!startsWithCardoGreeting(userInput)) {
        console.log("No greeting found, ignoring input.");
        return;
    }
    const payload = {
        model: "gpt-4o-audio-preview",
        modalities: ["text", "audio"],
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userInput }
        ],
        audio: { voice: "alloy", format: "mp3" }
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
    const textResponse = result.choices[0].message.audio.transcript;
    console.log("Text response:", textResponse);

    let jsonResponse;
    try {
        jsonResponse = JSON.parse(textResponse);
    } catch (e) {
        jsonResponse = { command: null }; // fallback
    }

    if (jsonResponse.command) {
        playBigBeep();
        showStatusMessage(jsonResponse.command);
    } else {
        const audioBase64 = result.choices[0].message.audio.data;
        const audioBlob = new Blob([Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0))], { type: 'audio/mpeg' });
        const audioUrl = URL.createObjectURL(audioBlob);
        playAudio(audioUrl);
    }
    setCommandState();

}


