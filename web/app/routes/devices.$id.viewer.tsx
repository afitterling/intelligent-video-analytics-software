import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useRevalidator } from "@remix-run/react";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "~/lib/api.server.js";
import { requireSession } from "~/lib/session.server.js";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const s = await requireSession(request);
  try {
    const { url } = await api<{ url: string }>(`/devices/${params.id}/viewer-url`, {
      token: s.accessToken,
    });
    return { url, error: null };
  } catch (err) {
    return { url: null, error: err instanceof ApiError ? err.message : "viewer unavailable" };
  }
};

export default function Viewer() {
  const { url, error } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState("loading…");

  // KVS HLS sessions expire (default 300s). Refresh the URL well before that.
  useEffect(() => {
    if (!url) return;
    const id = setInterval(() => revalidator.revalidate(), 4 * 60 * 1000);
    return () => clearInterval(id);
  }, [url, revalidator]);

  // While the backend says "stream not available yet", poll until it is.
  useEffect(() => {
    if (!error) return;
    const id = setInterval(() => revalidator.revalidate(), 5000);
    return () => clearInterval(id);
  }, [error, revalidator]);

  useEffect(() => {
    if (!url || !videoRef.current) return;
    const video = videoRef.current;
    const onCanPlay = () => setStatus("playing");
    const onError = () => {
      const code = video.error?.code;
      setStatus(`playback error${code ? ` (${code})` : ""}`);
    };
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("error", onError);

    let hls: { destroy: () => void } | undefined;
    let cancelled = false;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.play().catch(() => setStatus("autoplay blocked — click play"));
    } else {
      import("hls.js").then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) {
          setStatus("HLS not supported");
          return;
        }
        const h = new Hls();
        h.loadSource(url);
        h.attachMedia(video);
        h.on(Hls.Events.MANIFEST_PARSED, () => {
          setStatus("playing");
          video.play().catch(() => setStatus("autoplay blocked — click play"));
        });
        h.on(Hls.Events.ERROR, (_evt, data) => {
          if (!data.fatal) return;
          setStatus(`stream error: ${data.details}`);
          if (data.details === "manifestLoadError" || data.details === "levelLoadError") {
            // URL likely expired or stream paused — pull a fresh URL.
            revalidator.revalidate();
          }
        });
        hls = h;
      });
    }
    return () => {
      cancelled = true;
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("error", onError);
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [url, revalidator]);

  if (error) {
    return (
      <div className="panel p-4">
        <h1 className="h2">Viewer</h1>
        <div className="alert alert-warning mb-0">
          {error}
          <div className="muted small mt-1">Retrying every 5s — leave this open while the device comes online.</div>
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="section-header">
        <div>
          <p className="eyebrow mb-2">Stream</p>
          <h1 className="h2 mb-0">Live view</h1>
        </div>
        <span className="status-badge">{status}</span>
      </div>
      <div className="viewer-frame">
        <video ref={videoRef} controls muted playsInline />
      </div>
    </div>
  );
}
