#!/usr/bin/env python3
"""
Transcribe all 10 teacher interview recordings using Whisper.
Saves each transcript to teacher-refresher/interviews/transcripts/
"""

import whisper
import os
import json
import time

RECORDINGS = [
    {
        "teacher": "T01",
        "phone": "+919677899914",
        "date": "2026-04-29",
        "time": "20:07",
        "path": "/Users/jishan.kotangale/.workspace-mcp/attachments/Call recording +919677899914_260429_200756_cfb6c474.m4a"
    },
    {
        "teacher": "T02",
        "phone": "9891739164",
        "date": "2026-04-30",
        "time": "12:26",
        "path": "/Users/jishan.kotangale/.workspace-mcp/attachments/Call recording 9891739164_260430_122621_1d98ffea.m4a"
    },
    {
        "teacher": "T03",
        "phone": "9893027028",
        "date": "2026-04-30",
        "time": "12:56",
        "path": "/Users/jishan.kotangale/.workspace-mcp/attachments/Call recording 9893027028_260430_125615_17bffaf4.m4a"
    },
    {
        "teacher": "T04",
        "phone": "9971556923",
        "date": "2026-04-30",
        "time": "13:09",
        "path": "/Users/jishan.kotangale/.workspace-mcp/attachments/Call recording 9971556923_260430_130902_0123cf56.m4a"
    },
    {
        "teacher": "T05",
        "phone": "7073655185",
        "date": "2026-04-30",
        "time": "13:42",
        "path": "/Users/jishan.kotangale/.workspace-mcp/attachments/Call recording 7073655185_260430_134242_399cd58b.m4a"
    },
    {
        "teacher": "T06",
        "phone": "MEENU CHAUHAN",
        "date": "2026-04-30",
        "time": "15:13",
        "path": "/Users/jishan.kotangale/.workspace-mcp/attachments/Call recording MEENU CHAUHAN_260430_151313_b6032f18.m4a"
    },
    {
        "teacher": "T07",
        "phone": "9361643596",
        "date": "2026-04-30",
        "time": "15:42",
        "path": "/Users/jishan.kotangale/.workspace-mcp/attachments/Call recording 9361643596_260430_154232_084bae70.m4a"
    },
    {
        "teacher": "T08",
        "phone": "9602957730",
        "date": "2026-04-30",
        "time": "16:03",
        "path": "/Users/jishan.kotangale/.workspace-mcp/attachments/Call recording 9602957730_260430_160339_0048aec8.m4a"
    },
    {
        "teacher": "T09",
        "phone": "+919821371254",
        "date": "2026-04-30",
        "time": "16:52",
        "path": "/Users/jishan.kotangale/.workspace-mcp/attachments/Call recording +919821371254_260430_165230_aead0560.m4a"
    },
    {
        "teacher": "T10",
        "phone": "8568028000",
        "date": "2026-04-30",
        "time": "18:07",
        "path": "/Users/jishan.kotangale/.workspace-mcp/attachments/Call recording 8568028000_260430_180730_e4672512.m4a"
    },
]

TRANSCRIPTS_DIR = "/Users/jishan.kotangale/Documents/JAI/JAI/teacher-refresher/interviews/transcripts"
PROGRESS_FILE = "/Users/jishan.kotangale/Documents/JAI/JAI/teacher-refresher/interviews/transcription_progress.json"

os.makedirs(TRANSCRIPTS_DIR, exist_ok=True)

print("Loading Whisper small model...")
model = whisper.load_model("small")
print("Model loaded.\n")

progress = {}

for rec in RECORDINGS:
    teacher_id = rec["teacher"]
    out_path = os.path.join(TRANSCRIPTS_DIR, f"{teacher_id}.txt")

    if os.path.exists(out_path):
        print(f"[{teacher_id}] Already transcribed — skipping.")
        progress[teacher_id] = "done"
        continue

    print(f"[{teacher_id}] Transcribing {rec['phone']} ({rec['date']} {rec['time']})...")
    t0 = time.time()

    try:
        result = model.transcribe(rec["path"], language="en", verbose=False)
        transcript = result["text"].strip()
        elapsed = time.time() - t0

        with open(out_path, "w") as f:
            f.write(f"Teacher: {teacher_id}\n")
            f.write(f"Phone: {rec['phone']}\n")
            f.write(f"Date: {rec['date']} {rec['time']}\n")
            f.write(f"---\n\n")
            f.write(transcript)

        print(f"[{teacher_id}] Done in {elapsed:.1f}s → {out_path}")
        progress[teacher_id] = "done"

    except Exception as e:
        print(f"[{teacher_id}] ERROR: {e}")
        progress[teacher_id] = f"error: {e}"

    with open(PROGRESS_FILE, "w") as f:
        json.dump(progress, f, indent=2)

print("\nAll done.")
with open(PROGRESS_FILE, "w") as f:
    json.dump(progress, f, indent=2)
