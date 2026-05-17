export type IngestResult = {
  ok: boolean;
  status: number;
  bytes: number;
};

export async function postFrame(
  apiUrl: string,
  cameraId: string,
  jpegBase64: string,
): Promise<IngestResult> {
  const url = `${apiUrl.replace(/\/$/, "")}/ingest?cameraId=${encodeURIComponent(cameraId)}`;
  const bytes = Math.floor((jpegBase64.length * 3) / 4);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "image/jpeg",
      "content-transfer-encoding": "base64",
    },
    body: jpegBase64,
  });

  return { ok: res.ok, status: res.status, bytes };
}
