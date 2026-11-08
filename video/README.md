# Video: Erasmus+ Kompas

Animated video with burned-in subtitles. The Croatian version has a recorded voice; the English version is silent.

| File | What it is |
|---|---|
| `script_hr.md` | The script; everything below is generated from it |
| `erasmus_kompas_hr.mp4` | The Croatian video with voice, 4K (3840×2160), 30 fps (not in git) |
| `erasmus_kompas_titlovi.mp4` | The silent video, made before the voice was recorded (not in git) |
| `Snimke za video prezentaciju/` | The recorded voice, one take per group of sections (not in git) |
| `align_voice.py` | Takes → `timing_hr.json` (when each subtitle is spoken) and `voice_hr.m4a`, the joined, lightly cleaned voice (not in git). Needs ffmpeg (`brew install ffmpeg`); the settings are in `CLEANUP` |
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
caffeinate -dimsu ./render_bin --voice       # Croatian video with voice; keeps the Mac awake, about 3 minutes
caffeinate -dimsu ./render_bin --en          # English video
./render_bin --stills 9,57,139               # or only check some moments, as PNG files in stills/ (add --en for English)
```

The English version has `script_en.md`, `index_en.html` and `erasmus_kompas_subtitles_en.mp4`. On-screen text for both languages sits side by side in `scenes/scenes.js`, as `t('Croatian', 'English')`.

## After a new recording

Put the takes in `Snimke za video prezentaciju/` and list them in `TAKES` in `align_voice.py`, each with the sections it holds. A take may be replaced on its own; the start and end of the speech in each take are found automatically. Then:

```
python3 align_voice.py                       # check what it prints: where each take starts and ends, and a speaking rate far from the others means a subtitle landed in the wrong place
python3 build.py
caffeinate -dimsu ./render_bin --voice
```

## Notes

- Croatian timing comes from the pauses in the recording. `align_voice.py` does not understand speech, so it cannot notice a word read differently from the script; check that by watching. `build.py` stops if the script changes after the recording.
- English timing is estimated from syllables (`RATE` in `build.py`, a brisk but normal narration). It is a guide for reading, not a measurement of a real voice.
- Animations are tied to phrases of the script. If a phrase they wait for disappears, `render_bin` stops with a page error; open `index.html` with the browser console to see which phrase.
- `CORRECTIONS` in `build.py` lists the slips fixed in the subtitles only.
