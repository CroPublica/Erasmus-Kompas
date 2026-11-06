# Video: Erasmus+ Kompas

Silent animated video with burned-in Croatian subtitles. The voice is recorded later, reading along with the subtitles.

| File | What it is |
|---|---|
| `script_hr.md` | The script; everything below is generated from it |
| `erasmus_kompas_titlovi.mp4` | The rendered video, 4K (3840×2160), 30 fps, no audio (not in git) |
| `index.html` | The same video as a page in a browser: play, pause and jump with the slider or the space bar |
| `subtitles_hr.srt`, `subtitles_hr.vtt` | The subtitles as separate files |
| `build.py` | Script → subtitles and `scenes/data.js`; reads the figures from the app's data and stops if a spoken figure no longer matches |
| `scenes/` | The animation (`scenes.js`), the look (`style.css`) and the generated data |
| `render.swift` | Page → MP4, with macOS's built-in WebKit and AVFoundation, so nothing has to be installed |

## Rebuild after changing a script

```
cd video
python3 build.py                             # Croatian: script_hr.md -> subtitles_hr.*, scenes/data.js
python3 build.py en                          # English: script_en.md -> subtitles_en.*, scenes/data_en.js
swiftc -O render.swift -o render_bin -framework AppKit -framework WebKit -framework AVFoundation   # once
caffeinate -dimsu ./render_bin               # Croatian video; keeps the Mac awake, about 3 minutes
caffeinate -dimsu ./render_bin --en          # English video
./render_bin --stills 9,57,139               # or only check some moments, as PNG files in stills/ (add --en for English)
```

The English version has `script_en.md`, `index_en.html` and `erasmus_kompas_subtitles_en.mp4`. On-screen text for both languages sits side by side in `scenes/scenes.js`, as `t('Croatian', 'English')`.

## Notes

- Timing is estimated from syllables (`RATE` in `build.py`, a brisk but normal narration). It is a guide for reading, not a measurement of a real voice.
- Animations are tied to phrases of the script. If a phrase they wait for disappears, `render_bin` stops with a page error; open `index.html` with the browser console to see which phrase.
- `CORRECTIONS` in `build.py` lists the slips fixed in the subtitles only.
