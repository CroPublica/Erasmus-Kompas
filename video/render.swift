// Renders index.html to an MP4 (or PNG stills) with macOS's own WebKit and AVFoundation; nothing to install.
//   swiftc -O render.swift -o render_bin -framework AppKit -framework WebKit -framework AVFoundation
//   ./render_bin                                  writes erasmus_kompas_titlovi.mp4 (Croatian)
//   ./render_bin --en                             writes erasmus_kompas_subtitles_en.mp4 (English)
//   ./render_bin --voice                          writes erasmus_kompas_hr.mp4 (Croatian with voice_hr.m4a; run align_voice.py and build.py first)
//   ./render_bin --stills 3.5,12,40               writes stills/t<seconds>.png
import AppKit
import AVFoundation
import WebKit

let english = CommandLine.arguments.contains("--en")
let voice = CommandLine.arguments.contains("--voice")

final class Renderer: NSObject, WKNavigationDelegate {
    let w = 1920, h = 1080, outW = 3840, outH = 2160, fps = 30   // the page is laid out at w x h and captured at outW x outH
    let stills: [Double]?
    var web: WKWebView!, win: NSWindow!
    var writer: AVAssetWriter!, input: AVAssetWriterInput!, adaptor: AVAssetWriterInputPixelBufferAdaptor!
    var frame = 0, total = 0
    let started = Date()
    let partial = URL(fileURLWithPath: english ? "render_in_progress_en.mp4" : "render_in_progress.mp4").absoluteURL   // the finished video only replaces the old one if the whole render succeeds
    let finished = URL(fileURLWithPath: voice ? "erasmus_kompas_hr.mp4" : english ? "erasmus_kompas_subtitles_en.mp4" : "erasmus_kompas_titlovi.mp4").absoluteURL

    init(stills: [Double]?) { self.stills = stills }

    func start() {
        web = WKWebView(frame: NSRect(x: 0, y: 0, width: w, height: h), configuration: WKWebViewConfiguration())
        win = NSWindow(contentRect: NSRect(x: -4000, y: -4000, width: w, height: h), styleMask: [.borderless], backing: .buffered, defer: false)
        win.contentView = web
        win.orderBack(nil)
        web.navigationDelegate = self
        let page = URL(fileURLWithPath: english ? "index_en.html" : "index.html").absoluteURL
        web.loadFileURL(page, allowingReadAccessTo: page.deletingLastPathComponent())
    }

    func webView(_ v: WKWebView, didFinish n: WKNavigation!) { waitReady() }

    func waitReady() {
        web.evaluateJavaScript("window.PAGE_ERROR ? 'E:' + window.PAGE_ERROR : window.READY === true ? window.prepareRender() : -1") { value, error in
            if let error { print("page error:", error); exit(1) }
            if let text = value as? String { print("page error:", text); exit(1) }
            guard let d = value as? Double, d > 0 else {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { self.waitReady() }
                return
            }
            self.total = Int((d * Double(self.fps)).rounded(.up))
            // Make the browser paint each large screenshot once, off the clock, so no frame catches it still blank.
            self.web.callAsyncJavaScript("await window.primeImages()", arguments: [:], in: nil, in: .page) { _ in
            if self.stills != nil { try? FileManager.default.createDirectory(atPath: "stills", withIntermediateDirectories: true); self.nextStill(0) } else { self.beginVideo() }
            }
        }
    }

