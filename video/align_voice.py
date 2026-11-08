#!/usr/bin/env python3
"""Fit the Croatian subtitles to the recorded voice. Run from anywhere: python3 video/align_voice.py

Joins the takes in TAKES into one voice, finds the pauses in each take, matches them to the breaks in script_hr.md, and writes:
  timing_hr.json  when each subtitle is spoken, in video time; build.py uses it instead of its syllable estimate
  voice_hr.m4a    the voice for the video: the takes trimmed, joined, lightly cleaned with ffmpeg, and exactly as long as the video

Matching uses pauses only, nothing here understands speech. It cannot notice a word read differently from the script. The recordings themselves are not changed.
"""
import array
import json
import math
import re
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import build  # noqa: E402

FOLDER = HERE / "Snimke za video prezentaciju"
TAKES = [("1 Snimka - problem.m4a", ["problem"]),
         ("2 Snimka - sto je ka2 i ciljani korisnici.m4a", ["ka2", "korisnici"]),
         ("3 Snimka izvori i pregled.m4a", ["izvori", "pregled"]),
         ("4 Snimka karta i organizacije.m4a", ["karta", "organizacije"]),
         ("5 snimka  mreza pojmova i pitanja.m4a", ["mreza", "pitanja"]),
         ("6 Snimka tehnicka arhitektura-kor-vrijednost-daljnji-razvoj.m4a", ["arhitektura", "vrijednost", "razvoj"])]
RATE = 48000
LEAD, TAIL = build.LEAD, build.TAIL      # silence before the first word; end card after the last word
BETWEEN = 1.5                            # seconds from the last word of one take to the first word of the next; shortened if the video would run too long
BEFORE, AFTER = 0.3, 0.25                # kept around the words of each take: a breath before, the fading last sound after
FADE_IN, FADE_OUT = 0.04, 0.15           # so the cuts do not click
# Light on purpose. These takes are already nearly free of noise, so there is no noise reduction: rumble, up to 12 dB less noise in the pauses,
# sharp "s" sounds, the loudest phrases eased down a little. The thresholds suit a voice at REFERENCE, so each voice is first brought to that level.
CLEANUP = "highpass=f=80,agate=threshold=0.003:ratio=2:range=0.25:attack=20:release=250,deesser=i=0.15,acompressor=threshold=0.04:ratio=2:attack=20:release=200"
REFERENCE = -35.0                        # LUFS
LOUDNESS, PEAK = -16.0, -1.5             # the usual level for online video in LUFS; the highest allowed peak in dB
HOP = 0.01                               # seconds per level measurement
MIN_PAUSE, MERGE = 0.12, 0.08            # shortest pause; a sound shorter than this inside a pause does not split it
READ_MIN, READ_EXTRA = 1.1, 0.25         # a subtitle stays at least this long, and this much into the pause after it


def decode(path):
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "decoded.wav"
        subprocess.run(["afconvert", "-f", "WAVE", "-d", f"LEI16@{RATE}", "-c", "1", str(path), str(out)], check=True)
        with wave.open(str(out)) as w:
            return array.array("h", w.readframes(w.getnframes()))


def levels(samples):
    hop = int(RATE * HOP)
    return [20 * math.log10(max(math.sqrt(sum(x * x for x in samples[i:i + hop]) / hop), 1) / 32768) for i in range(0, len(samples) - hop, hop)]


def speech_limit(db):
    """Quieter than this is a pause: a third of the way up from the noise, but never more than 28 dB under the loud speech, so breaths stay pauses."""
    ordered = sorted(db)
    floor, peak = ordered[int(len(ordered) * .05)], ordered[int(len(ordered) * .98)]
    return max(floor + (peak - floor) * .3, peak - 28)


