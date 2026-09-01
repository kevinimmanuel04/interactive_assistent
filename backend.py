import os
import sys
import asyncio
import multiprocessing
from pathlib import Path
from dotenv import load_dotenv

# Load credentials from .env in root directory
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)

LIVEKIT_URL = os.getenv("LIVEKIT_URL", "wss://friday-uxj6n271.livekit.cloud")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY", "APISbWK3UYr9LwM")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "hFsOoMPE4NstqzauN4vGPxex2nywWrmnTEsi95rn2sO")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")

def run_fastapi_server():
    """FastAPI token server for LiveKit WebRTC client authentication."""
    try:
        from fastapi import FastAPI
        from fastapi.middleware.cors import CORSMiddleware
        import uvicorn
        from livekit import api
    except ImportError as e:
        print(f"[backend] Warning: FastAPI or LiveKit API not installed: {e}", file=sys.stderr)
        return

    app = FastAPI(title="Komorebi LiveKit Token Server")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/token")
    async def get_token(room_name: str = "komorebi_room", participant_name: str = "user"):
        token = (
            api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
            .with_identity(participant_name)
            .with_name(participant_name)
            .with_grants(
                api.VideoGrants(
                    room_join=True,
                    room=room_name,
                    can_publish=True,
                    can_subscribe=True,
                )
            )
        )
        return {"token": token.to_jwt(), "url": LIVEKIT_URL}

    @app.get("/health")
    async def health():
        return {"status": "ok", "livekit_url": LIVEKIT_URL}

    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")


def run_livekit_agent():
    """LiveKit Gemini Realtime Agent Worker."""
    try:
        from livekit.agents import WorkerOptions, cli
        from livekit.plugins import google
    except ImportError as e:
        print(f"[backend] Warning: LiveKit agent SDK or Google plugin not installed: {e}", file=sys.stderr)
        return

    async def entrypoint(ctx):
        print(f"[backend] LiveKit agent joined room: {ctx.room.name}")
        await ctx.connect()
        
        # Initialize Gemini Multimodal Live Realtime Session with natural, smooth female voice
        model = google.beta.realtime.RealtimeModel(
            instructions="You are Komorebi, an anime-styled desktop AI assistant. Be helpful, concise, friendly, warm, and natural in conversation.",
            voice="Aoede", # Natural, smooth ElevenLabs-style female voice
            temperature=0.7,
        )
        
        agent = google.beta.realtime.RealtimeAgent(model=model)
        agent.start(ctx.room)

    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))


if __name__ == "__main__":
    print("[backend] Starting Komorebi Gemini LiveKit Sidecar...")
    print(f"[backend] LIVEKIT_URL={LIVEKIT_URL}")
    
    p1 = multiprocessing.Process(target=run_fastapi_server, daemon=True)
    p1.start()
    
    # Run Agent Worker in main process or separate process
    try:
        run_livekit_agent()
    except KeyboardInterrupt:
        print("[backend] Shutting down sidecar...")
        p1.terminate()
