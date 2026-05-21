import { GoogleGenerativeAI } from "@google/generative-ai";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { textToSpeech } from "./tts.js";
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

// ─── Llengues ─────────────────────────────────────────────────────────────────
// Add or remove languages here. Each needs a prompt fn, voice env var, and label.

const LLENGUES = [
  {
    codi: "ca",
    label: "Català",
    veuEnv: "TTS_VOICE_CA",
    veuDefault: "ca-ES-JoanaNeural",
    prompt: (nom, personatges, lloc, situacio) =>
      `Escriu un conte curt en català per a en ${nom}, que té 3 anys.
Els protagonistes són na ${personatges[0]} i en ${personatges[1]}.
El lloc és: ${lloc}. La situació és: ${situacio}.
Normes: NOMÉS el text del conte, sense títol ni explicacions. Frases molt curtes (màxim 10 paraules).
To càlid i divertit. Final feliç. ~250-300 paraules. Vocabulari per a 3 anys. Pots afegir onomatopeies.`,
  },
  {
    codi: "en",
    label: "English",
    veuEnv: "TTS_VOICE_EN",
    veuDefault: "en-IE-ConnorNeural",
    prompt: (nom, personatges, lloc, situacio) =>
      `Write a short story in English for ${nom}, who is 3 years old.
The protagonists are ${personatges[0]} and ${personatges[1]}.
The setting is: ${lloc}. The situation is: ${situacio}.
Rules: ONLY the story text, no title or explanations. Very short sentences (max 10 words).
Warm and fun tone. Happy ending. ~250-300 words. Vocabulary for a 3-year-old. You can add sound effects.`,
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const aleatori = (arr) => arr[Math.floor(Math.random() * arr.length)];

const nomFitxer = (codi) => {
  const data = new Date().toISOString().split("T")[0];
  return path.join(__dirname, "contes", `${data}-conte-${codi}`);
};

// ─── Generació ────────────────────────────────────────────────────────────────

async function generaContes() {
  const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    .getGenerativeModel({ model: process.env.LLM_MODEL || "gemini-2.5-flash" });

  const lloc = aleatori(LLOCS);
  const situacio = aleatori(SITUACIONS);

  console.log(`\n🎲 Paràmetres d'avui:`);
  console.log(`   Lloc:     ${lloc}`);
  console.log(`   Situació: ${situacio}\n`);

  return Promise.all(
    LLENGUES.map(async (ll) => {
      console.log(`✍️  Generant conte en ${ll.label}...`);
      const res = await model.generateContent(
        ll.prompt(NOM_NEN, PERSONATGES, lloc, situacio)
      );
      const text = res.response.text();
      console.log(`── ${ll.label} ${"─".repeat(30 - ll.label.length)}`);
      console.log(text);
      return { ...ll, text };
    })
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const puja = !process.argv.includes("--no-upload");

  console.log("🌟 Generador de Contes per a Yoto");
  console.log("══════════════════════════════════");

  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ Falta GEMINI_API_KEY al fitxer .env"); process.exit(1);
  }
  if (puja && !process.env.YOTO_CLIENT_ID) {
    console.error("❌ Falta YOTO_CLIENT_ID al fitxer .env");
    console.error("   (o afegeix --no-upload per saltar la pujada a Yoto)");
    process.exit(1);
  }

  try {
    const contes = await generaContes();

    console.log("\n🔊 Convertint a àudio...");
    const fitxers = await Promise.all(
      contes.map(({ codi, veuEnv, veuDefault, text }) =>
        textToSpeech({
          text,
          voice: process.env[veuEnv] || veuDefault,
          outputBase: nomFitxer(codi),
        })
      )
    );

    if (puja) {
      const accessToken = await obtenirAccessToken(process.env.YOTO_CLIENT_ID);
      const titol = `Clara i Conor — ${new Date().toLocaleDateString("ca-ES")}`;
      await pujaAYoto({
        fitxers: fitxers.map((path, i) => ({ path, label: contes[i].label })),
        titol,
        accessToken,
      });
      console.log(`\n🎉 Playlist pujada a Yoto! — ${titol}`);
      contes.forEach((ll, i) => console.log(`   ${ll.label}: ${fitxers[i]}`));
      console.log(`\n💡 Vincula la playlist a una carta MYO des de l'app Yoto.\n`);
    } else {
      console.log(`\n🎉 Llest!`);
      contes.forEach((ll, i) => console.log(`   ${ll.label}: ${fitxers[i]}`));
      console.log("");
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

main();