def speech_bounds(db, limit):
    """First and last moment of speech in a take, in seconds: where at least 10 of the next 15 measurements are above the limit."""
    loud = [d > limit for d in db]
    first = next(i for i in range(len(loud)) if sum(loud[i:i + 15]) >= 10)
    last = next(i for i in range(len(loud) - 1, -1, -1) if sum(loud[max(0, i - 14):i + 1]) >= 10)
    return first * HOP, (last + 1) * HOP


def find_pauses(db, limit, start, end):
    runs, i = [], 0
    while i < len(db):
        if db[i] <= limit:
            j = i
            while j < len(db) and db[j] <= limit:
                j += 1
            runs.append([i * HOP, j * HOP])
            i = j
        else:
            i += 1
    merged = []
    for r in runs:
        if merged and r[0] - merged[-1][1] < MERGE:
            merged[-1][1] = r[1]
        else:
            merged.append(r)
    return [(a, b) for a, b in merged if b - a >= MIN_PAUSE and a > start and b < end]


def break_kind(sections):
    """The break after each cue: 3 between sections, 2 end of sentence, 1 comma or colon, 0 none."""
    out = []
    for s in sections:
        for k, c in enumerate(s["cues"]):
            last = c["text"].rstrip("”")[-1]
            out.append(3 if k == len(s["cues"]) - 1 else 2 if last in ".?!" else 1 if last in ",:" else 0)
    return out[:-1]


def match(expected, kinds, pauses):
    """For each break, the index of its pause or None. Order is kept; long pauses want a break and strong breaks want a pause."""
    worth = {3: 3.0, 2: 1.6, 1: .9, 0: .35}
    miss = {3: 50.0, 2: 1.2, 1: .3, 0: 0.0}
    n, m = len(expected), len(pauses)
    best = [[math.inf] * (m + 1) for _ in range(n + 1)]
    back = [[None] * (m + 1) for _ in range(n + 1)]
    best[0][0] = 0.0
    for i in range(n + 1):
        for j in range(m + 1):
            here = best[i][j]
            if here == math.inf:
                continue
            if i < n and here + miss[kinds[i]] < best[i + 1][j]:
                best[i + 1][j], back[i + 1][j] = here + miss[kinds[i]], (i, j, None)
            if j < m:
                length = pauses[j][1] - pauses[j][0]
                if here + 2.0 * length < best[i][j + 1]:
                    best[i][j + 1], back[i][j + 1] = here + 2.0 * length, (i, j, None)
            if i < n and j < m:
                a, b = pauses[j]
                cost = here + abs(expected[i] - (a + b) / 2) * .6 - worth[kinds[i]] * min(b - a, 1.0)
                if cost < best[i + 1][j + 1]:
                    best[i + 1][j + 1], back[i + 1][j + 1] = cost, (i, j, j)
    out, i, j = [None] * n, n, m
    while i or j:
        pi, pj, got = back[i][j]
        if got is not None:
            out[pi] = got
        i, j = pi, pj
    return out


def cue_times(cues, pauses, chosen, speech_start, speech_end):
    """Start and end of every cue: matched breaks sit on their pause, the others are shared out by syllables."""
    syl = [sum(build.syllables(w) for w in c["text"].split(" ")) for c in cues]
    times, run = [None] * len(cues), 0
    while run < len(cues):
        stop = run
        while stop < len(cues) - 1 and chosen[stop] is None:
            stop += 1
        begin = speech_start if run == 0 else pauses[chosen[run - 1]][1]
        end = speech_end if stop == len(cues) - 1 else pauses[chosen[stop]][0]
        inner = [p for p in pauses if begin < p[0] and p[1] < end]
        spoken = end - begin - sum(b - a for a, b in inner)
        t = begin
        for i in range(run, stop + 1):
            left = spoken * syl[i] / sum(syl[run:stop + 1])
            start = t
            for a, b in inner:   # time passes in speech only, so an unused pause is stepped over
                if a >= t and a - t < left:
                    left -= a - t
                    t = b
            t += left
            times[i] = [start, t]
        run = stop + 1
    return times, syl


