import fs from "fs";

const YOTO_API = "https://api.yotoplay.com";

// ─── Pas 1: Demanar URL de pujada ─────────────────────────────────────────────

async function demanaUrlPujada(accessToken) {
  const res = await fetch(`${YOTO_API}/media/transcode/audio/uploadUrl`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Error demanant URL: ${res.statusText}`);
  const { upload } = await res.json();
  return upload; // { uploadUrl, uploadId }
}

// ─── Pas 2: Pujar el fitxer MP3 ───────────────────────────────────────────────

async function pujaFitxer(uploadUrl, fitxerMp3) {
  const buffer = fs.readFileSync(fitxerMp3);
  const res = await fetch(uploadUrl, {
    method: "PUT",
    body: buffer,
    headers: { "Content-Type": "audio/mpeg" },
  });
  if (!res.ok) throw new Error(`Error pujant fitxer: ${res.statusText}`);
}

// ─── Pas 3: Esperar transcoding ───────────────────────────────────────────────

async function esperaTranscoding(uploadId, accessToken) {
  const maxIntents = 30;
  for (let i = 0; i < maxIntents; i++) {
    await new Promise((r) => setTimeout(r, 1000));

    const res = await fetch(
      `${YOTO_API}/media/upload/${uploadId}/transcoded?loudnorm=false`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      }
    );

    if (res.ok) {
      const data = await res.json();
      if (data.transcode?.transcodedSha256) {
        process.stdout.write(" ✅\n");
        return data.transcode;
      }
    }
    process.stdout.write(".");
  }
  throw new Error("Transcoding ha trigat massa");
}

// ─── Pas 4: Crear la playlist a Yoto ─────────────────────────────────────────

async function creaPlaylist(transcodedAudio, titol, accessToken) {
  const mediaInfo = transcodedAudio.transcodedInfo;

  const content = {
    title: titol,
    content: {
      chapters: [
        {
          key: "01",
          title: titol,
          overlayLabel: "1",
          tracks: [
            {
              key: "01",
              title: titol,
              trackUrl: `yoto:#${transcodedAudio.transcodedSha256}`,
              duration: mediaInfo?.duration,
              fileSize: mediaInfo?.fileSize,
              channels: mediaInfo?.channels,
              format: mediaInfo?.format,
              type: "audio",
              overlayLabel: "1",
              display: {
                icon16x16: "yoto:#aUm9i3ex3qqAMYBv-i-O-pYMKuMJGICtR3Vhf289u2Q",
              },
            },
          ],
          display: {
            icon16x16: "yoto:#aUm9i3ex3qqAMYBv-i-O-pYMKuMJGICtR3Vhf289u2Q",
          },
        },
      ],
    },
    metadata: {
      media: {
        duration: mediaInfo?.duration,
        fileSize: mediaInfo?.fileSize,
        readableFileSize:
          Math.round((mediaInfo?.fileSize / 1024 / 1024) * 10) / 10,
      },
    },
  };

  const res = await fetch(`${YOTO_API}/content`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(content),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Error creant playlist: ${err}`);
  }

  return await res.json();
}

// ─── Funció principal d'upload ────────────────────────────────────────────────

export async function pujaAYoto({ fitxerMp3, titol, accessToken }) {
  console.log("📤 Pujant a Yoto...");

  // 1. URL de pujada
  console.log("   1/4 Demanant URL de pujada...");
  const { uploadUrl, uploadId } = await demanaUrlPujada(accessToken);

  // 2. Pujar MP3
  console.log("   2/4 Pujant MP3...");
  await pujaFitxer(uploadUrl, fitxerMp3);

  // 3. Transcoding
  process.stdout.write("   3/4 Esperant transcoding");
  const transcodedAudio = await esperaTranscoding(uploadId, accessToken);

  // 4. Crear playlist
  console.log("   4/4 Creant playlist a Yoto...");
  const result = await creaPlaylist(transcodedAudio, titol, accessToken);

  return result;
}
