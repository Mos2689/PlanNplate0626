import urllib.request
import json
import subprocess

# Get URL from EAS
result = subprocess.run(['npx', 'eas', 'build:view', 'f6353991-4ca8-4382-8268-43cf867b05fe', '--json'], capture_output=True, text=True, shell=True)
data = json.loads(result.stdout)
url = data['logFiles'][0]

print("Downloading logs from:", url)
req = urllib.request.Request(url)
with urllib.request.urlopen(req) as response:
    content = response.read()

print("First 50 bytes of content:", content[:50])
