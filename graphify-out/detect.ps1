@'
import json
from graphify.detect import detect
from pathlib import Path
result = detect(Path('.'))
Path('graphify-out/.graphify_detect.json').write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
'@ | Out-File -FilePath graphify-out\.graphify_step_2_detect_files_3.py -Encoding utf8
& (Get-Content graphify-out\.graphify_python) graphify-out\.graphify_step_2_detect_files_3.py
Remove-Item -ErrorAction SilentlyContinue graphify-out\.graphify_step_2_detect_files_3.py
