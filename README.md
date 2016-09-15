# Speech Capture
Speech detection/capture library used to detect and capture speech from an incoming audio stream of data.

Currently this library only supports the Apache Cordova plugin [cordova-plugin-audioinput](https://github.com/edimuj/cordova-plugin-audioinput) as audio input from the microphone.

## Installation

Downloads:
Include any of the following sources in your project:

- [speechcapture.js](https://raw.githubusercontent.com/edimuj/speechcapture/src/speechcapture.js)
- [speechcapture.min.js](https://raw.githubusercontent.com/edimuj/speechcapture/src/speechcapture.min.js)

## API

### start
Start the detection and capture.

```javascript
speechcapture.start(cfg, speechCapturedCB, errorCB, speechStatusCB);
```

#### speechCapturedCB (required)
Implement a callback for handling the captured speech.

```javascript
function speechCapturedCB( audioData ) {
  // Do something with the captured audio data.
}
```

#### errorCB (optional)
Implement a callback for handling errors.

```javascript
function errorCB( message ) {
  // Do something with the error message.
}
```

#### speechStatusCB (optional)
Implement a callback for handling status changes.

```javascript
function speechStatusCB( code ) {
  switch (code) {
        case speechcapture.STATUS.CAPTURE_STARTED:
            console.log("Capture Started!");
            break;
        case speechcapture.STATUS.CAPTURE_STOPPED:
            console.log("Capture Stopped!");
            break;
        case speechcapture.STATUS.SPEECH_STARTED:
            console.log("Speech Started!");
            break;
        case speechcapture.STATUS.ENCODING_ERROR:
            console.log("Encoding Error!");
            break;
        case speechcapture.STATUS.CAPTURE_ERROR:
            console.log("Capture Error!");
            break;
        case speechcapture.STATUS.SPEECH_ERROR:
            console.log("Speech Error!");
            break;
        case speechcapture.STATUS.SPEECH_MAX_LENGTH:
            console.log("Max Speech length!");
            break;
        case speechcapture.STATUS.SPEECH_MIN_LENGTH:
            console.log("Min Speech length!");
            break;
        case speechcapture.STATUS.SPEECH_STOPPED:
            console.log("Speech Stopped!");
            break;
        default:
            console.log("Unknown status occurred: code=" + code);
            break;
    }
}
```

#### Configuration

```javascript
cfg = {
  // The sample rate to use for capturing audio. No supported on all platforms.
  sampleRate: 22050, // Hz
  
  // Threshold for capturing speech.
  // The audio level must rise to at least the threshold for speech capturing to start.
  speechDetectionThreshold: 15  // dB
  
  // The minimum length of speech to capture.
  speechDetectionMinimum: 500 // mS
  
  // The maximum length of the captured speech.
  speechDetectionMaximum: 10000 // mS
  
  // The maximum allowed delay, before speech is considered to have ended.
  speechDetectionAllowedDelay: 400 // mS
  
  // The length of the audio chunks that are analyzed.
  // Shorter gives better results, while longer gives better performance.
  analysisChunkLength: 100 // mS
  
  // Removes long pauses from the captured output.
  compressPauses: false,
  
  // Specifies the type of result produce when speech is captured.
  // For convenience, use the speechcapture.AUDIO_RESULT_TYPE constants to set this parameter:
  // -WAV_BLOB - WAV encoded Audio blobs
  // -WEBAUDIO_AUDIOBUFFER - Web Audio API AudioBuffers
  // -RAW_DATA - Raw float audio data in arrays
  audioResultType: speechcapture.AUDIO_RESULT_TYPE.WAV_BLOB
  audioContext: null
  
  // Use window.alert and/or window.console to show errors
  debugAlerts: false, 
  debugConsole: false
}
```

##### audioResultType WEBAUDIO_AUDIOBUFFER
If the audioResultType is specified as speechcapture.AUDIO_RESULT_TYPE.WEBAUDIO_AUDIOBUFFER, an audioContext is required, which means that the browser must have Web Audio Support. You can either specify an audioContext of your own or let the speechcapture library create one for you. The created audioContext can then be aquired using `getAudioContext`.

### stop
Stops the capturing. If speech is ongoing when stopped, a last capture output will be created as long as it is within the configuration constraints specified, when the capturing was started.

```javascript
speechcapture.stop();
```

### isCapturing
Returns a boolean with the current capturing status.

```javascript
var isCapturing = speechcapture.isCapturing();
```

### isSpeakingRightNow
Returns a boolean with the current status of speech detection.

```javascript
var isSpeaking = speechcapture.isSpeakingRightNow();
```

### getCfg
Returns an object with the current configuration.

```javascript
var currentCfg = speechcapture.getCfg();
```

### getCurrentVolume
Returns the current volume in decibel.

```javascript
var currentVolumeInDB = speechcapture.getCurrentVolume();
```

### getMonitoringData
Returns an object with useful debugging/monitoring information.

```javascript
var debugData = speechcapture.getMonitoringData();
```

### getAudioContext
If 
```javascript
var audioCtx = speechcapture.getAudioContext();
```

## Contributing
This project is open-source, so contributions are welcome. Just ensure that your changes doesn't break backward compatibility!

1. Fork the project.
2. Create your feature branch (git checkout -b my-new-feature).
3. Commit your changes (git commit -am 'Add some feature').
4. Push to the branch (git push origin my-new-feature).
5. Create a new Pull Request.

## Todo list
[Enhancements](https://github.com/edimuj/speechcapture/labels/enhancement)

## License
MIT
