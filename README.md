# Cardo Cloud ASR Demo

This project demonstrates a cloud-based Automatic Speech Recognition (ASR) system for Cardo devices. It showcases real-time voice command recognition, follow-up question handling, and command execution using OpenAI's APIs. The demo is designed for browser use and provides a simple UI for interacting with the Cardo voice assistant.

## Project Structure

```
hey1/
├── index.html
├── resources/
│   └── cardo_logo.avif
├── src/
│   ├── main.js
│   ├── openai.js
│   ├── prompt.js
│   ├── utils.js
│   └── drafts.js
├── .gitignore
```

### File Descriptions

- **index.html**  
  The main HTML file. Sets up the UI, loads scripts, and manages DOM elements for the demo.

- **resources/cardo_logo.avif**  
  Cardo logo image displayed in the UI.

- **src/main.js**  
  Main application logic. Manages state, handles transcription events, processes user input, and updates the UI.

- **src/openai.js**  
  Handles integration with OpenAI APIs for transcription, command parsing, and generating follow-up questions (text and audio).

- **src/prompt.js**  
  Contains prompt templates and command lists used for instructing the OpenAI models.

- **src/utils.js**  
  Utility functions for audio feedback (beeps) and simple timing utilities.

- **src/drafts.js**  
  Experimental or alternative implementations, such as a two-step follow-up question and TTS audio generation.

- **.gitignore**  
  Standard ignore file for logs, build artifacts, and editor files.

## How It Works

1. The app listens for a greeting ("Hey Cardo", etc.).
2. When a greeting is detected, it listens for a command.
3. If the command is recognized, it executes and confirms.
4. If unclear, it asks a follow-up question (with audio).
5. The user's answer is parsed to extract the intended command.

## Requirements

- Modern web browser with microphone access.
- OpenAI API access (API keys are split in the code for demo purposes).

## Notes

- This is a demo and not intended for production use.
- All processing is done client-side except for API calls to OpenAI.

