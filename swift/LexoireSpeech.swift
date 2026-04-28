import Foundation
import Speech
import AVFoundation

// Flush stdout immediately on every write
setbuf(stdout, nil)

let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))!
let audioEngine = AVAudioEngine()
let request = SFSpeechAudioBufferRecognitionRequest()
request.shouldReportPartialResults = true
request.requiresOnDeviceRecognition = true

var task: SFSpeechRecognitionTask?

func startRecognition() {
    let node = audioEngine.inputNode
    let fmt = node.outputFormat(forBus: 0)
    node.installTap(onBus: 0, bufferSize: 1024, format: fmt) { buf, _ in
        request.append(buf)
    }
    do {
        try audioEngine.start()
        print("LEXOIRE_READY")
    } catch {
        print("LEXOIRE_ERROR:audio:\(error.localizedDescription)")
        exit(1)
    }
    task = recognizer.recognitionTask(with: request) { result, error in
        if let r = result {
            let txt = r.bestTranscription.formattedString
            if r.isFinal {
                print("LEXOIRE_FINAL:\(txt)")
            } else {
                print("LEXOIRE_INTERIM:\(txt)")
            }
        }
        if let e = error {
            print("LEXOIRE_ERROR:recognition:\(e.localizedDescription)")
        }
    }
}

SFSpeechRecognizer.requestAuthorization { status in
    switch status {
    case .authorized:
        startRecognition()
    case .denied:
        print("LEXOIRE_ERROR:denied:Go to System Settings > Privacy > Speech Recognition and enable for this app")
        exit(1)
    case .restricted:
        print("LEXOIRE_ERROR:restricted:Speech recognition restricted on this device")
        exit(1)
    case .notDetermined:
        print("LEXOIRE_ERROR:notDetermined:Authorization not determined")
        exit(1)
    @unknown default:
        print("LEXOIRE_ERROR:unknown")
        exit(1)
    }
}

RunLoop.main.run()
