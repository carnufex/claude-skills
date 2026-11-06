# showcase

Show a pull request instead of its code.

- **pr-demo**: gathers the review key's evidence, before/after screenshots, a recorded browser run, the change as a
  mermaid flowchart and the tests into a `demo.json`, renders a 30–60 second video with `scripts/render-demo.mjs`
  (Chromium stepped frame by frame through `scripts/player.html`, encoded by ffmpeg as H.264 that Slack and GitHub play
  inline), and posts it with the PR link to Slack.

Needs ffmpeg on PATH; Playwright comes from the project or is installed once into `~/.cache/carnufex-showcase`.

## Install

```text
/plugin marketplace add carnufex/claude-skills
/plugin install showcase@carnufex
```

## Profile

Reads the *Demo* and *Notify* sections of `.claude/profiles/delivery.md` (template in the delivery plugin): caption
language, the command that records the changed flow, and the Slack channel to post in.
