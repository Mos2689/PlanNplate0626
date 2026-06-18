$env:GRAPHIFY_WHISPER_PROMPT = "Meal planning and recipe management application. Use proper punctuation and paragraph breaks."

@'
import json, os
from pathlib import Path
from graphify.transcribe import transcribe_all

detect = json.loads(Path('graphify-out/.graphify_detect.json').read_text(encoding="utf-8"))
video_files = detect.get('files', {}).get('video', [])
prompt = os.environ.get('GRAPHIFY_WHISPER_PROMPT', 'Use proper punctuation and paragraph breaks.')

try:
    transcript_paths = transcribe_all(video_files, initial_prompt=prompt)
except Exception as e:
    print(f"Error during transcription: {e}")
    transcript_paths = {}

Path('graphify-out/.graphify_transcripts.json').write_text(json.dumps(transcript_paths, ensure_ascii=False), encoding="utf-8")
print(f"Transcripts: {json.dumps(transcript_paths)}")
'@ | Out-File -FilePath graphify-out\.graphify_step_transcribe.py -Encoding utf8

& (Get-Content graphify-out\.graphify_python) graphify-out\.graphify_step_transcribe.py
Remove-Item -ErrorAction SilentlyContinue graphify-out\.graphify_step_transcribe.py
