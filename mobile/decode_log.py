import gzip
import zlib

log_path = r"C:\Users\pradi\.gemini\antigravity-ide\brain\c52a438c-310d-4501-b181-919887dd363b\android_build_log.txt"
out_path = r"C:\Users\pradi\.gemini\antigravity-ide\brain\c52a438c-310d-4501-b181-919887dd363b\android_build_log_clean.txt"

with open(log_path, 'rb') as f:
    content = f.read()

try:
    # Try gzip decompress
    decompressed = zlib.decompress(content, 16 + zlib.MAX_WBITS)
except Exception as e:
    try:
        decompressed = zlib.decompress(content)
    except Exception as e2:
        try:
            decompressed = gzip.decompress(content)
        except Exception as e3:
            print("Failed all decompression:", e, e2, e3)
            decompressed = content

with open(out_path, 'wb') as f:
    f.write(decompressed)

print("Decompressed successfully, wrote to:", out_path)
