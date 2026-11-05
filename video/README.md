# Video: Erasmus+ Kompas

Silent animated video with burned-in Croatian subtitles. The voice is recorded later, reading along with the subtitles.

| File | What it is |
|---|---|
| `script_hr.md` | The script; everything below is generated from it |
| `erasmus_kompas_titlovi.mp4` | The rendered video, 1080p, 30 fps, no audio (not in git) |
| `index.html` | The same video as a page in a browser: play, pause and jump with the slider or the space bar |
| `subtitles_hr.srt`, `subtitles_hr.vtt` | The subtitles as separate files |
| `build.py` | Script → subtitles and `scenes/data.js`; reads the figures from the app's data and stops if a spoken figure no longer matches |
| `scenes/` | The animation (`scenes.js`), the look (`style.css`) and the generated data |
| `render.swift` | Page → MP4, with macOS's built-in WebKit and AVFoundation, so nothing has to be installed |

## Rebuild after changing the script

```
cd video
python3 build.py
swiftc -O render.swift -o render_bin -framework AppKit -framework WebKit -framework AVFoundation   # once
./render_bin                                 # about 5,000 frames
./render_bin --stills 9,57,139               # or only check some moments, as PNG files in stills/
```

## Notes

- Timing is estimated from syllables at about 130 words per minute (`RATE` in `build.py`). It is a guide for reading, not a measurement of a real voice.
- Animations are tied to phrases of the script. If a phrase they wait for disappears, `render_bin` stops with a page error; open `index.html` with the browser console to see which phrase.
- `CORRECTIONS` in `build.py` lists the slips fixed in the subtitles only.
