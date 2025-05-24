async function getFollowupQuestionAudio2(userInput) {
    startTimer('question2');
    const payload = {
        model: "gpt-4.1-nano",
        messages: [
            { role: "system", content: generateQuestionTextPrompt },
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

