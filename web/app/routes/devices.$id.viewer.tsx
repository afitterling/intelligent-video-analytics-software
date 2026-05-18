import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState("loading…");

  useEffect(() => {
    if (!url || !videoRef.current) return;
    const video = videoRef.current;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.addEventListener("canplay", () => setStatus("playing"));
      video.play().catch(() => setStatus("autoplay blocked — click play"));
      return;
    }

    let hls: { destroy: () => void } | undefined;
    import("hls.js").then(({ default: Hls }) => {
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
      hls = h;
    });
    return () => { hls?.destroy(); };
  }, [url]);

  if (error) {
    return (
      <div className="panel p-4">
        <h1 className="h2">Viewer</h1>
        <div className="alert alert-danger mb-0">{error}</div>
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
        <video ref={videoRef} controls muted />
      </div>
    </div>
  );
}
