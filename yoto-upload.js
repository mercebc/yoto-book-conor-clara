import fs from "fs";

const YOTO_API = "https://api.yotoplay.com";

async function getUploadUrl(accessToken) {
  const res = await fetch(`${YOTO_API}/media/transcode/audio/uploadUrl`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Error getting upload URL: ${res.statusText}`);
  const { upload } = await res.json();
  return upload;
}

async function uploadFile(uploadUrl, filePath) {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    body: fs.readFileSync(filePath),
    headers: { "Content-Type": "audio/mpeg" },
  });
  if (!res.ok) throw new Error(`Error uploading file: ${res.statusText}`);
}

async function waitForTranscoding(uploadId, accessToken) {
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const res = await fetch(
      `${YOTO_API}/media/upload/${uploadId}/transcoded?loudnorm=false`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }
    );
    if (res.ok) {
      const { transcode } = await res.json();
      if (transcode?.transcodedSha256) {
        process.stdout.write(" ✅\n");
        return transcode;
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
  return waitForTranscoding(uploadId, accessToken);
}

function buildChapter(key, label, transcode) {
  const info = transcode.transcodedInfo;
  const track = {
    key: "01", title: label,
    trackUrl: `yoto:#${transcode.transcodedSha256}`,
    duration: info?.duration, fileSize: info?.fileSize,
    channels: info?.channels, format: info?.format,
    type: "audio", overlayLabel: "1",
    display: { icon16x16: "yoto:#aUm9i3ex3qqAMYBv-i-O-pYMKuMJGICtR3Vhf289u2Q" },
  };
  return {
    key, title: label, overlayLabel: key,
    tracks: [track],
    display: { icon16x16: "yoto:#aUm9i3ex3qqAMYBv-i-O-pYMKuMJGICtR3Vhf289u2Q" },
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────
// fitxers: [{ path, label }, ...]  — one entry per language/chapter

export async function pujaAYoto({ fitxers, titol, accessToken }) {
  console.log("📤 Uploading to Yoto...");

  const chapters = await Promise.all(
    fitxers.map(async ({ path, label }, i) => {
      console.log(`   Uploading ${label}...`);
      const transcode = await uploadAudio(path, accessToken);
      return buildChapter(String(i + 1).padStart(2, "0"), label, transcode);
    })
  );

  const totalDuration = chapters.reduce((s, ch) => s + (ch.tracks[0]?.duration || 0), 0);
  const totalSize = chapters.reduce((s, ch) => s + (ch.tracks[0]?.fileSize || 0), 0);

  const res = await fetch(`${YOTO_API}/content`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: titol,
      content: { chapters },
      metadata: {
        media: {
          duration: totalDuration,
          fileSize: totalSize,
          readableFileSize: Math.round((totalSize / 1024 / 1024) * 10) / 10,
        },
      },
    }),
  });

  if (!res.ok) throw new Error(`Error creating playlist: ${await res.text()}`);
  return res.json();
}