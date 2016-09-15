/**
 *
 * Copyright Edin Mujkanovic 2016
 *
 * Author: Edin Mujkanovic
 * Created: 2016-09-09
 *
 * Description:
 * Speech detection library used to detect and capture speech from an incoming audio stream of data.
 * Currently only supports cordova-plugin-audioinput as audio input, but I plan to also support MediaStreamSource in the future.
 *
 * License:
 * MIT
 *
 */

window.speechcapture = (function () {

    var AUDIO_RESULT_TYPE = {
            WAV_BLOB: 1,
            WEBAUDIO_AUDIOBUFFER: 2,
            RAW_DATA: 3
        },

        STATUS = {
            SPEECH_STARTED: 1,
            SPEECH_STOPPED: 2,
            SPEECH_ERROR: 3,
            CAPTURE_STARTED: 4,
            CAPTURE_STOPPED: 5,
            CAPTURE_ERROR: 6,
            ENCODING_ERROR: 7,
            SPEECH_MAX_LENGTH: 8,
            SPEECH_MIN_LENGTH: 9
        },

        ERROR_CODE = {
            NO_ERROR: 0,
            INVALID_PARAMETER: 1,
            MISSING_PARAMETER: 2,
            NO_WEB_AUDIO_SUPPORT: 3,
            CAPTURE_ALREADY_STARTED: 4,
            UNSPECIFIED: 999
        },

        DEFAULT = {
            SAMPLERATE: 22050, //44100,
            AUDIOSOURCE_TYPE: 7, //audioinput.AUDIOSOURCE_TYPE.VOICE_COMMUNICATION,
            CHANNELS: 1, //audioinput.CHANNELS.MONO,
            FORMAT: 'PCM_16BIT', //audioinput.FORMAT.PCM_16BIT,

            BUFFER_SIZE: 16384,// ,
            CONCATENATE_MAX_CHUNKS: 1,

            SPEECH_DETECTION_THRESHOLD: 15, // dB
            SPEECH_DETECTION_ALLOWED_DELAY: 400, // mS
            SPEECH_DETECTION_MAX_LENGTH: 500, // mS
            SPEECH_DETECTION_MIN_LENGTH: 10000, // mS
            SPEECH_DETECTION_COMPRESS_PAUSES: false,
            SPEECH_DETECTION_ANALYSIS_CHUNK_LENGTH: 100, // mS

            AUDIO_RESULT_TYPE: 1,

            DEBUG_ALERTS: false,
            DEBUG_CONSOLE: false
        };


    /**
     * Starts the audio capture and detection/capturing of speech.
     *
     * @param cfg - Configuration object
     * @param speechCapturedCB - Called when speech has been identified and captured
     * @param errorCB - Called when errors occurred
     * @param speechStatusCB - Notifies about speech start and stop events
     */
    var start = function (cfg, speechCapturedCB, errorCB, speechStatusCB) {

        if (!window.audioinput) {
            throw "error: Requires 'cordova-plugin-audioinput'";
        }

        if (!audioinput.isCapturing()) {

            if (!speechCapturedCB) {
                _lastErrorCode = ERROR_CODE.MISSING_PARAMETER;
                throw "error: Mandatory parameter 'speechCapturedCB' is missing.";
            }
            else if (!(typeof speechCapturedCB === "function")) {
                _lastErrorCode = ERROR_CODE.INVALID_PARAMETER;
                throw "error: Parameter 'speechCapturedCB' must be of type function.";
            }

            if (errorCB) {
                if (!(typeof errorCB === "function")) {
                    _lastErrorCode = ERROR_CODE.INVALID_PARAMETER;
                    throw "error: Parameter 'errorCB' must be of type function.";
                }
            }

            if (speechStatusCB) {
                if (!(typeof speechStatusCB === "function")) {
                    _lastErrorCode = ERROR_CODE.INVALID_PARAMETER;
                    throw "error: Parameter 'speechStatusCB' must be of type function.";
                }
            }

            if (!cfg) {
                cfg = {};
            }

            _cfg = {};

            // cordova-audioinput-plugin parameters
            //
            _cfg.sampleRate = cfg.sampleRate || DEFAULT.SAMPLERATE;
            _cfg.bufferSize = cfg.bufferSize || DEFAULT.BUFFER_SIZE;
            _cfg.audioSourceType = cfg.audioSourceType || DEFAULT.AUDIOSOURCE_TYPE;

            _cfg.concatenateMaxChunks = DEFAULT.CONCATENATE_MAX_CHUNKS;
            _cfg.channels = DEFAULT.CHANNELS;
            _cfg.format = DEFAULT.FORMAT;

            // Speech detection parameters
            //
            _cfg.speechCapturedCB = speechCapturedCB;
            _cfg.errorCB = errorCB || null;
            _cfg.speechStatusCB = speechStatusCB || null;
            _cfg.speechDetectionThreshold = cfg.speechDetectionThreshold || DEFAULT.SPEECH_DETECTION_THRESHOLD;
            _cfg.speechDetectionMinimum = cfg.speechDetectionMinimum || DEFAULT.SPEECH_DETECTION_MIN_LENGTH;
            _cfg.speechDetectionMaximum = cfg.speechDetectionMaximum || DEFAULT.SPEECH_DETECTION_MAX_LENGTH;
            _cfg.speechDetectionAllowedDelay = cfg.speechDetectionAllowedDelay || DEFAULT.SPEECH_DETECTION_ALLOWED_DELAY;
            _cfg.audioResultType = cfg.audioResultType || DEFAULT.AUDIO_RESULT_TYPE;
            _cfg.audioContext = cfg.audioContext || null;
            _cfg.compressPauses = cfg.compressPauses || DEFAULT.SPEECH_DETECTION_COMPRESS_PAUSES;
            _cfg.analysisChunkLength = cfg.analysisChunkLength || DEFAULT.SPEECH_DETECTION_ANALYSIS_CHUNK_LENGTH;

            _cfg.debugAlerts = cfg.debugAlerts || DEFAULT.DEBUG_ALERTS;
            _cfg.debugConsole = cfg.debugConsole || DEFAULT.DEBUG_CONSOLE;

            if (_cfg.audioResultType === AUDIO_RESULT_TYPE.WEBAUDIO_AUDIOBUFFER) {
                if (!_initWebAudio(_cfg.audioContext)) {
                    _lastErrorCode = ERROR_CODE.NO_WEB_AUDIO_SUPPORT;
                    throw "error: audioResultType is WEBAUDIO_AUDIOBUFFER, but Web Audio not supported on this platform!";
                }
            }

            _resetAll();

            // Subscribe to audioinput events
            //
            window.removeEventListener('audioinput', onAudioInputCapture, false);
            window.addEventListener('audioinput', onAudioInputCapture, false);

            window.removeEventListener('audioinputerror', onAudioInputError, false);
            window.addEventListener('audioinputerror', onAudioInputError, false);

            // Configuration for the cordova-audioinput-plugin
            //
            _captureCfg = {
                sampleRate: _cfg.sampleRate,
                bufferSize: _cfg.bufferSize,
                channels: _cfg.channels,
                format: _cfg.format,
                audioSourceType: _cfg.audioSourceType,
                streamToWebAudio: false
            };

            // Start the cordova-audioinput-plugin capture
            //
            audioinput.start(_captureCfg);

            _calculateTimePeriods(_cfg.sampleRate, _cfg.bufferSize);
            _getNextBuffer();

            _callSpeechStatusCB(STATUS.CAPTURE_STARTED);
        }
        else {
            _lastErrorCode = ERROR_CODE.CAPTURE_ALREADY_STARTED;
            _callSpeechStatusCB(STATUS.CAPTURE_ERROR);
        }
    };


    /**
     * Stops capturing.
     */
    var stop = function () {
        if (window.audioinput && audioinput.isCapturing()) {
            window.audioinput.stop();
        }

        if (_currentSpeechHistory.length > 0) {
            _handleAudioBufferCreation(_currentSpeechHistory);
        }

        _resetAll();
        _callSpeechStatusCB(STATUS.CAPTURE_STOPPED);
    };


    /**
     * Returns true if audio capture has been started.
     *
     * @returns {boolean}
     */
    var isCapturing = function () {
        if (window.audioinput) {
            return audioinput.isCapturing();
        }
        else {
            return false;
        }
    };


    /**
     * Returns true if speech start event has occurred and is still in effect.
     *
     * @returns {boolean}
     */
    var isSpeakingRightNow = function () {
        return _speakingRightNow;
    };


    /**
     * Returns the current configuration.
     *
     * @returns {*}
     */
    var getCfg = function () {
        return _cfg;
    };


    /**
     * Returns the current decibel level of the captured audio.
     *
     * @returns {number|*}
     */
    var getCurrentVolume = function () {
        if (_lastAudioLevel) {
            //decibel = Math.max(-75, Math.min(decibel, 0)); // Should be between -75 and zero
            return parseFloat(_lastAudioLevel).toFixed(0);
        }
        else {
            return -1;
        }
    };


    /**
     * Returns the current monitoring data.
     *
     * @returns {*}
     */
    var getMonitoringData = function () {

        var audioInputDataCapturing = false;
        if (window.audioinput) {
            audioInputDataCapturing = audioinput.isCapturing();
        }

        return {
            currentLevel: parseFloat(_lastAudioLevel).toFixed(0),
            ambientAverageLevel: parseFloat(_ambientAverageLevel).toFixed(0),
            currentThreshold: parseFloat(_currentThreshold).toFixed(0),
            currentSpeechChunks: _currentSpeechLength,
            currentSpeechBufferSize: _currentSpeechHistory.length,
            noSpeechLength: _noSpeechPeriod,
            constraints: {
                allowedDelayChunks: _speechAllowedDelayChunks,
                minimumLengthChunks: _speechMinimumLengthChunks,
                maximumLengthChunks: _speechMaximumLengthChunks
            },
            internals: {
                AnalysisBuffersPerIteration: _noOfAnalysisBuffersPerIteration,
                getNextBufferIterations: _getNextBufferIterations,
                audioInputFrequency: _audioInputFrequency,
                inputBufferLenInS: parseFloat(_bufferLengthInSeconds).toFixed(3),
                analysisBufferLengthInS: parseFloat(_analysisBufferLengthInS).toFixed(3),
                analysisBufferSize: _analysisBufferSize,
                noOfSpeechChunks: _noOfSpeechChunks
            },
            events: {
                noOfEventsStart: _noOfEventsStart,
                noOfEventsContinue: _noOfEventsContinue,
                noOfEventsStop: _noOfEventsStop,
                noOfEventsMin: _noOfEventsMin,
                noOfEventsMax: _noOfEventsMax
            },
            audioinput: {
                isCapturing: audioInputDataCapturing,
                audioInputEvents: _audioInputEvents,
                InputQueueLength: _audioDataQueue.length
            }
        }
    };


    /**
     *
     * @returns {*|null}
     */
    var getAudioContext = function () {
        return _audioContext;
    };


    /**
     * Called continuously while capture is running.
     */
    var onAudioInputCapture = function (evt) {
        try {
            _audioInputEvents++;

            if (evt && evt.data) {
                _audioDataQueue.push(evt.data);
            }
        }
        catch (ex) {
            _callErrorCB(ex);
        }
    };


    /**
     * Called when a plugin error happens.
     */
    var onAudioInputError = function (error) {
        _callErrorCB(error);
    };


    /**
     *
     * @returns {number}
     */
    var getLastErrorCode = function() {
        return _lastErrorCode;
    };


    /******************************************************************************************************************/
    /*                                                PRIVATE/INTERNAL                                                */
    /******************************************************************************************************************/


    var _getNextBufferDuration = 50,

        _analyzeIterations = 0,
        _silentIterations = 0,
        _noOfEventsContinue = 0,
        _noOfEventsStart = 0,
        _noOfEventsStop = 0,
        _noOfEventsMax = 0,
        _noOfEventsMin = 0,
        _noOfSpeechChunks = 0,

        _audioDataQueue = [],
        _currentSpeechHistory = [],
        _currentSpeechLength = 0,
        _lastAudioLevel = -100,
        _currentThreshold = 0,
        _noSpeechPeriod = 0,
        _ambientTotal = 0,
        _ambientAverageLevel = 0,

        _analysisBufferSize = 0,
        _noOfAnalysisBuffersPerIteration = 0,
        _audioInputFrequency = 0,
        _bufferLengthInSeconds = 0,

        _speechAllowedDelayChunks = 0,
        _speechMinimumLengthChunks = 0,
        _speechMaximumLengthChunks = 0,

        _getNextBufferIterations = 0,
        _audioInputEvents = 0,
        _analysisBufferLengthInS = 0,
        _speakingRightNow = false,

        _audioContext = null,
        _webAudioAPISupported = false,

        _lastErrorCode = ERROR_CODE.NO_ERROR,

        _cfg = {},
        _captureCfg = {};


    /**
     *
     * @param sampleRate
     * @param bufferSize
     * @private
     */
    var _calculateTimePeriods = function (sampleRate, bufferSize) {
        try {
            _audioInputFrequency = sampleRate / bufferSize;
            _bufferLengthInSeconds = 1 / _audioInputFrequency;

            _calculateAnalysisBuffers(bufferSize, _bufferLengthInSeconds, _cfg.analysisChunkLength);
        }
        catch (ex) {
            _callErrorCB("_calculateTimePeriods exception: " + ex);
        }
    };


    /**
     *
     * @param bufferSize
     * @param bufferLengthInSeconds
     * @param analysisChunkLength
     * @private
     */
    var _calculateAnalysisBuffers = function (bufferSize, bufferLengthInSeconds, analysisChunkLength) {
        try {
            var inputBufferSizeInMs = bufferLengthInSeconds * 1000;
            _noOfAnalysisBuffersPerIteration = Math.ceil(inputBufferSizeInMs / analysisChunkLength);
            _analysisBufferSize = Math.ceil(bufferSize / _noOfAnalysisBuffersPerIteration); // parseInt
            _analysisBufferLengthInS = bufferLengthInSeconds / _noOfAnalysisBuffersPerIteration;

            _speechAllowedDelayChunks = Math.round(_cfg.speechDetectionAllowedDelay / analysisChunkLength);
            _speechMinimumLengthChunks = Math.round(_cfg.speechDetectionMinimum / analysisChunkLength);
            _speechMaximumLengthChunks = Math.round(_cfg.speechDetectionMaximum / analysisChunkLength);
        }
        catch (ex) {
            _callErrorCB("_calculateAnalysisBuffers exception: " + ex);
        }
    };


    /**
     *
     * @param error
     * @private
     */
    var _callErrorCB = function (error) {
        var errorObj = {};

        if (error) {
            if (error.message) {
                errorObj.message = error.message;
            }
            else {
                errorObj.message = error;
            }
        }
        else {
            errorObj.message = "An unhandled error has occurred.";
        }

        if (_cfg.errorCB) {
            _cfg.errorCB(errorObj);
        }

        showConsoleError(message);
        showAlert(errorObj.message);
    };


    /**
     *
     * @param speechData
     * @private
     */
    var _callSpeechCapturedCB = function (speechData) {
        if (_cfg.speechCapturedCB) {
            _cfg.speechCapturedCB(speechData);
        }
        else {
            _callErrorCB("_callSpeechCapturedCB: No callback defined!");
        }
    };

    /**
     *
     * @param eventType
     * @private
     */
    var _callSpeechStatusCB = function (eventType) {
        if (_cfg.speechStatusCB) {
            _cfg.speechStatusCB(eventType);
        }
        else {
            _callErrorCB("_callSpeechStatusCB: No callback defined!");
        }
    };


    /**
     * Consume data from the audio queue and handles speech events
     * @private
     */
    var _getNextBuffer = function () {
        try {
            _getNextBufferIterations++;

            // Are we still capturing?
            if (window.audioinput && audioinput.isCapturing()) {

                var audioInputData = _consumeFromAudioInputQueue();

                if (audioInputData && audioInputData.length > 0) {
                    _iteratedAndMonitorInputBuffer(audioInputData);
                }

                // Repeat...
                setTimeout(_getNextBuffer, _getNextBufferDuration);
            }
            else {
                // Was speech previously started?
                if (_speakingRightNow) {
                    _stopSpeechEvent(_currentSpeechHistory);
                }
            }
        }
        catch (e) {
            _callErrorCB("_getNextBuffer exception: " + e);
            _callSpeechStatusCB(STATUS.SPEECH_ERROR);
            _resetAll();
        }
    };


    /**
     * Gets new audio data from the audio input queue.
     *
     * @private
     */
    var _consumeFromAudioInputQueue = function () {

        var audioInputData = [];

        if (_audioDataQueue.length > 0) {
            for (var i = 0; i < _cfg.concatenateMaxChunks; i++) {
                if (_audioDataQueue.length === 0) {
                    break;
                }
                audioInputData = audioInputData.concat(_audioDataQueue.shift());
            }
        }

        return audioInputData;
    };


    /**
     *
     * @param audioInputBuffer
     * @private
     */
    var _iteratedAndMonitorInputBuffer = function (audioInputBuffer) {
        try {
            //var bytesLeft = audioInputBuffer.length;

            for (var i = 0; i < _noOfAnalysisBuffersPerIteration; i++) {
                var startIdx = i * _analysisBufferSize,
                    endIdx = startIdx + _analysisBufferSize;
                    //intervalLen = endIdx - startIdx;

                //bytesLeft =- intervalLen;

                /*if(_analysisBufferSize >= bytesLeft) {
                    endIdx = audioInputBuffer.length;
                }*/

                if(endIdx > audioInputBuffer.length) {
                    endIdx = audioInputBuffer.length;
                }

                if (!_monitor(audioInputBuffer.slice(startIdx, endIdx))) {
                    return; // Ignore more speech
                }
            }
        }
        catch (e) {
            _callErrorCB("_iteratedAndMonitorInputBuffer exception: " + e);
            _callSpeechStatusCB(STATUS.SPEECH_ERROR);
        }
    };


    /**
     *
     * @param audioBuffer
     * @private
     */
    var _monitor = function (audioBuffer) {
        try {
            // First: Has maximum length threshold occurred or continue?
            if (_currentSpeechLength + 1 > _speechMaximumLengthChunks) {
                _maximumLengthSpeechEvent(_currentSpeechHistory);
                return false;
            }

            // Is somebody speaking?
            if (_identifySpeech(audioBuffer)) {

                // Speech Started or continued?
                if (!_speakingRightNow) {
                    _startSpeechEvent(audioBuffer);
                }
                else {
                    _continueSpeechEvent(audioBuffer, false);
                }
            }
            else {
                // No speech was identified this time, was speech previously started?
                if (_speakingRightNow) {
                    _noSpeechPeriod++;

                    // Was speech paused long enough to stop speech event?
                    if (_noSpeechPeriod > _speechAllowedDelayChunks) {
                        _stopSpeechEvent(_currentSpeechHistory);
                    }
                    else {
                        if (!_cfg.compressPauses) {
                            _continueSpeechEvent(audioBuffer, true);
                        }
                    }
                }

                // Handle silence
                _calculateAmbientAverageLevel();
            }

            return true;
        }
        catch (e) {
            _callErrorCB("_monitor exception: " + e);
            _callSpeechStatusCB(STATUS.SPEECH_ERROR);
            _resetAll();
            return false;
        }
    };


    /**
     *
     * @param audioBuffer
     * @returns {boolean}
     * @private
     */
    var _identifySpeech = function (audioBuffer) {
        try {
            if (audioBuffer && audioBuffer.length > 0) {
                _analyzeIterations++;

                _lastAudioLevel = _getAudioLevels(audioBuffer);

                if (_lastAudioLevel) {
                    if (_lastAudioLevel > _currentThreshold) {
                        _noOfSpeechChunks++;
                        return true;
                    }
                }
            }
        }
        catch (e) {
            _callErrorCB("_identifySpeech exception: " + e);
            _callSpeechStatusCB(STATUS.SPEECH_ERROR);
        }

        return false;
    };


    /**
     *
     * @private
     */
    var _calculateAmbientAverageLevel = function () {
        if (_lastAudioLevel) {
            _silentIterations++;
            _ambientTotal = _ambientTotal + _lastAudioLevel;
            _ambientAverageLevel = _ambientTotal / _silentIterations;
            _currentThreshold = _ambientAverageLevel + _cfg.speechDetectionThreshold;
        }
    };


    /**
     *
     * @param audioBuffer
     *
     * @private
     * @returns {*}
     */
    var _getAudioLevels = function (audioBuffer) {
        try {
            var total = 0,
                length = audioBuffer.length,
                decibel,
                rms,
                absFreq;

            for (var i = 0; i < length; i++) {
                absFreq = Math.abs(audioBuffer[i]);
                total += ( absFreq * absFreq );
            }

            rms = Math.sqrt(total / length);
            decibel = _getDecibelFromAmplitude(rms);

            return decibel;
        }
        catch (e) {
            _callErrorCB("_getAudioLevels exception: " + e);
            _callSpeechStatusCB(STATUS.SPEECH_ERROR);
        }

        return null;
    };


    /**
     * Convert amplitude to decibel
     *
     * @param amplitudeLevel
     * @returns {number}
     * @private
     */
    var _getDecibelFromAmplitude = function (amplitudeLevel) {
        return 20 * ( Math.log(amplitudeLevel) / Math.log(10) );
    };


    /**
     *
     * @private
     */
    var _resetAll = function () {
        _speakingRightNow = false;

        _resetAudioInputQueue();
        _resetSpeechDetection();
        _resetAmbientLevels();

        _noOfEventsContinue = 0;
        _noOfEventsStart = 0;
        _noOfEventsStop = 0;
        _noOfEventsMax = 0;
        _noOfEventsMin = 0;
        _noOfSpeechChunks = 0;

        _audioInputEvents = 0;
        _analyzeIterations = 0;
        _getNextBufferIterations = 0;
        _lastAudioLevel = -100;
        _currentThreshold = 0;
    };


    /**
     *
     * @private
     */
    var _resetAmbientLevels = function () {
        _ambientTotal = 0;
        _ambientAverageLevel = 0;
        _silentIterations = 0;
    };


    /**
     *
     * @private
     */
    var _resetAudioInputQueue = function () {
        _audioDataQueue = [];
    };


    /**
     *
     * @private
     */
    var _resetSpeechDetection = function () {
        _currentSpeechHistory = [];
        _currentSpeechLength = 0;
        _noSpeechPeriod = 0;
    };


    /**
     *
     * @private
     */
    var _stopSpeech = function () {
        _speakingRightNow = false;
        _callSpeechStatusCB(STATUS.SPEECH_STOPPED);
    };


    /**
     *
     * @private
     */
    var _startSpeech = function () {
        _speakingRightNow = true;
        _callSpeechStatusCB(STATUS.SPEECH_STARTED);
    };


    /**
     *
     * @param speechData
     * @private
     */
    var _startSpeechEvent = function (speechData) {
        _noOfEventsStart++;
        _startSpeech();
        _resetSpeechDetection();
        _continueSpeechEvent(speechData, false);
    };


    /**
     *
     * @param speechData
     * @param silent true if this continue event is considered silent
     * @private
     */
    var _continueSpeechEvent = function (speechData, silent) {
        _noOfEventsContinue++;
        _appendSpeechToHistory(speechData);
        if(!silent) {
            _noSpeechPeriod = 0;
        }
    };


    /**
     *
     * @param speechData
     * @private
     */
    var _maximumLengthSpeechEvent = function (speechData) {
        _noOfEventsMax++;
        _stopSpeechEvent(speechData);
        _callSpeechStatusCB(STATUS.SPEECH_MAX_LENGTH);
    };


    /**
     *
     * @param speechData
     * @private
     */
    var _stopSpeechEvent = function (speechData) {
        _noOfEventsStop++;
        _handleAudioBufferCreation(speechData);
        _stopSpeech();
        _resetSpeechDetection();
    };


    /**
     *
     * @param speechData
     * @private
     */
    var _appendSpeechToHistory = function (speechData) {
        _currentSpeechHistory = _currentSpeechHistory.concat(speechData);
        _currentSpeechLength++;
    };


    /**
     *
     * @param speechData
     * @private
     */
    var _handleAudioBufferCreation = function (speechData) {
        // Was the speech long enough to create an audio buffer?
        if (speechData && speechData.length > 0 && _currentSpeechLength > _speechMinimumLengthChunks) {
            var audioResult = null,
                preEncodingBuffer = speechData.slice(0);

            switch (_cfg.audioResultType) {
                case AUDIO_RESULT_TYPE.WEBAUDIO_AUDIOBUFFER:
                    audioResult = _createWebAudioBuffer(preEncodingBuffer);
                    break;
                case AUDIO_RESULT_TYPE.RAW_DATA:
                    audioResult = preEncodingBuffer;
                    break;
                default:
                case AUDIO_RESULT_TYPE.WAV_BLOB:
                    audioResult = _createWAVAudioBuffer(preEncodingBuffer);
                    break;
            }

            if (audioResult) {
                _callSpeechCapturedCB(audioResult);
            }
        }
        else {
            _noOfEventsMin++;
            _callSpeechStatusCB(STATUS.SPEECH_MIN_LENGTH);
        }
    };

    /**
     *
     * @param audioDataBuffer
     * @private
     */
    var _createWAVAudioBuffer = function (audioDataBuffer) {
        try {
            var encoder = new WavAudioEncoder(_captureCfg.sampleRate, _captureCfg.channels);
            encoder.encode([audioDataBuffer]);
            return encoder.finish("audio/wav");
        }
        catch (e) {
            _callErrorCB("_createWAVAudioBuffer exception: " + e);
            _callSpeechStatusCB(STATUS.ENCODING_ERROR);
            return null;
        }
    };


    /**
     *
     * @param rawAudioBuffer
     * @private
     */
    var _createWebAudioBuffer = function (rawAudioBuffer) {
        try {
            var audioBuffer = getAudioContext().createBuffer(_captureCfg.channels, (rawAudioBuffer.length / _captureCfg.channels),
                _captureCfg.sampleRate);

            if (_captureCfg.channels > 1) {
                for (var i = 0; i < _captureCfg.channels; i++) {
                    var chdata = [],
                        index = 0;

                    while (index < rawAudioBuffer.length) {
                        chdata.push(rawAudioBuffer[index + i]);
                        index += parseInt(_captureCfg.channels);
                    }

                    audioBuffer.getChannelData(i).set(new Float32Array(chdata));
                }
            }
            else {
                // For just one channels (mono)
                audioBuffer.getChannelData(0).set(rawAudioBuffer);
            }

            return audioBuffer;
        }
        catch (e) {
            _callErrorCB("_createWebAudioBuffer exception: " + e);
            _callSpeechStatusCB(STATUS.ENCODING_ERROR);
            return null;
        }
    };

    /**
     * Creates the Web Audio Context if needed
     * @private
     */
    var _initWebAudio = function (audioCtxFromCfg) {
        try {
            _webAudioAPISupported = false;

            if (audioCtxFromCfg) {
                _audioContext = audioCtxFromCfg;
            }
            else if (!_audioContext) {
                window.AudioContext = window.AudioContext || window.webkitAudioContext;
                _audioContext = new window.AudioContext();
                _webAudioAPISupported = true;
            }

            return true;
        }
        catch (e) {
            return false;
        }
    };


    /**
     *
     * @param message
     */
    var showAlert = function (message) {
        if (_cfg.debugAlerts) {
            alert(message);
        }
    };


    /**
     *
     * @param message
     */
    var showConsoleError = function (message) {
        if (_cfg.debugConsole) {
            console.error(message);
        }
    };


    // Public interface
    return {
        STATUS: STATUS,
        AUDIO_RESULT_TYPE: AUDIO_RESULT_TYPE,
        DEFAULT: DEFAULT,

        start: start,
        stop: stop,
        isCapturing: isCapturing,
        getCurrentVolume: getCurrentVolume,
        isSpeakingRightNow: isSpeakingRightNow,
        getCfg: getCfg,
        getMonitoringData: getMonitoringData,
        getAudioContext: getAudioContext,
        getLastErrorCode: getLastErrorCode,

        onAudioInputCapture: onAudioInputCapture,
        onAudioInputError: onAudioInputError
    };

})();


