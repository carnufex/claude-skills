#!/usr/bin/env python3
"""Consistency checks for the marketplace. Run from anywhere; exits 1 on any error.

    python tools/validate_skills.py                   # no version-bump check
    python tools/validate_skills.py --base origin/main

Checks: manifests parse and agree; every plugin folder is listed; skill and agent frontmatter; every
references/ templates/ scripts/ path a skill mentions exists; every skill a skill names exists; READMEs
mention every plugin and skill; a plugin changed since --base bumped its version; JSON and YAML parse.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover
    sys.exit("PyYAML is required: pip install pyyaml")

ROOT = Path(__file__).resolve().parent.parent
MODELS = {"haiku", "sonnet", "opus", "fable", "inherit"}
EFFORTS = {"low", "medium", "high", "xhigh", "max"}
MAX_DESCRIPTION = 1024
MAX_BODY_LINES = 500
PATH_REF = re.compile(r"`((?:\.\./[\w-]+/)?(?:references|templates|scripts)/[\w./-]+)`")
SKILL_REF = re.compile(r"`([a-z][a-z0-9-]+)` skill|\(use ([a-z][a-z0-9-]+)\)")

errors: list[str] = []


def err(where: Path | str, msg: str) -> None:
    rel = where.relative_to(ROOT).as_posix() if isinstance(where, Path) else where
    errors.append(f"{rel}: {msg}")


def frontmatter(path: Path) -> tuple[dict, str]:
    text = path.read_text(encoding="utf-8")
    m = re.match(r"^---\r?\n(.*?)\r?\n---\r?\n(.*)$", text, re.S)
    if not m:
        err(path, "missing YAML frontmatter")
        return {}, text
    try:
        meta = yaml.safe_load(m.group(1)) or {}
    except yaml.YAMLError as e:
        err(path, f"frontmatter is not valid YAML: {e}")
        return {}, m.group(2)
    return meta, m.group(2)


def load_json(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        err(path, f"invalid JSON: {e}")
        return None


def git(*args: str) -> str | None:
    r = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", help="git ref to compare plugin versions against")
    args = ap.parse_args()

    # Every JSON and YAML file parses.
    for p in ROOT.rglob("*"):
        if ".git" in p.parts or not p.is_file():
            continue
        if p.suffix == ".json":
            load_json(p)
        elif p.suffix in {".yml", ".yaml"}:
            try:
                list(yaml.safe_load_all(p.read_text(encoding="utf-8")))
            except yaml.YAMLError as e:
                err(p, f"invalid YAML: {e}")

    market_path = ROOT / ".claude-plugin" / "marketplace.json"
    market = load_json(market_path) or {}
    entries = {e.get("name"): e for e in market.get("plugins", [])}
    plugin_dirs = sorted(p for p in (ROOT / "plugins").iterdir() if p.is_dir())

    for d in plugin_dirs:
        if d.name not in entries:
            err(d, "plugin folder is not listed in .claude-plugin/marketplace.json")

    all_skills: dict[str, Path] = {}
    skill_bodies: list[tuple[Path, str, dict]] = []
    root_readme = (ROOT / "README.md").read_text(encoding="utf-8")

    for name, entry in entries.items():
        src = (ROOT / entry.get("source", "")).resolve()
        manifest_path = src / ".claude-plugin" / "plugin.json"
        if not manifest_path.is_file():
            err(market_path, f"plugin '{name}': {entry.get('source')} has no .claude-plugin/plugin.json")
            continue
        manifest = load_json(manifest_path) or {}
        if manifest.get("name") != name:
            err(manifest_path, f"name '{manifest.get('name')}' differs from the marketplace entry '{name}'")
        if manifest.get("version") != entry.get("version"):
            err(manifest_path, f"version {manifest.get('version')} differs from the marketplace entry {entry.get('version')}")
        if not entry.get("description"):
            err(market_path, f"plugin '{name}' has no description")
        if f"**{name}**" not in root_readme:
            err(ROOT / "README.md", f"does not mention plugin '{name}'")

        readme_path = src / "README.md"
        readme = readme_path.read_text(encoding="utf-8") if readme_path.is_file() else ""
        if not readme:
            err(src, "plugin has no README.md")

        for skill_md in sorted(src.glob("skills/*/SKILL.md")):
            folder = skill_md.parent.name
            meta, body = frontmatter(skill_md)
            if meta.get("name") != folder:
                err(skill_md, f"name '{meta.get('name')}' does not match folder '{folder}'")
            desc = meta.get("description") or ""
            if not desc:
                err(skill_md, "description is empty")
            elif len(desc) > MAX_DESCRIPTION:
                err(skill_md, f"description is {len(desc)} characters (max {MAX_DESCRIPTION})")
            if "effort" in meta and meta["effort"] not in EFFORTS:
                err(skill_md, f"unknown effort '{meta['effort']}'")
            if "model" in meta:
                err(skill_md, "skills must not set a model (it silently overrides the caller's)")
            if body.count("\n") > MAX_BODY_LINES:
                err(skill_md, f"body is over {MAX_BODY_LINES} lines")
            if folder in all_skills:
                err(skill_md, f"skill name '{folder}' is also used by {all_skills[folder].relative_to(ROOT).as_posix()}")
            all_skills[folder] = skill_md
            skill_bodies.append((skill_md, body, meta))
            for ref in PATH_REF.findall(body):
                if not (skill_md.parent / ref).exists():
                    err(skill_md, f"mentions {ref}, which does not exist")
            if f"`{folder}`" not in readme and f"**{folder}**" not in readme:
                err(readme_path, f"does not mention skill `{folder}`")
            if f"`{folder}`" not in root_readme:
                err(ROOT / "README.md", f"does not mention skill `{folder}`")

        for agent_md in sorted(src.glob("agents/*.md")):
            meta, _ = frontmatter(agent_md)
            if meta.get("name") != agent_md.stem:
                err(agent_md, f"name '{meta.get('name')}' does not match file name '{agent_md.stem}'")
            if meta.get("model") not in MODELS:
                err(agent_md, f"model '{meta.get('model')}' is not one of {sorted(MODELS)}")
            if "effort" in meta and meta["effort"] not in EFFORTS:
                err(agent_md, f"unknown effort '{meta['effort']}'")
            if f"`{agent_md.stem}`" not in readme and f"**{agent_md.stem}**" not in readme:
                err(readme_path, f"does not mention agent `{agent_md.stem}`")

        if args.base:
            rel = src.relative_to(ROOT).as_posix()
            changed = git("diff", "--name-only", args.base, "--", rel)
            old = git("show", f"{args.base}:{rel}/.claude-plugin/plugin.json")
            if changed is None or old is None:
                print(f"note: {name} is new or {args.base} is unknown; version-bump check skipped")
            elif changed.strip():
                try:
                    old_version = json.loads(old).get("version")
                except json.JSONDecodeError:
                    old_version = None
                if old_version == manifest.get("version"):
                    err(manifest_path, f"plugin changed since {args.base} but version is still {old_version}")

    for skill_md, body, meta in skill_bodies:
        for a, b in SKILL_REF.findall(body + "\n" + str(meta.get("description", ""))):
            named = a or b
            if named not in all_skills:
                err(skill_md, f"names skill '{named}', which does not exist in this marketplace")

    if errors:
        print(f"{len(errors)} problem(s):")
        for e in errors:
            print(f"  - {e}")
        return 1
    print(f"ok: {len(entries)} plugins, {len(all_skills)} skills")
    return 0


if __name__ == "__main__":
    sys.exit(main())
