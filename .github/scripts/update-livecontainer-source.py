"""Build the LiveContainer catalog from published Siftwake IPA releases."""

import hashlib
import json
import os
import plistlib
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile


SOURCE = Path("distribution/livecontainer.json")
IPA_NAME = "Siftwake-unsigned.ipa"
BUNDLE_ID = "com.jeemzy.siftwake"
IPA_FIELDS = ("version", "buildVersion", "buildNumber", "minOSVersion")


def ipa_metadata(repo, tag, digest):
    with TemporaryDirectory() as tmp:
        ipa = Path(tmp, IPA_NAME)
        subprocess.run(
            ["gh", "release", "download", tag, "--repo", repo, "--pattern", IPA_NAME,
             "--output", str(ipa)],
            check=True,
        )
        if digest:
            with ipa.open("rb") as stream:
                if hashlib.file_digest(stream, "sha256").hexdigest() != digest:
                    raise ValueError(f"{tag} IPA checksum differs from the GitHub release")
        with ZipFile(ipa) as archive:
            [info_path] = [
                name for name in archive.namelist()
                if name.startswith("Payload/") and name.count("/") == 2
                and name.endswith(".app/Info.plist")
            ]
            info = plistlib.loads(archive.read(info_path))

    if info["CFBundleIdentifier"] != BUNDLE_ID:
        raise ValueError(f"{tag} IPA has an unexpected bundle identifier")
    return {
        "version": info["CFBundleShortVersionString"],
        "buildVersion": info["CFBundleVersion"],
        "buildNumber": info["CFBundleVersion"],  # LiveContainer reads this spelling.
        "minOSVersion": info["MinimumOSVersion"],
    }


def main():
    repo = os.environ.get("GITHUB_REPOSITORY", "jeemzy/siftwake")
    pages = json.loads(subprocess.check_output(
        ["gh", "api", "--paginate", "--slurp", f"repos/{repo}/releases?per_page=100"],
        encoding="utf-8",
    ))
    releases = sorted(
        (release for page in pages for release in page
         if not release["draft"] and not release["prerelease"] and release["published_at"]),
        key=lambda release: (release["published_at"], release["id"]),
        reverse=True,
    )
    previous = json.loads(SOURCE.read_text(encoding="utf-8"))["apps"][0]["versions"] if SOURCE.exists() else []
    cached = {entry["downloadURL"]: entry for entry in previous}
    versions = []
    for release in releases:
        asset = next((a for a in release["assets"]
                      if a["name"] == IPA_NAME and a["state"] == "uploaded" and a["size"] > 0), None)
        if asset is None:
            continue
        url = asset["browser_download_url"]
        digest = (asset.get("digest") or "").removeprefix("sha256:") or None
        old = cached.get(url, {})
        tag = release["tag_name"]
        fields = (
            {key: old[key] for key in IPA_FIELDS}
            if digest and old.get("sha256") == digest and all(key in old for key in IPA_FIELDS)
            else ipa_metadata(repo, tag, digest)
        )
        notes = (release["body"] or "").strip()
        version = {
            **fields,
            "date": release["published_at"],
            "localizedDescription": f"GitHub release {tag}.\n\n{notes}".rstrip(),
            "downloadURL": url,
            "size": asset["size"],
        }
        if digest:
            version["sha256"] = digest
        versions.append(version)

    if not versions:
        raise SystemExit("No published Siftwake IPA releases found")
    source = {
        "name": "Siftwake",
        "identifier": f"{BUNDLE_ID}.source",
        "website": f"https://github.com/{repo}",
        "apps": [{
            "name": "Siftwake",
            "bundleIdentifier": BUNDLE_ID,
            "developerName": repo.split("/")[0],
            "subtitle": "Falling-sand sandbox",
            "localizedDescription": "Paint materials, build wind tunnels, and experiment with pressure and heat.",
            "versions": versions,
        }],
    }
    SOURCE.parent.mkdir(exist_ok=True)
    SOURCE.write_text(json.dumps(source, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    print(f"Listed {len(versions)} published IPA releases")


if __name__ == "__main__":
    main()
