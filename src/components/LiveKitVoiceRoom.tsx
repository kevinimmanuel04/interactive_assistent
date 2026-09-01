import React, { useEffect, useRef, useState } from "react";
import {
  LiveKitRoom,
  useRoomContext,
  useTrackToggle,
  RoomAudioRenderer,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { RoomEvent, Track, RemoteTrackPublication, RemoteParticipant } from "livekit-client";
import { lipSync } from "../lipsync";

interface LiveKitTokenResponse {
  token: string;
  url: string;
}

function MicToggleButton() {
  const { toggle, enabled } = useTrackToggle({
    source: Track.Source.Microphone,
  });

  return (
    <button
      onClick={() => void toggle()}
      className="interactive"
      style={{
        background: enabled ? "rgba(239, 68, 68, 0.25)" : "rgba(255, 255, 255, 0.1)",
        border: enabled ? "1px solid rgba(239, 68, 68, 0.6)" : "1px solid rgba(255, 255, 255, 0.2)",
        color: enabled ? "#ef4444" : "#ffffff",
        padding: "8px 14px",
        borderRadius: "20px",
        fontSize: "13px",
        fontWeight: 600,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: "6px",
        backdropFilter: "blur(8px)",
        transition: "all 0.2s ease",
      }}
      title={enabled ? "Mute Microphone" : "Unmute Microphone"}
    >
      <span style={{ fontSize: "16px" }}>{enabled ? "🎙️" : "🎙️❌"}</span>
      <span>{enabled ? "Gemini Live" : "Mic Muted"}</span>
    </button>
  );
}

function LipSyncAudioHandler() {
  const room = useRoomContext();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!room) return;

    const handleTrackSubscribed = (
      track: Track,
      _publication: RemoteTrackPublication,
      _participant: RemoteParticipant
    ) => {
      if (track.kind === Track.Kind.Audio) {
        console.log("[LiveKit] Subscribed to remote Gemini audio track");

        // 1. Attach to hidden audio element for playback
        if (audioRef.current) {
          track.attach(audioRef.current);
        }

        // 2. Route MediaStream into Live2D lip-sync analyzer
        if (track.mediaStreamTrack) {
          const mediaStream = new MediaStream([track.mediaStreamTrack]);
          const cleanupLipSync = lipSync.connectAudioStream(mediaStream);
          return () => {
            cleanupLipSync();
            if (audioRef.current) {
              track.detach(audioRef.current);
            }
          };
        }
      }
    };

    room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);

    return () => {
      room.off(RoomEvent.TrackSubscribed, handleTrackSubscribed);
    };
  }, [room]);

  return <audio ref={audioRef} autoPlay style={{ display: "none" }} />;
}

export default function LiveKitVoiceRoom({
  children,
}: {
  children?: React.ReactNode;
}) {
  const [tokenData, setTokenData] = useState<LiveKitTokenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchToken() {
      try {
        const res = await fetch("http://localhost:8000/api/token");
        if (!res.ok) {
          throw new Error(`Token server returned ${res.status}`);
        }
        const data: LiveKitTokenResponse = await res.json();
        setTokenData(data);
      } catch (err: any) {
        console.warn("[LiveKit] Could not fetch token from sidecar:", err.message);
        setError("LiveKit sidecar not connected");
      }
    }

    void fetchToken();
  }, []);

  if (error || !tokenData) {
    // If backend sidecar is offline or connecting, render children cleanly
    return (
      <>
        {children}
      </>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={tokenData.url}
      token={tokenData.token}
      connect={true}
      audio={true}
      video={false}
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      <div
        style={{
          position: "absolute",
          top: "40px",
          right: "16px",
          zIndex: 1000,
        }}
      >
        <MicToggleButton />
      </div>
      <LipSyncAudioHandler />
      <RoomAudioRenderer />
      {children}
    </LiveKitRoom>
  );
}
