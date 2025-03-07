import os
import sys
import zlib
import json

output = []

def process_file(path, filename):
    full_path = os.path.join(sys.argv[1], path)
    with open(full_path, "rb") as f:
        contents = f.read()
    metadata = {
        "path": path.replace("\\","/"),
        "size": len(contents),
        "checksum": zlib.crc32(contents),
        "flags": {
                "icon": filename.startswith("icon"),
                "appfs": filename.endswith(".bin"),
                "skip": (len(contents) == 0),
        }
    }
    return metadata

def main():
    files = []
    for (dirpath, dirnames, filenames) in os.walk(sys.argv[1]):
        dirpath = dirpath[len(sys.argv[1])+1:]
        for filename in filenames:
            path = os.path.join(dirpath, filename)
            files.append(process_file(path, filename))
    print(json.dumps(files))
if __name__ == "__main__":
    main()
