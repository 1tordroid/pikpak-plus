"use client";

import { useState } from "react";
import { PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SupabaseTaskRecord } from "@/types";
import { VideoPlayerDialog } from "./video-player-dialog";

interface WatchSectionProps {
  task: SupabaseTaskRecord;
}

export function WatchSection({ task }: Readonly<WatchSectionProps>) {
  const [open, setOpen] = useState(false);
  const taskData = task.data.task?.task;
  const fileId = taskData?.file_id;

  // Only finished downloads have a file in PikPak to play
  if (!fileId || taskData?.phase === "PHASE_TYPE_ERROR") return null;

  return (
    <div className="border-t pt-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold">Watch</h4>
      </div>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2 w-full"
      >
        <PlayCircle className="h-4 w-4" />
        Play video
      </Button>
      <p className="text-xs text-muted-foreground mt-2">
        Streams in your browser, or opens in the VLC app on your phone or
        computer.
      </p>
      <VideoPlayerDialog
        fileId={fileId}
        title={taskData?.file_name || taskData?.name || "Video"}
        open={open}
        onOpenChange={setOpen}
      />
    </div>
  );
}
