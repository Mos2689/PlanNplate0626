@'
import json
from graphify.detect import detect_incremental
from pathlib import Path

result = detect_incremental(Path('.'))
new_total = result.get('new_total', 0)
Path('graphify-out/.graphify_incremental.json').write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
deleted = list(result.get('deleted_files', []))
if new_total == 0 and not deleted:
    print('No files changed since last run. Nothing to update.')
else:
    if deleted:
        print(f'{len(deleted)} deleted file(s) to prune.')
    if new_total > 0:
        print(f'{new_total} new/changed file(s) to re-extract.')
'@ | Out-File -FilePath graphify-out\.graphify_step_for_update_incremental_re_extracti_19.py -Encoding utf8

& (Get-Content graphify-out\.graphify_python) graphify-out\.graphify_step_for_update_incremental_re_extracti_19.py
Remove-Item -ErrorAction SilentlyContinue graphify-out\.graphify_step_for_update_incremental_re_extracti_19.py