    func snapshot(_ t: Double, attempt: Int = 1, _ done: @escaping (CGImage) -> Void) {
        web.evaluateJavaScript("seek(\(t)); 1") { _, error in
            if let error { print("seek error at \(t):", error); exit(1) }
            let cfg = WKSnapshotConfiguration()
            cfg.rect = NSRect(x: 0, y: 0, width: self.w, height: self.h)
            cfg.snapshotWidth = NSNumber(value: Double(self.outW) / (self.win.backingScaleFactor))
            self.web.takeSnapshot(with: cfg) { image, err in
                guard let image, let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
                    print("snapshot failed at \(t) s, attempt \(attempt):", err as Any); fflush(stdout)
                    if attempt >= 8 { exit(1) }
                    DispatchQueue.main.asyncAfter(deadline: .now() + Double(attempt)) { self.snapshot(t, attempt: attempt + 1, done) }
                    return
                }
                done(cg)
            }
        }
    }

    func nextStill(_ i: Int) {
        guard let list = stills, i < list.count else { exit(0) }
        snapshot(list[i]) { cg in
            let rep = NSBitmapImageRep(cgImage: cg)
            try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "stills/t\(list[i]).png"))
            self.nextStill(i + 1)
        }
    }

    func beginVideo() {
        let out = partial
        try? FileManager.default.removeItem(at: out)
        writer = try! AVAssetWriter(outputURL: out, fileType: .mp4)
        input = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: outW, AVVideoHeightKey: outH,
            AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 24_000_000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel],
        ])
        input.expectsMediaDataInRealTime = false
        adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: outW, kCVPixelBufferHeightKey as String: outH,
        ])
        writer.add(input)
        writer.startWriting()
        writer.startSession(atSourceTime: .zero)
        nextFrame()
    }

    // Copies the rendered picture and the voice into one file, without encoding either again.
    func addVoice() {
        let picture = AVURLAsset(url: partial), sound = AVURLAsset(url: URL(fileURLWithPath: "voice_hr.m4a").absoluteURL)
        let mix = AVMutableComposition()
        let length = picture.duration
        try! mix.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
            .insertTimeRange(CMTimeRange(start: .zero, duration: length), of: picture.tracks(withMediaType: .video)[0], at: .zero)
        try! mix.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
            .insertTimeRange(CMTimeRange(start: .zero, duration: CMTimeMinimum(length, sound.duration)), of: sound.tracks(withMediaType: .audio)[0], at: .zero)
        let out = URL(fileURLWithPath: "render_with_voice.mp4").absoluteURL
        try? FileManager.default.removeItem(at: out)
        let export = AVAssetExportSession(asset: mix, presetName: AVAssetExportPresetPassthrough)!
        export.outputURL = out
        export.outputFileType = .mp4
        export.exportAsynchronously {
            guard export.status == .completed else { print("adding the voice failed:", export.error as Any); exit(1) }
            _ = try! FileManager.default.replaceItemAt(self.finished, withItemAt: out)
            try? FileManager.default.removeItem(at: self.partial)
            print("written: \(self.finished.lastPathComponent)")
            exit(0)
        }
    }

    func nextFrame() {
        if frame >= total {
            input.markAsFinished()
            writer.finishWriting {
                print("done: \(self.total) frames in \(Int(Date().timeIntervalSince(self.started))) s, status \(self.writer.status.rawValue)")
                guard self.writer.status == .completed else { exit(1) }
                if voice { self.addVoice(); return }
                _ = try! FileManager.default.replaceItemAt(self.finished, withItemAt: self.partial)
                exit(0)
            }
            return
        }
        snapshot(Double(frame) / Double(fps)) { cg in
            autoreleasepool {
                var buffer: CVPixelBuffer?
                CVPixelBufferPoolCreatePixelBuffer(nil, self.adaptor.pixelBufferPool!, &buffer)
                let pb = buffer!
                CVPixelBufferLockBaseAddress(pb, [])
                let ctx = CGContext(data: CVPixelBufferGetBaseAddress(pb), width: self.outW, height: self.outH, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(pb),
                                    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
                ctx.draw(cg, in: CGRect(x: 0, y: 0, width: self.outW, height: self.outH))
                CVPixelBufferUnlockBaseAddress(pb, [])
                while !self.input.isReadyForMoreMediaData { RunLoop.current.run(until: Date().addingTimeInterval(0.005)) }
                self.adaptor.append(pb, withPresentationTime: CMTime(value: CMTimeValue(self.frame), timescale: CMTimeScale(self.fps)))
            }
            self.frame += 1
            if cg.width != self.outW && self.frame == 1 { print("captured at \(cg.width) px, expected \(self.outW)"); exit(1) }
            if self.frame % 300 == 0 { print("\(self.frame)/\(self.total)"); fflush(stdout) }
            self.nextFrame()
        }
    }
}

var stills: [Double]?
if let i = CommandLine.arguments.firstIndex(of: "--stills") { stills = CommandLine.arguments[i + 1].split(separator: ",").compactMap { Double($0) } }
let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let renderer = Renderer(stills: stills)
renderer.start()
app.run()
