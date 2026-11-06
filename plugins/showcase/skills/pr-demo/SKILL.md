---
name: pr-demo
description: Show a pull request instead of its code — render a 30–60 second video (title, what changed, the change as an animated flowchart, before/after screenshots, the recorded browser run, the review key's verdict, the tests) and post it with the PR link to Slack. Use after opening a PR when the repository's delivery profile has a Demo section, when asked for a demo, a video, a recording or a visual summary of a change, or to notify someone that a PR is ready.
---

# PR demo

A reviewer should understand a change in a minute without opening the diff: what changed, how it works now, proof that
it works (the review key, tests, a recording), and where to look. Repository facts — caption language, how to record the
changed flow, where to post — are in `.claude/profiles/delivery.md` (*Demo*, *Notify*).

## 1. Gather the material

Into `out/demo/<pr or issue>/` (git-ignored):

- **The review key's evidence**: `out/review-key/<n>/result.json` and the `key-reviewer` verdict (`review-key`).
- **Screenshots** for a user-visible change: the same view before (the base branch) and after, same size and data.
  Crop to the part that changed; a whole page at 1280 px makes the change too small to see.
- **A recording** of the changed flow (the profile's *Demo* command, or Playwright with
  `browser.newContext({ recordVideo: { dir, size: { width: 1280, height: 800 } }, viewport: { width: 1280, height: 800 } })`
  around the steps of the e2e check that covers it; the file appears when the context closes). Keep it under 20 s:
  start on the screen that matters, no logins on camera.
- **The flow** of the change as a mermaid `flowchart LR` (or `TD`): five to nine nodes, the user's or the request's path,
  with `:::changed` on what changed, `:::added` on what is new and `:::removed` on what is gone. Explain behaviour, not
  files.
- **Tests** that ran, with one number each (`476 tests`, `12 flows`).

## 2. Write `demo.json`

Next to the material (paths are relative to it). Text in the profile's caption language; short — a scene is read in its
seconds. Backticks and `**bold**` work.

```json
{
  "lang": "en",
  "brand": "**shop** · PR #352",
  "ref": "Closes #331",
  "kicker": "Bugfix",
  "title": "The checkout fits at 1280 px",
  "subtitle": "The pay button covered the basket, and the coupon field was 49 px wide.",
  "chips": [{ "text": "Review key: PASS", "ok": true }, "3 files"],
  "scenes": [
    { "type": "title", "seconds": 4 },
    { "type": "bullets", "items": ["…", "…", "…"], "seconds": 6 },
    { "type": "flow", "mermaid": "flowchart LR\n  A[Width] --> B{\"< 1440 px?\"}\n  B -- yes --> C[Icons]:::changed", "seconds": 7 },
    { "type": "compare", "before": "before.png", "after": "after.png", "seconds": 6 },
    { "type": "clip", "heading": "Recorded at 1280 px", "src": "run.webm", "caption": "e2e: checkout-fit", "speed": 1.5 },
    { "type": "key", "result": "../../review-key/331/result.json", "baseFails": true, "seconds": 7 },
    { "type": "checks", "items": [{ "name": "scripts/verify.sh", "detail": "476 tests" }], "seconds": 4 },
    { "type": "end", "title": "Ready for review", "lines": ["PR: **github.com/…/pull/352**", "3 am: …"], "seconds": 4 }
  ]
}
```

Scenes: `title`, `bullets` (`items`, at most four), `flow` (`mermaid`, `legend: false` to hide the legend), `compare`
(`before`, `after`, labels; `layout: "stack"` puts them above each other, for wide strips like a toolbar), `clip` (`src` .webm/.mp4, `from`/`to` seconds, `speed`, `maxSeconds` default 20, `crop`
`{x, y, w, h}` in the recording's pixels to zoom on the part that matters; its length comes from the file), `key`
(`result` = keycheck's result.json or an object; `verdict`, `baseFails`, `claim`, `rows` and `count`
`{value, total, label}` override — e.g. one check that runs eight cases reads better as 8/8), `checks` (`items` with `name`, `detail`, `ok`), `end` (`title`, `lines`). Every scene takes `heading`,
`kicker` and `seconds`. Leave out what the change does not have — a backend change has no `compare` or `clip`; a pure
refactor has a `key` scene with parity and little else. Keep the whole video under a minute.

## 3. Render

```bash
node <this skill's directory>/scripts/render-demo.mjs out/demo/<n>/demo.json [--webm]
```

It draws every scene in Chromium frame by frame (sharp text, no dropped frames) and encodes `demo.mp4` (H.264, plays inline
in Slack, GitHub and browsers), `demo.png` (a poster: the flow or key scene) and, with `--webm`, a VP9 `demo.webm`. It needs
ffmpeg and takes Playwright from the project, else installs it once into `~/.cache/carnufex-showcase`. About one second of
rendering per second of video.

**Watch it before sending**: take frames from each scene (`ffmpeg -ss <t> -i demo.mp4 -frames:v 1 f.png`) and look at
them. Text cut off, an empty diagram, a clip of a login screen: fix and render again.

## 4. Post

To the channel the profile's *Notify* names, **as the bot**, so the person gets a real notification (a message posted
through a Slack connector comes from the person themselves, and Slack does not notify anyone of their own messages).
**One thread per PR**: the demo starts the PR's thread; everything after it — CI, review rounds, merge, deploy, the live
check, a rollback — is a reply in that thread (`ship` posts those). The channel stays one line per PR, across all
repositories. Write the message to a file; it must stand on its own (Slack mrkdwn) and start with the repository:

```text
*<repo>* · PR #<n> · <title> — ready for review
<PR url>
• <what changed, line 1>
• <line 2>
Review key (<kind>): *PASS*, checked independently: <one line from the verdict>
3 am: <signal>
```

```bash
node <this skill's directory>/scripts/post-slack.mjs --channel <id> --pr <PR url> --file out/demo/<n>/demo.mp4 --title "<repo> PR #<n>: <title> (<seconds> s)" --comment-file out/demo/<n>/message.md
node <this skill's directory>/scripts/post-slack.mjs --channel <id> --pr <PR url> --text-file update.md [--broadcast]
```

`--pr` finds the PR's thread by its url in the channel (no state kept): found, the post goes into the thread; not found,
it starts it. `--text-file` posts a message without a file; `--broadcast` also shows a thread reply in the channel (use
it for the outcome: live, or rolled back). It prints the thread and permalink. The bot token comes from
`SLACK_BOT_TOKEN` or the slack-channel plugin's `~/.claude/channels/slack/.env`; the bot must be in the channel
(`not_in_channel`: `/invite @<bot>`). Without a bot, fall back to the Slack connector (`slack_get_file_upload_url` →
POST the bytes → `slack_complete_file_upload`), and say that no notification goes out.

Put the same three lines, the mermaid flowchart and the Slack link in the PR description (GitHub draws mermaid; it does
not play a video uploaded through the API).
