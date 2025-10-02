import React, { useState, useRef, useEffect } from 'react';
import { Upload, Download, Film, Scissors, Image, Type, Volume2, VolumeX, Monitor, Smartphone, Maximize2, Play, Pause, RotateCw, Crop, CheckCircle, AlertCircle } from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

export default function VideoEditor() {
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(100);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [loadingFFmpeg, setLoadingFFmpeg] = useState(false);
  const [error, setError] = useState('');
  
  // Video settings
  const [flipHorizontal, setFlipHorizontal] = useState(false);
  const [flipVertical, setFlipVertical] = useState(false);
  const [audioMode, setAudioMode] = useState('stereo');
  const [aspectRatio, setAspectRatio] = useState('original');
  const [cropSettings, setCropSettings] = useState({ x: 0, y: 0, width: 100, height: 100 });
  const [subtitles, setSubtitles] = useState('');
  const [rotation, setRotation] = useState(0);
  
  const videoRef = useRef(null);
  const ffmpegRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadFFmpeg();
    const savedSettings = localStorage.getItem('videoEditorSettings');
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      setFlipHorizontal(settings.flipHorizontal || false);
      setFlipVertical(settings.flipVertical || false);
      setAudioMode(settings.audioMode || 'stereo');
      setAspectRatio(settings.aspectRatio || 'original');
    }
  }, []);

  const loadFFmpeg = async () => {
    try {
      setLoadingFFmpeg(true);
      setProgressMessage('Loading video processing engine...');
      
      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;

      ffmpeg.on('log', ({ message }) => {
        console.log(message);
      });

      ffmpeg.on('progress', ({ progress: prog, time }) => {
        setProgress(Math.round(prog * 100));
        if (isProcessing) {
          setProgressMessage(`Processing: ${Math.round(prog * 100)}%`);
        }
      });

      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      setFfmpegLoaded(true);
      setLoadingFFmpeg(false);
      setProgressMessage('Ready to edit!');
    } catch (err) {
      console.error('Failed to load FFmpeg:', err);
      setError('Failed to load video processing engine. Please refresh the page.');
      setLoadingFFmpeg(false);
    }
  };

  const saveSettings = () => {
    const settings = {
      flipHorizontal,
      flipVertical,
      audioMode,
      aspectRatio,
      rotation,
      cropSettings,
      trimStart,
      trimEnd
    };
    localStorage.setItem('videoEditorSettings', JSON.stringify(settings));
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('video/')) {
      setVideoFile(file);
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setTrimStart(0);
      setTrimEnd(100);
      setError('');
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      setTrimEnd(100);
    }
  };

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getAspectRatioStyles = () => {
    const ratios = {
      'original': 'aspect-video',
      '16:9': 'aspect-video',
      '9:16': 'aspect-[9/16]',
      '1:1': 'aspect-square',
      '4:3': 'aspect-[4/3]'
    };
    return ratios[aspectRatio] || 'aspect-video';
  };

  const getTransformStyles = () => {
    let transform = '';
    if (flipHorizontal) transform += 'scaleX(-1) ';
    if (flipVertical) transform += 'scaleY(-1) ';
    if (rotation !== 0) transform += `rotate(${rotation}deg) `;
    return transform;
  };

  const getAspectRatioFilter = () => {
    const ratios = {
      'original': null,
      '16:9': 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2',
      '9:16': 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2',
      '1:1': 'scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2',
      '4:3': 'scale=1440:1080:force_original_aspect_ratio=decrease,pad=1440:1080:(ow-iw)/2:(oh-ih)/2'
    };
    return ratios[aspectRatio];
  };

  const handleRender = async () => {
    if (!videoFile || !ffmpegLoaded) {
      setError('Please wait for the video processing engine to load and select a video file.');
      return;
    }
    
    try {
      setIsProcessing(true);
      setProgress(0);
      setError('');
      setProgressMessage('Preparing video...');
      saveSettings();

      const ffmpeg = ffmpegRef.current;
      
      // Write input file
      await ffmpeg.writeFile('input.mp4', await fetchFile(videoFile));
      setProgressMessage('Building filter pipeline...');

      // Build filter complex
      let filters = [];
      
      // Flip filters
      if (flipHorizontal && flipVertical) {
        filters.push('hflip,vflip');
      } else if (flipHorizontal) {
        filters.push('hflip');
      } else if (flipVertical) {
        filters.push('vflip');
      }

      // Rotation filter
      if (rotation === 90) {
        filters.push('transpose=1');
      } else if (rotation === 180) {
        filters.push('transpose=1,transpose=1');
      } else if (rotation === 270) {
        filters.push('transpose=2');
      }

      // Crop filter
      if (cropSettings.width !== 100 || cropSettings.height !== 100) {
        filters.push(`crop=iw*${cropSettings.width/100}:ih*${cropSettings.height/100}`);
      }

      // Aspect ratio filter
      const aspectFilter = getAspectRatioFilter();
      if (aspectFilter) {
        filters.push(aspectFilter);
      }

      // Subtitle filter
      if (subtitles.trim()) {
        // Create subtitle file
        const subContent = `1
00:00:00,000 --> 00:00:10,000
${subtitles}`;
        await ffmpeg.writeFile('subtitles.srt', subContent);
        filters.push("subtitles=subtitles.srt:force_style='FontSize=24,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,BorderStyle=3'");
      }

      const filterComplex = filters.join(',');

      // Build ffmpeg command
      const args = ['-i', 'input.mp4'];

      // Trim
      const startTime = (trimStart / 100) * duration;
      const endTime = (trimEnd / 100) * duration;
      if (startTime > 0) {
        args.push('-ss', startTime.toString());
      }
      if (endTime < duration) {
        args.push('-t', (endTime - startTime).toString());
      }

      // Apply filters
      if (filterComplex) {
        args.push('-vf', filterComplex);
      }

      // Audio handling
      if (audioMode === 'mute') {
        args.push('-an');
      } else if (audioMode === 'mono') {
        args.push('-ac', '1');
      }

      // Output settings
      args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '22');
      if (audioMode !== 'mute') {
        args.push('-c:a', 'aac', '-b:a', '128k');
      }
      args.push('output.mp4');

      setProgressMessage('Processing video...');
      console.log('FFmpeg command:', args.join(' '));

      // Execute ffmpeg
      await ffmpeg.exec(args);

      setProgressMessage('Finalizing...');

      // Read output file
      const data = await ffmpeg.readFile('output.mp4');
      
      // Create download link
      const blob = new Blob([data.buffer], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `edited_${videoFile.name}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Cleanup
      await ffmpeg.deleteFile('input.mp4');
      await ffmpeg.deleteFile('output.mp4');
      if (subtitles.trim()) {
        await ffmpeg.deleteFile('subtitles.srt');
      }

      setProgressMessage('✨ Video rendered successfully!');
      setProgress(100);
      
      setTimeout(() => {
        setIsProcessing(false);
        setProgress(0);
        setProgressMessage('Ready to edit!');
      }, 2000);

    } catch (err) {
      console.error('Rendering error:', err);
      setError(`Failed to render video: ${err.message}`);
      setIsProcessing(false);
      setProgressMessage('');
      setProgress(0);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      {/* Header */}
      <div className="border-b border-purple-500/20 bg-black/20 backdrop-blur-xl">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-r from-purple-500 to-pink-500 p-2 rounded-xl">
                <Film className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                  Pro Video Editor
                </h1>
                <p className="text-xs text-purple-300">
                  {loadingFFmpeg ? 'Loading engine...' : ffmpegLoaded ? '✓ Ready for editing' : '⚠ Engine not loaded'}
                </p>
              </div>
            </div>
            <button
              onClick={handleRender}
              disabled={!videoFile || isProcessing || !ffmpegLoaded}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl font-semibold hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-purple-500/50"
            >
              {isProcessing ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  {progress > 0 ? `${progress}%` : 'Processing...'}
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  Render & Download
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        {/* Progress/Error Messages */}
        {(progressMessage || error) && (
          <div className={`mb-6 p-4 rounded-xl border ${
            error 
              ? 'bg-red-900/20 border-red-500/50 text-red-300' 
              : 'bg-purple-900/20 border-purple-500/50 text-purple-300'
          }`}>
            <div className="flex items-center gap-3">
              {error ? (
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
              ) : (
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
              )}
              <div className="flex-1">
                <p className="font-medium">{error || progressMessage}</p>
                {isProcessing && progress > 0 && (
                  <div className="mt-2 w-full bg-purple-900/50 rounded-full h-2">
                    <div 
                      className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Video Preview */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-6 border border-purple-500/20">
              {!videoFile ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-video bg-gradient-to-br from-purple-900/20 to-pink-900/20 rounded-xl border-2 border-dashed border-purple-500/30 flex flex-col items-center justify-center cursor-pointer hover:border-purple-500/60 transition-all"
                >
                  <Upload className="w-16 h-16 text-purple-400 mb-4" />
                  <p className="text-xl font-semibold text-purple-300">Upload Video</p>
                  <p className="text-sm text-purple-400/60 mt-2">MP4, MOV, WebM supported</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className={`relative ${getAspectRatioStyles()} bg-black rounded-xl overflow-hidden mx-auto max-w-full`}>
                    <video
                      ref={videoRef}
                      src={videoUrl}
                      className="w-full h-full object-contain"
                      style={{ transform: getTransformStyles() }}
                      onTimeUpdate={handleTimeUpdate}
                      onLoadedMetadata={handleLoadedMetadata}
                      muted={audioMode === 'mute'}
                    />
                    {subtitles && (
                      <div className="absolute bottom-4 left-0 right-0 text-center">
                        <p className="bg-black/80 text-white px-4 py-2 rounded-lg inline-block text-sm">
                          {subtitles}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Video Controls */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={togglePlayPause}
                        className="bg-purple-600 hover:bg-purple-500 p-3 rounded-xl transition-all"
                      >
                        {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                      </button>
                      <div className="flex-1 space-y-1">
                        <input
                          type="range"
                          min="0"
                          max={duration || 100}
                          value={currentTime}
                          onChange={(e) => {
                            if (videoRef.current) {
                              videoRef.current.currentTime = e.target.value;
                            }
                          }}
                          className="w-full h-2 bg-purple-900/50 rounded-lg appearance-none cursor-pointer"
                          style={{
                            background: `linear-gradient(to right, #a855f7 0%, #a855f7 ${(currentTime / duration) * 100}%, #4c1d95 ${(currentTime / duration) * 100}%, #4c1d95 100%)`
                          }}
                        />
                        <div className="flex justify-between text-xs text-purple-300">
                          <span>{formatTime(currentTime)}</span>
                          <span>{formatTime(duration)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Trim Controls */}
                    <div className="bg-purple-900/30 p-4 rounded-xl">
                      <div className="flex items-center gap-2 mb-2">
                        <Scissors className="w-4 h-4 text-purple-400" />
                        <span className="text-sm font-semibold text-purple-300">Trim Timeline</span>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs text-purple-400">Start: {formatTime((trimStart / 100) * duration)}</label>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={trimStart}
                            onChange={(e) => setTrimStart(Number(e.target.value))}
                            className="w-full h-2 bg-purple-900/50 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-purple-400">End: {formatTime((trimEnd / 100) * duration)}</label>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={trimEnd}
                            onChange={(e) => setTrimEnd(Number(e.target.value))}
                            className="w-full h-2 bg-purple-900/50 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Controls Panel */}
          <div className="space-y-4">
            {/* Browse */}
            <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-6 border border-purple-500/20">
              <h3 className="font-semibold mb-4 flex items-center gap-2 text-purple-300">
                <Upload className="w-5 h-5" />
                Browse
              </h3>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full px-4 py-3 bg-purple-600/50 hover:bg-purple-600 rounded-xl transition-all text-sm font-medium"
              >
                Choose Video File
              </button>
              {videoFile && (
                <p className="text-xs text-purple-400 mt-2 truncate">
                  {videoFile.name}
                </p>
              )}
            </div>

            {/* Flip Controls */}
            <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-6 border border-purple-500/20">
              <h3 className="font-semibold mb-4 flex items-center gap-2 text-purple-300">
                <RotateCw className="w-5 h-5" />
                Flip & Rotate
              </h3>
              <div className="space-y-3">
                <button
                  onClick={() => setFlipHorizontal(!flipHorizontal)}
                  className={`w-full px-4 py-3 rounded-xl transition-all text-sm font-medium ${
                    flipHorizontal ? 'bg-purple-600' : 'bg-purple-600/30 hover:bg-purple-600/50'
                  }`}
                >
                  Flip Horizontal
                </button>
                <button
                  onClick={() => setFlipVertical(!flipVertical)}
                  className={`w-full px-4 py-3 rounded-xl transition-all text-sm font-medium ${
                    flipVertical ? 'bg-purple-600' : 'bg-purple-600/30 hover:bg-purple-600/50'
                  }`}
                >
                  Flip Vertical
                </button>
                <div>
                  <label className="text-xs text-purple-400 mb-1 block">Rotation: {rotation}°</label>
                  <input
                    type="range"
                    min="0"
                    max="360"
                    step="90"
                    value={rotation}
                    onChange={(e) => setRotation(Number(e.target.value))}
                    className="w-full h-2 bg-purple-900/50 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Audio Controls */}
            <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-6 border border-purple-500/20">
              <h3 className="font-semibold mb-4 flex items-center gap-2 text-purple-300">
                <Volume2 className="w-5 h-5" />
                Audio Mode
              </h3>
              <div className="space-y-2">
                {['stereo', 'mono', 'mute'].map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setAudioMode(mode)}
                    className={`w-full px-4 py-3 rounded-xl transition-all text-sm font-medium capitalize ${
                      audioMode === mode ? 'bg-purple-600' : 'bg-purple-600/30 hover:bg-purple-600/50'
                    }`}
                  >
                    {mode === 'mute' ? <VolumeX className="w-4 h-4 inline mr-2" /> : <Volume2 className="w-4 h-4 inline mr-2" />}
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {/* Aspect Ratio */}
            <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-6 border border-purple-500/20">
              <h3 className="font-semibold mb-4 flex items-center gap-2 text-purple-300">
                <Maximize2 className="w-5 h-5" />
                Aspect Ratio
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'original', label: 'Original', icon: Monitor },
                  { value: '16:9', label: '16:9', icon: Monitor },
                  { value: '9:16', label: '9:16', icon: Smartphone },
                  { value: '1:1', label: '1:1', icon: Maximize2 },
                  { value: '4:3', label: '4:3', icon: Monitor }
                ].map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    onClick={() => setAspectRatio(value)}
                    className={`px-3 py-2 rounded-lg transition-all text-xs font-medium flex items-center justify-center gap-1 ${
                      aspectRatio === value ? 'bg-purple-600' : 'bg-purple-600/30 hover:bg-purple-600/50'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Subtitles */}
            <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-6 border border-purple-500/20">
              <h3 className="font-semibold mb-4 flex items-center gap-2 text-purple-300">
                <Type className="w-5 h-5" />
                Subtitles/CC
              </h3>
              <textarea
                value={subtitles}
                onChange={(e) => setSubtitles(e.target.value)}
                placeholder="Enter subtitle text..."
                className="w-full px-4 py-3 bg-purple-900/30 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
                rows="3"
              />
            </div>

            {/* Crop */}
            <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-6 border border-purple-500/20">
              <h3 className="font-semibold mb-4 flex items-center gap-2 text-purple-300">
                <Crop className="w-5 h-5" />
                Crop
              </h3>
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-purple-400">Width: {cropSettings.width}%</label>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={cropSettings.width}
                    onChange={(e) => setCropSettings({ ...cropSettings, width: Number(e.target.value) })}
                    className="w-full h-2 bg-purple-900/50 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                <div>
                  <label className="text-xs text-purple-400">Height: {cropSettings.height}%</label>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={cropSettings.height}
                    onChange={(e) => setCropSettings({ ...cropSettings, height: Number(e.target.value) })}
                    className="w-full h-2 bg-purple-900/50 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-purple-500/20 bg-black/20 backdrop-blur-xl mt-12">
        <div className="container mx-auto px-6 py-4 text-center text-sm text-purple-400">
          <p>✨ 100% Client-Side Processing with FFmpeg.wasm • No Server • Your Privacy Protected</p>
        </div>
      </div>
    </div>
  );
}