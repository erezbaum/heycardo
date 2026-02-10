const COMMAND_CATALOG = [
    { command: "answer_call", description: "Answer an incoming phone call", examples: ["Hey Cardo answer", "Hi Cardo take the call"] },
    { command: "reject_call", description: "Ignore or reject an incoming call", examples: ["Hey Cardo ignore", "Hi Cardo reject the call"] },
    { command: "end_call", description: "End the current phone call", examples: ["Hey Cardo end call", "Hi Cardo hang up"] },
    { command: "speed_dial", description: "Dial a preset speed-dial number", examples: ["Hey Cardo speed dial", "Hi Cardo quick call"] },
    { command: "redial", description: "Redial the last called number", examples: ["Hey Cardo redial", "Hi Cardo call last number"] },
    { command: "music_on", description: "Start music playback", examples: ["Hey Cardo music on", "Hi Cardo play music"] },
    { command: "music_off", description: "Stop music playback", examples: ["Hey Cardo music off", "Hi Cardo stop music"] },
    { command: "next_track", description: "Skip to the next song", examples: ["Hey Cardo next track", "Hi Cardo skip song"] },
    { command: "previous_track", description: "Go to the previous song", examples: ["Hey Cardo previous track", "Hi Cardo back one song"] },
    { command: "share_music", description: "Share music with intercom partner", examples: ["Hey Cardo share music", "Hi Cardo music share"] },
    { command: "radio_on", description: "Turn FM radio on", examples: ["Hey Cardo radio on", "Hi Cardo start radio"] },
    { command: "radio_off", description: "Turn FM radio off", examples: ["Hey Cardo radio off", "Hi Cardo stop radio"] },
    { command: "next_station", description: "Go to next FM station", examples: ["Hey Cardo next station", "Hi Cardo seek up"] },
    { command: "previous_station", description: "Go to previous FM station", examples: ["Hey Cardo previous station", "Hi Cardo seek down"] },
    { command: "call_intercom", description: "Open a Bluetooth intercom call", examples: ["Hey Cardo call intercom", "Hi Cardo start intercom"] },
    { command: "end_intercom", description: "End the intercom conversation", examples: ["Hey Cardo end intercom", "Hi Cardo close intercom"] },
    { command: "activate_siri", description: "Activate Siri on paired iPhone", examples: ["Hey Cardo Siri", "Hi Cardo activate Siri"] },
    { command: "activate_google", description: "Activate Google Assistant on Android", examples: ["Hey Cardo Google Assistant", "Hi Cardo activate Google"] },
    { command: "volume_up", description: "Increase volume", examples: ["Hey Cardo volume up", "Hi Cardo louder"] },
    { command: "volume_down", description: "Decrease volume", examples: ["Hey Cardo volume down", "Hi Cardo quieter"] },
    { command: "mute_audio", description: "Mute all audio output", examples: ["Hey Cardo mute audio", "Hi Cardo audio mute"] },
    { command: "unmute_audio", description: "Unmute audio output", examples: ["Hey Cardo unmute audio", "Hi Cardo audio unmute"] },
    { command: "mute_mic", description: "Mute microphone", examples: ["Hey Cardo mute microphone", "Hi Cardo mic mute"] },
    { command: "unmute_mic", description: "Unmute microphone", examples: ["Hey Cardo unmute microphone", "Hi Cardo mic unmute"] },
    { command: "battery_status", description: "Report battery level", examples: ["Hey Cardo battery status", "Hi Cardo battery level"] },
    { command: "mute_group", description: "Mute all other members in DMC group", examples: ["Hey Cardo mute group", "Hi Cardo group mute"] },
    { command: "unmute_group", description: "Unmute all other members in DMC group", examples: ["Hey Cardo unmute group", "Hi Cardo group unmute"] }
];

const ALLOWED_COMMANDS = COMMAND_CATALOG.map((item) => item.command);
const ALLOWED_COMMANDS_CSV = ALLOWED_COMMANDS.join(",");
const COMMAND_CATALOG_TEXT = COMMAND_CATALOG
    .map((item, index) => `${index + 1}. ${item.command} - ${item.description}\n   Examples: "${item.examples[0]}", "${item.examples[1]}"`)
    .join("\n");

const PARSE_FIRST_COMMAND_PROMPT = `
Task: classify one user utterance into exactly one command or null.

Rules:
1) Only classify if utterance begins with a Cardo wake greeting (hey/hi/hello + cardo/kardo/caldo).
2) If intent is ambiguous, partial, or not in the allowed commands, return null.
3) Output JSON only: {"command":"<allowed_command>"} or {"command":null}
4) Never output explanation text.

Allowed commands:
${ALLOWED_COMMANDS_CSV}

Command catalog:
${COMMAND_CATALOG_TEXT}
`;

const GENERATE_QUESTION_AUDIO_PROMPT = `
You ask one short clarification question for Cardo voice commands.
Return plain text only (no JSON, no base64, no labels).
Max 12 words.
Ask about the missing slot or choice only.
If no Cardo wake greeting is present, return: "Please start with Hey Cardo."

Command catalog:
${COMMAND_CATALOG_TEXT}
`;

const PARSE_SECOND_COMMAND_PROMPT = `
Task: resolve final command using:
- first user utterance
- assistant follow-up question
- second user utterance

Rules:
1) Infer intent from user utterances only.
2) Use assistant follow-up only as context for disambiguation.
3) If still ambiguous or outside allowed commands, return null.
4) Output JSON only: {"command":"<allowed_command>"} or {"command":null}
5) Never output explanation text.

Allowed commands:
${ALLOWED_COMMANDS_CSV}

Command catalog:
${COMMAND_CATALOG_TEXT}
`;
