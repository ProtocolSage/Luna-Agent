# 🤖 Luna "Jarvis" Natural Interaction Enhancements

## Vision: Hands-Free AI Assistant

Transform Luna from button-based to fully natural voice interaction like Jarvis from Iron Man.

---

## 🎯 Core Enhancements

### 1. **Wake Word Detection** ⭐ PRIORITY

**Current**: Manual button press to start listening
**Target**: Say "Hey Luna" to activate

**Implementation**:

- Already have Picovoice Porcupine integration (`@picovoice/porcupine-web`)
- Enable continuous background listening for wake word
- Low-power mode when idle
- Activate full listening on wake word detection

**Files to Modify**:

- `app/renderer/components/LuxuryApp.tsx` - Add wake word mode
- `app/renderer/services/VoiceService.ts` - Implement wake word detection

### 2. **Automatic Message Sending** ⭐ PRIORITY

**Current**: Transcription appears, user must click "Send"
**Target**: Auto-send to AI immediately after transcription

**Implementation**:

- After STT completes, automatically trigger chat submission
- No user interaction needed
- Show subtle indicator that AI is processing

**Files to Modify**:

- `app/renderer/components/LuxuryApp.tsx:331` - Auto-submit on transcription_received

### 3. **Continuous Conversation Flow** ⭐ PRIORITY

**Current**: One-shot interaction, stops after each exchange
**Target**: Continuous back-and-forth like talking to a person

**Implementation**:

- After TTS completes, auto-resume listening
- Smart silence detection (2-3 seconds) to end turn
- Visual indicator showing "Listening..." vs "Waiting for you..."

**Already Implemented**:

- `VoiceService.ts:655` - `autoListenAfterSpeaking: true`
- Just needs to be enabled by default!

### 4. **Streaming TTS with Sentence Chunking** ⭐ PRIORITY

**Current**: Wait for full response, then speak all at once
**Target**: Speak each sentence as AI generates it

**Implementation**:

- Parse streaming response into sentences
- Start TTS on first complete sentence
- Continue generating while speaking
- Feels more responsive and natural

**Files to Modify**:

- `app/renderer/components/LuxuryApp.tsx` - Implement sentence-by-sentence TTS
- `app/renderer/services/VoiceService.ts:689` - Enhanced streaming with sentence detection

### 5. **Barge-In Capability**

**Current**: Can't interrupt Luna while speaking
**Target**: Say "Luna" or start speaking to interrupt

**Implementation**:

- Monitor for voice activity during TTS
- Cancel TTS and start new listening cycle
- Acknowledge interruption ("Yes?" or just stop cleanly)

---

## 🚀 Additional "Jarvis" Features

### 6. **Ambient Awareness Mode**

- Always listening in background (privacy toggle)
- Activates on wake word
- Low-power mode when idle
- Optional: Respond to phrases like "Luna, remind me..." without wake word

### 7. **Context Retention**

**Already Implemented**: Memory system active!

- `backend/` has full memory with vector search
- Just needs integration with conversation flow

### 8. **Proactive Assistance**

- "It's 2 PM, time for your meeting"
- "You asked me to remind you about..."
- Weather updates, news briefings

### 9. **Multi-Modal Responses**

- Voice + visual cards for complex info
- Show images, charts, code snippets while explaining
- Picture-in-picture mode for Luna's responses

### 10. **Personality Customization**

- Formal vs Casual tone
- Response speed (fast/thoughtful)
- Humor level
- Voice selection (male/female, accents)

---

## 📋 Implementation Priority

### Phase 1: Core Natural Interaction (THIS SESSION)

1. ✅ Auto-send transcriptions to AI
2. ✅ Enable continuous conversation (already in code!)
3. ✅ Streaming sentence-by-sentence TTS
4. ⚠️ Wake word detection (optional - can do manual for now)

### Phase 2: Enhanced Experience

5. Barge-in capability
6. Better silence detection
7. Context-aware responses
8. Visual improvements for voice states

### Phase 3: Advanced Features

9. Ambient awareness
10. Proactive assistance
11. Personality customization
12. Multi-modal responses

---

## 🎬 User Flow: Natural Interaction

### Current Flow (Button-Based)

```
1. User clicks "Listen" button
2. User speaks: "What's the weather?"
3. Transcription appears: "What's the weather?"
4. User clicks "Send" button
5. AI generates response
6. TTS speaks response
7. User clicks "Listen" again (repeat)
```

### Target Flow (Natural/Jarvis-like)

