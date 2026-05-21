/**
 * TTS Provider abstraction
 *
 * Supports any provider via .env:
 *   TTS_PROVIDER=edge          (default, free)
 *   TTS_PROVIDER=elevenlabs    (best quality, paid)
 *   TTS_PROVIDER=openai        (good quality, paid)
 *
 * Voice config per language:
 *   TTS_VOICE_CA=ca-ES-JoanaNeural        (Catalan voice)
 *   TTS_VOICE_EN=en-IE-ConnorNeural       (English voice)
 *   TTS_RATE=+20%                         (speed, edge only)
 *
 * ElevenLabs extra:
 *   ELEVENLABS_API_KEY=...
 *   TTS_VOICE_CA=<voice_id>
 *   TTS_VOICE_EN=<voice_id>
 *
 * OpenAI extra:
 *   OPENAI_API_KEY=...
 *   TTS_VOICE_CA=nova          (alloy, echo, fable, onyx, nova, shimmer)
 *   TTS_VOICE_EN=onyx
 */

import fs from "fs";
import path from "path";

// ─── Edge TTS (free, Microsoft) ───────────────────────────────────────────────

async function synthesizeEdge(text, voice, outputBase) {
  const { EdgeTTS } = await import("@andresaya/edge-tts");
  const tts = new EdgeTTS();
  await tts.synthesize(text, voice);
  await tts.toFile(outputBase);
  return `${outputBase}.mp3`;
}

// ─── ElevenLabs ───────────────────────────────────────────────────────────────

async function synthesizeElevenLabs(text, voice, outputPath) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("Missing ELEVENLABS_API_KEY in .env");

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs error: ${err}`);
  }

  const mp3Path = `${outputPath}.mp3`;
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(mp3Path, buffer);
  return mp3Path;
}

// ─── OpenAI TTS ───────────────────────────────────────────────────────────────

async function synthesizeOpenAI(text, voice, outputPath) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY in .env");

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1",
      input: text,
      voice: voice || "nova",
      response_format: "mp3",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI TTS error: ${err}`);
  }

  const mp3Path = `${outputPath}.mp3`;
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(mp3Path, buffer);
  return mp3Path;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function textToSpeech({ text, voice, outputBase }) {
  const provider = (process.env.TTS_PROVIDER || "edge").toLowerCase();

  const dir = path.dirname(outputBase);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let outputPath;
  switch (provider) {
    case "elevenlabs":
      outputPath = await synthesizeElevenLabs(text, voice, outputBase);
      break;
    case "openai":
      outputPath = await synthesizeOpenAI(text, voice, outputBase);
      break;
    case "edge":
    default:
      outputPath = await synthesizeEdge(text, voice, outputBase);
      break;
  }

  const mida = (fs.statSync(outputPath).size / 1024).toFixed(1);
  console.log(`   ✅ ${path.basename(outputPath)} (${mida} KB) [${provider}]`);
  return outputPath;
}