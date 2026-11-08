# README media

Everything here is generated; change the source and generate again.

| File | Source | Generate |
|---|---|---|
| `delivery-loop.svg`, `guardrails.svg` | `build-svg.mjs` | `node docs/media/build-svg.mjs` |
| `pr-demo.gif` | `pr-demo/demo.json` (+ `before.png`, `after.png`) | see below |

The SVGs animate with CSS keyframes only (no scripts), so GitHub plays them inside an `<img>`; with reduced motion they
show their finished state. They use the same palette as the showcase player.

The GIF is a real render by the showcase plugin, converted for the README (GitHub does not play a video from the
repository inline):

```bash
node plugins/showcase/skills/pr-demo/scripts/render-demo.mjs docs/media/pr-demo/demo.json --out /tmp/demo/demo.mp4
ffmpeg -i /tmp/demo/demo.mp4 -vf "fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" -loop 0 docs/media/pr-demo.gif
```

Mermaid diagrams live in the READMEs themselves; GitHub draws them.
