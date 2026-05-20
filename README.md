# 🌟 Yoto Contes — Generador de Contes en Català

Genera un conte nou cada dia per a en Conor, protagonitzat per **na Clara** i **en Conor**,
narrat en català i pujat automàticament a Yoto.

## Flux complet

```
Gemini genera el conte → Edge TTS crea l'MP3 → Yoto API puja la playlist
```

## Instal·lació

```bash
npm install
cp .env.example .env
# Edita .env amb les teves claus
```

## Configuració (.env)

| Variable | On obtenir-la |
|---|---|
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey (gratuït) |
| `YOTO_CLIENT_ID` | https://developer.yotoplay.com → crea app "Public Client" |

## Ús

```bash
# Genera el conte I el puja a Yoto automàticament
npm run conte

# Genera el conte però NO el puja (només l'MP3 local)
npm run conte -- --no-upload
```

## Primera execució

La primera vegada que executis `npm run conte`, el programa et demanarà que
t'autentiquis amb el compte de Yoto. Segueix les instruccions a la terminal:

```
🔐 Autenticació amb Yoto...

👉 Ves a aquesta URL al teu mòbil o ordinador:
   https://login.yotoplay.com/activate?user_code=XXXX-XXXX

⏳ Esperant que completis l'autenticació...
✅ Autenticat correctament!
```

Els tokens es guarden a `.yoto-tokens.json` i es renoven automàticament.

## Automatitzar (cron)

Per generar un conte nou cada matí a les 7:00:

```bash
crontab -e
# Afegeix:
0 7 * * * cd /ruta/al/projecte && npm run conte
```

## Vincular a la carta MYO

Després de la primera pujada:
1. Obre l'app Yoto → **My Library** → **Make Your Own**
2. Troba la playlist creada
3. Prem els tres punts → **Link To A Card**
4. Insereix la carta MYO al player

A partir d'aquí, cada dia el conte s'actualitza automàticament 🎉