```
1. User says: "Hey Luna"
2. Luna: *chime* (listening indicator)
3. User: "What's the weather?"
4. Luna: *processing indicator*
5. Luna starts speaking: "The weather in your area is..."
6. Luna: *listening indicator* (auto-resumes)
7. User: "How about tomorrow?"
8. Luna: *processing*
9. Luna: "Tomorrow will be..."
(continuous until user says "Thanks Luna" or walks away)
```

---

## 💻 Code Changes Required

### LuxuryApp.tsx

```typescript
// CURRENT: Manual transcription handling
private handleTranscriptionReceived = (transcript: string) => {
  this.setState({ transcript }); // User must click send
};

// TARGET: Auto-send to AI
private handleTranscriptionReceived = async (transcript: string) => {
  this.setState({ transcript, isProcessing: true });

  // Auto-send to AI immediately
  await this.handleSendMessage(transcript);
};
```

### Enable Continuous Conversation

```typescript
// In VoiceService initialization
const voiceService = new VoiceService({
  autoListenAfterSpeaking: true, // ✅ Already in code!
  continuousListening: true, // Enable this
  enableVAD: true, // Voice Activity Detection
  silenceThreshold: 0.01,
  volumeThreshold: 0.1,
});
```

### Streaming Sentence TTS

```typescript
// Parse streaming response into sentences
private async handleStreamingWithSentenceTTS(message: string) {
  let buffer = '';
  let spokenSoFar = '';

  const sentenceRegex = /[.!?]+\s/g;

  await this.voiceService.chatWithStreaming(
    message,
    (token) => {
      buffer += token;

      // Check for complete sentence
      const match = buffer.match(sentenceRegex);
      if (match) {
        const sentences = buffer.split(sentenceRegex);
        const completeSentence = sentences[0];

        if (!spokenSoFar.includes(completeSentence)) {
          // Speak this sentence while continuing to generate
          this.voiceService.speak(completeSentence);
          spokenSoFar += completeSentence;
        }

        buffer = sentences[sentences.length - 1];
      }
    },
    (fullResponse) => {
      // Speak any remaining text
      if (buffer.trim() && !spokenSoFar.includes(buffer)) {
        this.voiceService.speak(buffer);
      }
    }
  );
}
```

---

## 🔧 Configuration Options

Add to `.env`:

```env
# Voice Configuration
LUNA_WAKE_WORD_ENABLED=true
LUNA_WAKE_WORD="hey luna"
LUNA_CONTINUOUS_CONVERSATION=true
LUNA_AUTO_LISTEN_AFTER_TTS=true
LUNA_SILENCE_TIMEOUT=3000
LUNA_ENABLE_BARGE_IN=true
LUNA_SENTENCE_TTS=true

# Personality
LUNA_VOICE_RATE=1.0
LUNA_VOICE_PITCH=1.0
LUNA_PERSONALITY=professional  # professional, casual, friendly
```

---

## 🎨 UI Improvements

### Voice State Indicators

```
┌─────────────────────────────────────┐
│  🎤 Listening...                    │  ← Active listening
│  "What's the weather?"              │
│                                     │
│  🤖 Luna is thinking...             │  ← Processing
│                                     │
│  🔊 Luna is speaking...             │  ← TTS active
│  "The weather today is sunny..."    │
│                                     │
│  💤 Say "Hey Luna" to activate      │  ← Idle/Wake word mode
└─────────────────────────────────────┘
```

### Minimal Mode (Picture-in-Picture)

- Small floating window
- Just voice waveform + text
- Always on top
- Can minimize to system tray

---

## 🧪 Testing Scenarios

1. **Basic Conversation**
   - "Hey Luna" → "What's the time?" → Get response → Auto-listen → "Thanks"

2. **Multi-Turn Dialog**
   - "What's the weather?" → "How about tomorrow?" → "And next week?"

3. **Interruption**
   - Luna speaking → User says "Luna stop" → Luna stops

4. **Ambient Mode**
   - Luna idle → User says "Hey Luna, remind me..." → Luna activates

5. **Error Recovery**
   - Network fails → Luna apologizes → Auto-retry

---

## 📊 Success Metrics

- **Time to Response**: < 500ms from speech end to AI start
- **Conversation Continuity**: 5+ turn dialogs without button presses
- **Wake Word Accuracy**: > 95% detection rate
- **User Satisfaction**: "Feels natural" rating > 90%

---

**Ready to implement Phase 1!**

Let's start with the highest impact changes:

1. Auto-send transcriptions
2. Enable continuous conversation
3. Implement streaming sentence TTS