def even_out(cues, kinds, pauses, chosen, times, syl, take):
    """A comma or a break inside a sentence may sit on the wrong one of several short pauses. If the subtitles on its two sides are spoken at very
    different speeds, try the other pauses between its neighbours and keep the one that makes the speeds most alike. Returns the new times and what moved."""
    def rates(i, ts):
        return [syl[k] / (ts[k][1] - ts[k][0]) for k in (i, i + 1)]
    moved = []
    for i, k in enumerate(kinds):
        if k > 1 or chosen[i] is None:
            continue
        a, b = rates(i, times)
        if max(a, b) / min(a, b) < 1.35:
            continue
        lo = max([chosen[j] for j in range(i) if chosen[j] is not None], default=-1)
        hi = min([chosen[j] for j in range(i + 1, len(chosen)) if chosen[j] is not None], default=len(pauses))
        best, best_ts, best_score = chosen[i], times, abs(math.log(a / b))
        for p in range(lo + 1, hi):
            trial = chosen[:i] + [p] + chosen[i + 1:]
            ts, _ = cue_times(cues, pauses, trial, take["first"], take["last"])
            score = abs(math.log(rates(i, ts)[0] / rates(i, ts)[1]))
            if score < best_score:
                best, best_ts, best_score = p, ts, score
        if best != chosen[i]:
            moved.append(f"{cues[i + 1]['text'][:30]}… from {pauses[chosen[i]][0] + take['shift']:.2f} to {pauses[best][0] + take['shift']:.2f}")
            chosen[i], times = best, best_ts
    return times, syl, moved


def loudness(path, chain):
    run = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", f"{chain}loudnorm=print_format=json", "-f", "null", "-"],
                         check=True, capture_output=True, text=True)
    return float(json.loads(re.findall(r"\{[^{}]*\}", run.stderr)[-1])["input_i"])


def clean(raw, out):
    """Bring the voice to REFERENCE, clean it, then raise it with one fixed gain, so the pauses stay down. A limiter catches the few peaks that gain would push too high."""
    first = REFERENCE - loudness(raw, "")
    chain = f"volume={first:.2f}dB,{CLEANUP}"
    gain = LOUDNESS - loudness(raw, chain + ",")
    limit = 10 ** ((PEAK - .5 - gain) / 20)   # half a dB spare, as peaks between samples can run higher than the samples
    subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-y", "-i", str(raw), "-af", f"{chain},alimiter=limit={limit:.5f}:level=0:attack=5:release=50,volume={gain:.2f}dB",
                    "-ar", str(RATE), "-c:a", "pcm_s16le", str(out)], check=True, capture_output=True)
    return first + gain


