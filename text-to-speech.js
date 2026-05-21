/**
 * TTS Provider abstraction
 *
 * TTS_PROVIDER=edge          (default, free)
 * TTS_PROVIDER=elevenlabs    (best quality, paid)
 * TTS_PROVIDER=openai        (good quality, paid)
 *
 * TTS_VOICE_CA=ca-ES-JoanaNeural
 * TTS_VOICE_EN=en-IE-ConnorNeural
 * TTS_RATE=+20%                      (edge only)
 *
 * ElevenLabs: ELEVENLABS_API_KEY + TTS_VOICE_CA/EN = voice_id
 * OpenAI:     OPENAI_API_KEY + TTS_VOICE_CA/EN = alloy|echo|fable|onyx|nova|shimmer
 *             TTS_OPENAI_INSTRUCTIONS = custom voice style instructions
 */

import fs from "fs";
import path from "path";

// ─── Edge TTS (free, Microsoft) ───────────────────────────────────────────────

// Phonetic overrides per voice — only needed when the TTS mispronounces names
const PHONETIC_OVERRIDES = {
  "ca-ES-JoanaNeural": { "Conor": "Kóónórr", "Clara": "Clara" },
};

function applyPhoneticOverrides(text, voice) {
  const overrides = PHONETIC_OVERRIDES[voice];
  if (!overrides) return text;
  return Object.entries(overrides).reduce(
    (t, [name, phonetic]) => t.replaceAll(name, phonetic),
    text
  );
}

async function synthesizeEdge(text, voice, outputBase, rate) {
  const { EdgeTTS } = await import("@andresaya/edge-tts");
  const tts = new EdgeTTS();
  await tts.synthesize(applyPhoneticOverrides(text, voice), voice, { rate: rate || "+20%" });
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

  if (!res.ok) throw new Error(`ElevenLabs error: ${await res.text()}`);

  const mp3Path = `${outputPath}.mp3`;
  fs.writeFileSync(mp3Path, Buffer.from(await res.arrayBuffer()));
  return mp3Path;
}

// ─── OpenAI TTS ───────────────────────────────────────────────────────────────

const DEFAULT_INSTRUCTIONS = `Voice: Warm, gentle, and playful, with a soft and soothing cadence perfect for young children.
Phrasing: Short, clear sentences with natural pauses to allow the child to follow along.
Tone: Friendly, magical, and reassuring, evoking wonder and comfort.`;

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
      model: "gpt-4o-mini-tts",
      input: text,
      voice: voice || "nova",
      instructions: process.env.TTS_OPENAI_INSTRUCTIONS || DEFAULT_INSTRUCTIONS,
      response_format: "mp3",
    }),
  });

  if (!res.ok) throw new Error(`OpenAI TTS error: ${await res.text()}`);

  const mp3Path = `${outputPath}.mp3`;
  fs.writeFileSync(mp3Path, Buffer.from(await res.arrayBuffer()));
  return mp3Path;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function textToSpeech({ text, voice, outputBase }) {
  const provider = (process.env.TTS_PROVIDER || "edge").toLowerCase();
  const rate = process.env.TTS_RATE || "+20%";

  const dir = path.dirname(outputBase);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const synthesizers = {
    edge: () => synthesizeEdge(text, voice, outputBase, rate),
    elevenlabs: () => synthesizeElevenLabs(text, voice, outputBase),
    openai: () => synthesizeOpenAI(text, voice, outputBase),
  };

  const synthesize = synthesizers[provider];
  if (!synthesize) throw new Error(`Unknown TTS_PROVIDER: ${provider}`);

  const outputPath = await synthesize();
  const mida = (fs.statSync(outputPath).size / 1024).toFixed(1);
  console.log(`   ✅ ${path.basename(outputPath)} (${mida} KB) [${provider}]`);
  return outputPath;
}