/**
 * From: https://github.com/higuma/wav-audio-encoder-js
 */
(function(self) {
    var min = Math.min,
        max = Math.max;

    var setString = function(view, offset, str) {
        var len = str.length;
        for (var i = 0; i < len; ++i)
            view.setUint8(offset + i, str.charCodeAt(i));
    };

    var Encoder = function(sampleRate, numChannels) {
        this.sampleRate = sampleRate;
        this.numChannels = numChannels;
        this.numSamples = 0;
        this.dataViews = [];
    };

    Encoder.prototype.encode = function(buffer) {
        var len = buffer[0].length,
            nCh = this.numChannels,
            view = new DataView(new ArrayBuffer(len * nCh * 2)),
            offset = 0;
        for (var i = 0; i < len; ++i)
            for (var ch = 0; ch < nCh; ++ch) {
                var x = buffer[ch][i] * 0x7fff;
                view.setInt16(offset, x < 0 ? max(x, -0x8000) : min(x, 0x7fff), true);
                offset += 2;
            }
        this.dataViews.push(view);
        this.numSamples += len;
    };

    Encoder.prototype.finish = function(mimeType) {
        var dataSize = this.numChannels * this.numSamples * 2,
            view = new DataView(new ArrayBuffer(44));
        setString(view, 0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        setString(view, 8, 'WAVE');
        setString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, this.numChannels, true);
        view.setUint32(24, this.sampleRate, true);
        view.setUint32(28, this.sampleRate * 4, true);
        view.setUint16(32, this.numChannels * 2, true);
        view.setUint16(34, 16, true);
        setString(view, 36, 'data');
        view.setUint32(40, dataSize, true);
        this.dataViews.unshift(view);
        var blob = new Blob(this.dataViews, { type: 'audio/wav' });
        this.cleanup();
        return blob;
    };

    Encoder.prototype.cancel = Encoder.prototype.cleanup = function() {
        delete this.dataViews;
    };

    self.WavAudioEncoder = Encoder;
})(self);