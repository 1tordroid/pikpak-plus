"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import copy from "copy-to-clipboard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  PlayCircle,
} from "lucide-react";
import { getApiUrl, getAuthHeaders } from "@/lib/api-utils";
import type {
  MediaFileResponse,
  MediaResponse,
  MediaStream,
  MediaVideoSummary,
} from "@/types";
import {
  detectPlatform,
  downloadVlcPlaylist,
  vlcAndroidIntent,
  vlcIosLink,
} from "./vlc-links";

interface VideoPlayerDialogProps {
  fileId: string | null;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const isHls = (url: string) => /\.m3u8(\?|$)/i.test(url);

const formatSize = (bytes: number) => {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(size >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
};

const fetchMedia = async (id: string): Promise<MediaResponse> => {
  const headers = getAuthHeaders();
  const res = await axios.get(`${getApiUrl()}/media/${id}`, {
    headers: headers.Authorization
      ? { Authorization: headers.Authorization }
      : {},
  });
  return res.data;
};

export function VideoPlayerDialog({
  fileId,
  title,
  open,
  onOpenChange,
}: Readonly<VideoPlayerDialogProps>) {
  const [folder, setFolder] = useState<MediaResponse | null>(null);
  const [file, setFile] = useState<MediaFileResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFile = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMedia(id);
      if (data.type === "folder") {
        setFolder(data);
        // A torrent with a single video goes straight to the player
        if (data.videos.length === 1) {
          const single = await fetchMedia(data.videos[0].id);
          if (single.type === "file") setFile(single);
        }
      } else {
        setFile(data);
      }
    } catch (err: any) {
      setError(
        err.response?.data?.error ||
          "Could not load this video. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && fileId) {
      setFolder(null);
      setFile(null);
      loadFile(fileId);
    }
  }, [open, fileId, loadFile]);

  const videos =
    folder?.type === "folder" ? folder.videos : ([] as MediaVideoSummary[]);
  const canGoBack = !!file && videos.length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[95vh] flex flex-col p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            {canGoBack && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => setFile(null)}
                title="Back to video list"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <span className="truncate">{file?.name || title}</span>
          </DialogTitle>
          <DialogDescription>
            {file
              ? "Plays in your browser. If it doesn't, open it in VLC below."
              : "Choose a video to watch"}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading video…
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!loading && !error && !file && folder?.type === "folder" && (
            <VideoList videos={videos} onSelect={loadFile} />
          )}

          {!loading && file && <PlayerView file={file} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VideoList({
  videos,
  onSelect,
}: Readonly<{
  videos: MediaVideoSummary[];
  onSelect: (id: string) => void;
}>) {
  if (videos.length === 0) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          No video files were found in this download.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <ul className="divide-y rounded-md border">
      {videos.map((video) => (
        <li key={video.id}>
          <button
            type="button"
            onClick={() => onSelect(video.id)}
            className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/60 transition-colors"
          >
            <PlayCircle className="h-6 w-6 text-primary shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{video.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {video.path}
                {video.path && video.size ? " · " : ""}
                {formatSize(video.size)}
              </p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function PlayerView({ file }: Readonly<{ file: MediaFileResponse }>) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [streamIndex, setStreamIndex] = useState(0);
  const [playbackError, setPlaybackError] = useState(false);
  const stream: MediaStream | undefined = file.streams[streamIndex];

  // VLC handles every codec, so give it the untouched original when we have it
  const vlcStream = useMemo(
    () => file.streams.find((s) => s.is_origin) || file.streams[0],
    [file.streams],
  );

  useEffect(() => {
    setStreamIndex(0);
  }, [file.id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    setPlaybackError(false);

    let destroyed = false;
    let hls: { destroy: () => void } | null = null;

    const nativeHls = video.canPlayType("application/vnd.apple.mpegurl");
    if (isHls(stream.url) && !nativeHls) {
      import("hls.js").then(({ default: Hls }) => {
        if (destroyed) return;
        if (!Hls.isSupported()) {
          setPlaybackError(true);
          return;
        }
        const instance = new Hls();
        instance.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) setPlaybackError(true);
        });
        instance.loadSource(stream.url);
        instance.attachMedia(video);
        hls = instance;
      });
    } else {
      video.src = stream.url;
    }

    return () => {
      destroyed = true;
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [stream]);

  if (!file.is_video || file.streams.length === 0) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          {file.is_video
            ? "PikPak hasn't made this video available for streaming yet. Try again in a few minutes."
            : "This file isn't a video."}
        </AlertDescription>
      </Alert>
    );
  }

  const tryNextStream = () =>
    setStreamIndex((i) => Math.min(i + 1, file.streams.length - 1));

  return (
    <div className="space-y-4">
      <div className="rounded-lg overflow-hidden bg-black aspect-video">
        <video
          ref={videoRef}
          controls
          playsInline
          preload="metadata"
          poster={file.thumbnail || undefined}
          className="w-full h-full"
          onError={() => setPlaybackError(true)}
        />
      </div>

      {file.streams.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Quality:</span>
          {file.streams.map((s, i) => (
            <Button
              key={s.url}
              size="sm"
              variant={i === streamIndex ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setStreamIndex(i)}
            >
              {s.label}
            </Button>
          ))}
        </div>
      )}

      {playbackError && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <p>
                Your browser can&apos;t play this{" "}
                {streamIndex < file.streams.length - 1
                  ? "quality. Try another one, or"
                  : "video (unsupported format or codec). Please"}{" "}
                open it in VLC below — it plays almost every format.
              </p>
              {streamIndex < file.streams.length - 1 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={tryNextStream}
                >
                  Try next quality
                </Button>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {vlcStream && <OpenInVlc stream={vlcStream} title={file.name} />}
    </div>
  );
}

function OpenInVlc({
  stream,
  title,
}: Readonly<{ stream: MediaStream; title: string }>) {
  const [copied, setCopied] = useState(false);
  const [platform, setPlatform] = useState<
    "android" | "ios" | "desktop" | null
  >(null);

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  const copyLink = () => {
    copy(stream.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border p-3 sm:p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg" aria-hidden>
          🎦
        </span>
        <div>
          <p className="text-sm font-semibold">Open in VLC</p>
          <p className="text-xs text-muted-foreground">
            Best for MKV, HEVC/x265, multiple audio tracks and subtitles.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {platform === "android" && (
          <Button size="sm" asChild>
            <a href={vlcAndroidIntent(stream.url, title)}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Play in VLC
            </a>
          </Button>
        )}
        {platform === "ios" && (
          <Button size="sm" asChild>
            <a href={vlcIosLink(stream.url)}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Play in VLC
            </a>
          </Button>
        )}
        <Button
          size="sm"
          variant={platform === "desktop" ? "default" : "outline"}
          onClick={() => downloadVlcPlaylist(stream.url, title)}
        >
          <Download className="h-4 w-4 mr-2" />
          VLC playlist (.m3u)
        </Button>
        <Button size="sm" variant="outline" onClick={copyLink}>
          {copied ? (
            <Check className="h-4 w-4 mr-2 text-green-500" />
          ) : (
            <Copy className="h-4 w-4 mr-2" />
          )}
          {copied ? "Copied!" : "Copy stream link"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {platform === "desktop"
          ? "Open the downloaded .m3u file with VLC, or paste the link in VLC → Media → Open Network Stream."
          : "Don't have VLC? Install “VLC for Android” or “VLC for Mobile” from your app store."}{" "}
        Links expire after a few hours — reopen this player for a fresh one.
      </p>
    </div>
  );
}
