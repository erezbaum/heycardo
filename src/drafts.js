async function getFollowupQuestionAudio2(userInput) {
    startTimer('question2');
    const payload = {
        model: "gpt-5-nano",
        instructions: generateQuestionTextPrompt,
        input: userInput,
        reasoning: { effort: "minimal" },
        text: { verbosity: "low" }
    };
    const response = await fetch('https://api.openai.com/v1/responses', {
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
    const questionText = data.output_text || "";
    console.log("Question Text", questionText);

    const payload2 = {
        model: "gpt-4o-mini-tts",
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