def main():
    sections = build.parse_script((HERE / "script_hr.md").read_text(encoding="utf-8"))
    if [i for _, ids in TAKES for i in ids] != [s["id"] for s in sections]:
        raise SystemExit("TAKES must name every section of script_hr.md once, in order.")
    cues, _ = build.make_cues(sections)

    takes = []
    for name, ids in TAKES:
        samples = decode(FOLDER / name)
        db = levels(samples)
        limit = speech_limit(db)
        first, last = speech_bounds(db, limit)
        takes.append({"name": name, "ids": ids, "samples": samples, "db": db, "limit": limit, "first": first, "last": last})
    speech = sum(t["last"] - t["first"] for t in takes)
    between = min(BETWEEN, (build.MAX_SECONDS - LEAD - TAIL - speech) / (len(takes) - 1))
    if between < BEFORE + AFTER:
        raise SystemExit(f"The takes hold {speech:.1f} s of speech, too long for {build.MAX_SECONDS} s of video.")

    # Where each take goes in the video, and the voice as one track.
    t = LEAD
    for take in takes:
        take["shift"] = t - take["first"]   # add to a time in the take to get the time in the video
        t += take["last"] - take["first"] + between
    duration = round(takes[-1]["last"] + takes[-1]["shift"] + TAIL, 3)
    voice = array.array("h", bytes(2 * int(duration * RATE)))
    for take in takes:
        start, stop = int(max(0, take["first"] - BEFORE) * RATE), min(len(take["samples"]), int((take["last"] + AFTER) * RATE))
        at, fin, fout = int((start / RATE + take["shift"]) * RATE), int(FADE_IN * RATE), int(FADE_OUT * RATE)
        for k, i in enumerate(range(start, stop)):
            voice[at + k] = int(take["samples"][i] * min(1, (k + 1) / fin, (stop - i) / fout))

    timing, report, matched, breaks = [], [], 0, 0
    for take in takes:
        own = [s for s in sections if s["id"] in take["ids"]]
        own_cues = [c for s in own for c in s["cues"]]
        kinds = break_kind(own)
        pauses = find_pauses(take["db"], take["limit"], take["first"], take["last"])
        lo, hi = own_cues[0]["start"], own_cues[-1]["end"]
        expected = [take["first"] + (own_cues[i]["end"] - lo) / (hi - lo) * (take["last"] - take["first"]) for i in range(len(kinds))]
        chosen = match(expected, kinds, pauses)
        if any(chosen[i] is None for i, k in enumerate(kinds) if k == 3):
            raise SystemExit(f"A break between sections has no pause in {take['name']}.")
        times, syl = cue_times(own_cues, pauses, chosen, take["first"], take["last"])
        times, syl, take["moved"] = even_out(own_cues, kinds, pauses, chosen, times, syl, take)
        matched +=sum(p is not None for p in chosen)
        breaks += len(kinds)
        for i, c in enumerate(own_cues):
            a, b = (x + take["shift"] for x in times[i])
            flag = "" if i == len(kinds) or chosen[i] is not None or kinds[i] == 0 else "  <- no pause"
            timing.append({"text": c["text"], "start": a, "spoken_end": b})
            report.append(f"{len(timing):3} {a:7.2f} {b:7.2f}  {syl[i] / (b - a):4.1f} syl/s  {c['text'][:62]}{flag}")
        used = {p for p in chosen if p is not None}
        take["unused"] = " ".join(f"{a + take['shift']:.2f}+{b - a:.2f}" for j, (a, b) in enumerate(pauses) if j not in used)

    for i, c in enumerate(timing):
        limit_end = timing[i + 1]["start"] - .05 if i + 1 < len(timing) else duration
        c["end"] = max(min(max(c["spoken_end"] + READ_EXTRA, c["start"] + READ_MIN), limit_end), c["spoken_end"])
    cues_out = [{"text": c["text"], "start": round(c["start"], 3), "end": round(c["end"], 3)} for c in timing]
    (HERE / "timing_hr.json").write_text(json.dumps({"duration": duration, "cues": cues_out}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    with tempfile.TemporaryDirectory() as tmp:
        raw, cleaned = Path(tmp) / "voice.wav", Path(tmp) / "cleaned.wav"
        with wave.open(str(raw), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(RATE)
            w.writeframes(voice.tobytes())
        gain = clean(raw, cleaned)
        subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "160000", str(cleaned), str(HERE / "voice_hr.m4a")], check=True)

    print(f"{len(takes)} takes, {speech:.1f} s of speech, {between:.2f} s between takes | video {duration:.1f} s | voice raised {gain:.1f} dB to {LOUDNESS} LUFS")
    print(f"{matched}/{breaks} breaks inside the takes on a pause")
    for take in takes:
        print(f"  {take['name'][:44]:44} words {take['first']:5.2f}-{take['last']:6.2f} of the take, in the video from {take['first'] + take['shift']:6.2f} | pause limit {take['limit']:.1f} dB"
              f" | unused pauses: {take['unused'] or '-'}")
        for m in take["moved"]:
            print(f"    moved to even out the speed: {m}")
    print("\n".join(report))


if __name__ == "__main__":
    main()
