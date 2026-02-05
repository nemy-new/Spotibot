import { useState, useRef, useEffect, useCallback } from 'react';

export const useScreenSync = () => {
    const [stream, setStream] = useState(null);
    const [extractedColor, setExtractedColor] = useState(null);
    const [isSharing, setIsSharing] = useState(false);
    const [debugInfo, setDebugInfo] = useState('');

    // Refs for loop management (avoiding state updates in the loop for perf)
    const streamRef = useRef(null);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const loopRef = useRef(null);

    // 1. Start Sharing
    const startShare = useCallback(async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getDisplayMedia({
                video: { width: 400, height: 400, frameRate: 15 }, // Low res/FPS is fine for color
                audio: false
            });

            setStream(mediaStream);
            streamRef.current = mediaStream;
            setIsSharing(true);
            setDebugInfo("Stream started. Initializing video...");

            // Handle user clicking "Stop" on browser UI
            mediaStream.getVideoTracks()[0].onended = () => {
                stopShare();
            };

        } catch (err) {
            console.error("Screen Share Error:", err);
            setDebugInfo("Error starting stream: " + err.message);
        }
    }, []);

    // 2. Stop Sharing
    const stopShare = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
        }
        if (loopRef.current) {
            cancelAnimationFrame(loopRef.current);
        }
        setStream(null);
        streamRef.current = null;
        setIsSharing(false);
        setExtractedColor(null);
        setDebugInfo("Stopped.");
    }, []);

    // 3. Attach Video & Start Loop (The Tricky Part)
    // We expect the consumer to pass us a video element ref, OR we handle it if they pass it to `attachVideo`
    // Actually, simpler: We expose a Ref `internalVideoRef` that the UI *must* attach to a hidden/visible video tag.

    // Better: internalize the loop logic, but we need the video element to exist in the DOM to play? 
    // Yes. So let's provide a ref that the user puts on their <video>.

    const analysisLoop = useCallback(() => {
        const video = videoRef.current;
        if (!video || !streamRef.current) return;

        if (video.readyState >= 2) {
            // Setup Canvas
            if (!canvasRef.current) {
                canvasRef.current = document.createElement('canvas');
                canvasRef.current.width = 50;
                canvasRef.current.height = 50;
            }
            const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });

            try {
                // Draw
                ctx.drawImage(video, 0, 0, 50, 50);
                const data = ctx.getImageData(0, 0, 50, 50).data;

                // Average
                let r = 0, g = 0, b = 0, count = 0;
                for (let i = 0; i < data.length; i += 4) {
                    r += data[i];
                    g += data[i + 1];
                    b += data[i + 2];
                    count++;
                }

                const avgR = Math.round(r / count);
                const avgG = Math.round(g / count);
                const avgB = Math.round(b / count);

                const toHex = c => c.toString(16).padStart(2, '0');
                const hex = `#${toHex(avgR)}${toHex(avgG)}${toHex(avgB)}`;

                setExtractedColor(hex);
                setDebugInfo(`Active: ${video.videoWidth}x${video.videoHeight}px | ${hex}`);

            } catch (e) {
                // Ignore transient sizing errors
            }
        } else {
            setDebugInfo(`Waiting for video data... (ReadyState: ${video.readyState})`);
        }

        loopRef.current = requestAnimationFrame(analysisLoop);
    }, []);


    // 4. Safely Handle Video Playback when Stream Changes
    useEffect(() => {
        if (!stream || !videoRef.current) return;

        const video = videoRef.current;
        video.srcObject = stream;

        // "Bulletproof" Playback
        const playVideo = async () => {
            try {
                if (video.paused) {
                    await video.play();
                }
                // Check once playing
                if (!loopRef.current) {
                    analysisLoop();
                }
            } catch (e) {
                // Completely suppress AbortError (common when switching streams or autoloading)
                if (e.name !== 'AbortError') {
                    console.warn("Playback failed", e);
                }
            }
        };

        // Ensure we don't pile up listeners
        video.onloadedmetadata = null;

        // If metadata already loaded (rare but possible), play immediately
        if (video.readyState >= 1) {
            playVideo();
        } else {
            video.onloadedmetadata = playVideo;
        }

        return () => {
            video.pause();
            video.srcObject = null;
            if (loopRef.current) cancelAnimationFrame(loopRef.current);
            loopRef.current = null;
        };
    }, [stream, analysisLoop]); // Only re-run if stream object itself changes


    return {
        startShare,
        stopShare,
        isSharing,
        stream,
        extractedColor,
        debugInfo,
        videoRef // User attaches this to their <video> tag
    };
};
