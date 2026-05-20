import fs from "fs";

const YOTO_API = "https://api.yotoplay.com";

// ─── Upload a single audio file ───────────────────────────────────────────────

async function getUploadUrl(accessToken) {
  const res = await fetch(`${YOTO_API}/media/transcode/audio/uploadUrl`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Error getting upload URL: ${res.statusText}`);
  const { upload } = await res.json();
  return upload; // { uploadUrl, uploadId }
}

async function uploadFile(uploadUrl, filePath) {
  const buffer = fs.readFileSync(filePath);
  const res = await fetch(uploadUrl, {
    method: "PUT",
    body: buffer,
    headers: { "Content-Type": "audio/mpeg" },
  });
  if (!res.ok) throw new Error(`Error uploading file: ${res.statusText}`);
}

async function waitForTranscoding(uploadId, accessToken) {
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
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
  throw new Error("Transcoding timed out");
}

async function uploadAudio(filePath, accessToken) {
  const { uploadUrl, uploadId } = await getUploadUrl(accessToken);
  await uploadFile(uploadUrl, filePath);
  process.stdout.write("   ⏳ Transcoding");
  return await waitForTranscoding(uploadId, accessToken);
}

// ─── Build a chapter from transcoded audio ────────────────────────────────────

function buildChapter(key, title, label, transcodedAudio) {
  const mediaInfo = transcodedAudio.transcodedInfo;
  return {
    key,
    title,
    overlayLabel: label,
    tracks: [
      {
        key: "01",
        title,
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
  };
}

// ─── Create playlist with both chapters ───────────────────────────────────────

async function createPlaylist(chapters, title, accessToken) {
  const totalDuration = chapters.reduce(
    (sum, ch) => sum + (ch.tracks[0]?.duration || 0), 0
  );
  const totalSize = chapters.reduce(
    (sum, ch) => sum + (ch.tracks[0]?.fileSize || 0), 0
  );

  const content = {
    title,
    content: { chapters },
    metadata: {
      media: {
        duration: totalDuration,
        fileSize: totalSize,
        readableFileSize: Math.round((totalSize / 1024 / 1024) * 10) / 10,
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
    throw new Error(`Error creating playlist: ${err}`);
  }

  return await res.json();
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function pujaAYoto({ fitxerCA, fitxerEN, titol, accessToken }) {
  console.log("📤 Uploading to Yoto...");

  console.log("   🇨🇦 Uploading Catalan audio...");
  const transcodedCA = await uploadAudio(fitxerCA, accessToken);

  console.log("   🇬🇧 Uploading English audio...");
  const transcodedEN = await uploadAudio(fitxerEN, accessToken);

  console.log("   📋 Creating playlist with both chapters...");
  const chapters = [
    buildChapter("01", `${titol} — Català`, "CA", transcodedCA),
    buildChapter("02", `${titol} — English`, "EN", transcodedEN),
  ];

  const result = await createPlaylist(chapters, titol, accessToken);
  return result;
}