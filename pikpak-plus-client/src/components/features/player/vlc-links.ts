// Hand-off helpers for the VLC media player apps (VideoLAN).
// VLC plays practically every codec/container, so it is the fallback whenever
// the browser cannot play a stream.

export type Platform = "android" | "ios" | "desktop";

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  // iPadOS reports itself as Mac; touch points tell it apart
  if (
    /iphone|ipad|ipod/i.test(ua) ||
    (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
  ) {
    return "ios";
  }
  return "desktop";
}

// Android: opens VLC for Android directly, or its Play Store page if missing
export function vlcAndroidIntent(url: string, title: string): string {
  const parsed = new URL(url);
  const scheme = parsed.protocol.replace(":", "");
  const rest = url.slice(parsed.protocol.length + 2);
  const store =
    "https://play.google.com/store/apps/details?id=org.videolan.vlc";
  return (
    `intent://${rest}#Intent;scheme=${scheme};package=org.videolan.vlc;` +
    `type=video/*;S.title=${encodeURIComponent(title)};` +
    `S.browser_fallback_url=${encodeURIComponent(store)};end`
  );
}

// iOS / iPadOS: VLC for Mobile x-callback-url stream action
export function vlcIosLink(url: string): string {
  return `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(url)}`;
}

// Desktop: VLC opens .m3u playlists by double-click on Windows, macOS, Linux
export function downloadVlcPlaylist(url: string, title: string) {
  const playlist = `#EXTM3U\n#EXTINF:-1,${title.replace(/[\r\n]/g, " ")}\n${url}\n`;
  const blob = new Blob([playlist], { type: "audio/x-mpegurl" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = `${title.replace(/[\\/:*?"<>|]/g, "_") || "video"}.m3u`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
