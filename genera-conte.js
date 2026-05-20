import { GoogleGenerativeAI } from "@google/generative-ai";
import { EdgeTTS } from "@andresaya/edge-tts";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { obtenirAccessToken } from "./yoto-auth.js";
import { pujaAYoto } from "./yoto-upload.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Configuració ────────────────────────────────────────────────────────────

const NOM_NEN = "Conor";
const PERSONATGES = ["Clara", "Conor"];

const LLOCS = [
  "un bosc màgic ple de llums de colors",
  "una platja on les onades canten cançons",
  "un castell fet de núvols tous",
  "un jardí on les flors parlen",
  "una cova plena d'estrelles",
  "un riu de xocolata calenta",
  "un poble on tots els animals fan festa",
];

const SITUACIONS = [
  "han trobat un ou misteriós que brilla",
  "un petit drac necessita ajuda per tornar a casa",
  "han perdut una estrella del cel i l'han de trobar",
  "una fada els demana que la ajudin a recuperar la seva vareta",
  "troben un mapa d'un tresor especial",
  "un núvol trist necessita que li expliquin un acudit",
  "han de travessar un pont màgic per arribar a una festa",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function aleatori(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function nomFitxer(sufix) {
  const ara = new Date();
  const data = ara.toISOString().split("T")[0];
  return path.join(__dirname, "contes", `${data}-${sufix}`);
}

// ─── Generació del conte ──────────────────────────────────────────────────────

async function generaConte() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const lloc = aleatori(LLOCS);
  const situacio = aleatori(SITUACIONS);

  console.log(`\n🎲 Paràmetres d'avui:`);
  console.log(`   Lloc:     ${lloc}`);
  console.log(`   Situació: ${situacio}`);
  console.log(`\n✍️  Generant conte...\n`);

  // Conte en català
  const promptCA = `Escriu un conte curt en català per a en ${NOM_NEN}, que té 3 anys.
Els protagonistes són na ${PERSONATGES[0]} i en ${PERSONATGES[1]}.
El lloc és: ${lloc}. La situació és: ${situacio}.
Normes: NOMÉS el text del conte, sense títol ni explicacions. Frases molt curtes (màxim 10 paraules).
To càlid i divertit. Final feliç. ~250-300 paraules. Vocabulari per a 3 anys. Pots afegir onomatopeies.`;

  // Conte en anglès
  const promptEN = `Write a short story in English for ${NOM_NEN}, who is 3 years old.
The protagonists are ${PERSONATGES[0]} and ${PERSONATGES[1]}.
The setting is: ${lloc}. The situation is: ${situacio}.
Rules: ONLY the story text, no title or explanations. Very short sentences (max 10 words).
Warm and fun tone. Happy ending. ~250-300 words. Vocabulary for a 3-year-old. You can add sound effects.`;

  console.log("📖 Generant versió catalana...");
  const resCA = await model.generateContent(promptCA);
  const textCA = resCA.response.text();

  console.log("📖 Generant versió anglesa...\n");
  const resEN = await model.generateContent(promptEN);
  const textEN = resEN.response.text();

  console.log("── Català ──────────────────────");
  console.log(textCA);
  console.log("\n── English ─────────────────────");
  console.log(textEN);
  console.log("");

  const ara = new Date();
  const data = ara.toLocaleDateString("ca-ES");
  return {
    ca: { text: textCA, titol: `Clara i Conor — ${data}` },
    en: { text: textEN, titol: `Clara and Conor — ${data}` },
  };
}

// ─── Conversió a àudio ────────────────────────────────────────────────────────

async function textAAudio(text, veu, fitxerBase) {
  const dir = path.dirname(fitxerBase);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const tts = new EdgeTTS();
  await tts.synthesize(text, veu, { rate: "+20%" });
  await tts.toFile(fitxerBase);

  const fitxerFinal = `${fitxerBase}.mp3`;
  const mida = (fs.statSync(fitxerFinal).size / 1024).toFixed(1);
  console.log(`   ✅ ${fitxerFinal} (${mida} KB)`);
  return fitxerFinal;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const puja = !process.argv.includes("--no-upload");

  console.log("🌟 Generador de Contes per a Yoto");
  console.log("══════════════════════════════════");

  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ Falta GEMINI_API_KEY al fitxer .env");
    process.exit(1);
  }
  if (puja && !process.env.YOTO_CLIENT_ID) {
    console.error("❌ Falta YOTO_CLIENT_ID al fitxer .env");
    console.error("   (o afegeix --no-upload per saltar la pujada a Yoto)");
    process.exit(1);
  }

  try {
    const contes = await generaConte();

    console.log("🔊 Convertint a àudio...");
    const fitxerCA = await textAAudio(
      contes.ca.text,
      "ca-ES-JoanaNeural",
      nomFitxer("conte-ca")
    );
    const fitxerEN = await textAAudio(
      contes.en.text,
      "en-IE-ConnorNeural",
      nomFitxer("conte-en")
    );

    if (puja) {
      const accessToken = await obtenirAccessToken(process.env.YOTO_CLIENT_ID);

      console.log("\n📤 Pujant versió catalana...");
      await pujaAYoto({ fitxerMp3: fitxerCA, titol: contes.ca.titol, accessToken });

      console.log("📤 Pujant versió anglesa...");
      await pujaAYoto({ fitxerMp3: fitxerEN, titol: contes.en.titol, accessToken });

      console.log(`\n🎉 Tots dos contes pujats a Yoto!`);
      console.log(`   📗 ${contes.ca.titol}`);
      console.log(`   📘 ${contes.en.titol}`);
      console.log(`\n💡 Vincula cada playlist a una carta MYO des de l'app Yoto.\n`);
    } else {
      console.log(`\n🎉 Llest!`);
      console.log(`   📗 Català: ${fitxerCA}`);
      console.log(`   📘 Anglès: ${fitxerEN}\n`);
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

main();