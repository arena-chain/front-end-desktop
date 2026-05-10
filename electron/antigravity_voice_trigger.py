import sys
import os

os.environ["PYTHONIOENCODING"] = "utf-8"
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import time
import io

import numpy as np
import sounddevice as sd
import soundfile as sf
import speech_recognition as sr

# -------------------------------------------------------------
# CONFIGURATION -- map voice phrases to app route names
# -------------------------------------------------------------

TRIGGERS = {
    # Navigation
    "go to dashboard":      "player-dashboard",
    "go to matchmaking":    "player-matchmaking",
    "go to training":       "training-dashboard",
    "duel":           "duel-dashboard",
    "go to my channel":     "player-channel",
    "go to market":         "player-market",
    "go to missions":       "player-missions",
    "go to events":         "player-events",
    "go to rewards":        "player-rewards",
    "go to profile":        "player-profile",
    "go to friends":        "player-friends",
    "go to league":         "player-league",
    "go to news":           "player-news",
    "stream":         "player-stream-dashboard",
    "go to chat":           "player-chat",
    "go to recent games":   "player-recent-games",
}

# Seconds to wait after a trigger before listening again
COOLDOWN_SECONDS = 2.0

# Audio settings
SAMPLE_RATE    = 16000
CHANNELS       = 1
CHUNK_SECONDS  = 4
SILENCE_THRESH = 0.01

# -------------------------------------------------------------
# AUDIO
# -------------------------------------------------------------

def record_chunk(duration_secs=CHUNK_SECONDS):
    audio = sd.rec(
        int(duration_secs * SAMPLE_RATE),
        samplerate=SAMPLE_RATE,
        channels=CHANNELS,
        dtype='float32',
        blocking=True,
    )
    return audio.flatten()


def is_silent(audio_np):
    rms = np.sqrt(np.mean(audio_np ** 2))
    return rms < SILENCE_THRESH


def audio_to_wav_bytes(audio_np):
    buf = io.BytesIO()
    sf.write(buf, audio_np, SAMPLE_RATE, format='WAV', subtype='PCM_16')
    buf.seek(0)
    return buf.read()

# -------------------------------------------------------------
# CORE: Main listen loop
# -------------------------------------------------------------

def listen_loop():
    recognizer = sr.Recognizer()
    cooldown_until = 0

    print("\n  Checking microphone ...")
    try:
        record_chunk(duration_secs=0.5)
        print(f"  [OK] Microphone OK ({sd.query_devices(kind='input')['name']})")
    except Exception as e:
        print(f"\n  [ERROR] Cannot access microphone: {e}")
        sys.exit(1)

    print(f"\n  Listening for {len(TRIGGERS)} command(s):")
    for phrase, route in TRIGGERS.items():
        print(f'    -> "{phrase}"  ->  {route}')
    print("\n  (Press Ctrl+C to stop)\n")
    print("-" * 56)

    while True:
        try:
            print("  [MIC] Recording ...", end="\r")
            audio_np = record_chunk(CHUNK_SECONDS)

            if is_silent(audio_np):
                continue

            wav_bytes  = audio_to_wav_bytes(audio_np)
            audio_data = sr.AudioData(wav_bytes, SAMPLE_RATE, 2)

            try:
                text = recognizer.recognize_google(audio_data, language="en-US")
                print(f'  Heard: "{text}"')

                for phrase, route in TRIGGERS.items():
                    if phrase.lower() in text.lower():
                        now = time.time()
                        if now >= cooldown_until:
                            print(f'\n  [OK] Trigger "{phrase}" -> navigating to {route}')
                            # Send navigation command to Electron via stdout
                            print(f"NAVIGATE:{route}", flush=True)
                            cooldown_until = now + COOLDOWN_SECONDS
                        else:
                            remaining = cooldown_until - now
                            print(f"  (cooldown -- {remaining:.1f}s remaining)")
                        break

            except sr.UnknownValueError:
                pass
            except sr.RequestError as e:
                print(f"  [!] Google STT error: {e} -- waiting 5s ...")
                time.sleep(5)

        except KeyboardInterrupt:
            print("\n\n  Antigravity stopped. Goodbye.\n")
            sys.exit(0)
        except Exception as e:
            print(f"  [!] Unexpected error: {e}")
            time.sleep(1)

# -------------------------------------------------------------
# STARTUP
# -------------------------------------------------------------

def startup():
    print("=" * 54)
    print("   ANTIGRAVITY -- Arena Chain Voice Trigger")
    print("=" * 54)
    print("\n  Routes loaded from electron/routes.js")

# -------------------------------------------------------------
# ENTRY POINT
# -------------------------------------------------------------

if __name__ == "__main__":
    startup()
    listen_loop()