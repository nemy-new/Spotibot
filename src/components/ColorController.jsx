import React, { useState, useEffect, useCallback, useRef } from 'react';
import { HexColorPicker } from 'react-colorful';
import { switchbotApi } from '../lib/switchbot';
import { spotifyApi } from '../lib/spotify';
import { extractColorFromImage, getPixelColorFromImage } from '../utils/color';



const useDebounce = (effect, delay, deps) => {
    useEffect(() => {
        const handler = setTimeout(() => effect(), delay);
        return () => clearTimeout(handler);
    }, [...deps || [], delay]);
};

export function ColorController({ devices, selectedDeviceIds, onToggleDevice, token, secret, spotifyToken, spotifyClientId, onOpenSettings, onTokenExpired }) {
    // Filter active devices based on selection
    const activeDevices = devices.filter(d => selectedDeviceIds.includes(d.deviceId));

    // Local state for UI responsiveness (tracked against the first ACTIVE device)
    const [power, setPower] = useState(true);
    const [brightness, setBrightness] = useState(100);
    const [color, setColor] = useState("#ffffff");
    const [colorTemp, setColorTemp] = useState(4000);
    const [activeTab, setActiveTab] = useState('color');
    const [loading, setLoading] = useState(false);

    // Spotify State
    const [track, setTrack] = useState(null);
    const [audioFeatures, setAudioFeatures] = useState(null);
    const [autoSync, setAutoSync] = useState(true);
    const [isPlaying, setIsPlaying] = useState(false);

    // Sync Mode: 'spotify' or 'screen'
    const [syncMode, setSyncMode] = useState('spotify'); // 'spotify' | 'screen'
    const [screenStream, setScreenStream] = useState(null);
    const videoRef = useRef(null); // Changed from useState to useRef to prevent stale closures
    const [isCinemaMode, setIsCinemaMode] = useState(false);

    // ...

    // --- Screen Sync Logic (ROBUST REWRITE 2.0) ---
    // ...

    const syncWithScreen = () => {
        if (!screenStream) {
            setDebugInfo("Waiting for stream state...");
            return;
        }

        // Access Ref directly - this is always fresh even in loops
        const video = videoRef.current;

        if (!video) {
            setDebugInfo("Waiting for video element...");
            return;
        }

        if (video.readyState < 2) {
            setDebugInfo(`Video Loading... (State: ${video.readyState})`);
            return;
        }

        // ... rest of sync logic ...

        // Sync status on mount (from first ACTIVE device)
        useEffect(() => {
            if (activeDevices.length > 0) fetchStatus();

            // Cleanup screen stream on unmount
            return () => {
                if (screenStream) {
                    screenStream.getTracks().forEach(track => track.stop());
                }
            };
        }, [activeDevices[0]?.deviceId]);

        const fetchStatus = async () => {
            if (activeDevices.length === 0) return;
            try {
                const status = await switchbotApi.getDeviceStatus(token, secret, activeDevices[0].deviceId);
                if (status) {
                    setPower(status.power === 'on');
                    setBrightness(status.brightness);
                    if (status.color) {
                        const [r, g, b] = status.color.split(':');
                        const hex = '#' + [r, g, b].map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
                        setColor(hex);
                        setActiveTab('color');
                    } else if (status.colorTemperature) {
                        setColorTemp(status.colorTemperature);
                        setActiveTab('white');
                    }
                }
            } catch (e) {
                console.error("Status fetch error:", e);
            }
        };

        // Auto-Sync Polling
        useEffect(() => {
            let interval;
            if (autoSync && power) {
                if (syncMode === 'spotify' && spotifyToken) {
                    interval = setInterval(() => {
                        syncWithSpotify(true); // silent sync
                    }, 5000);
                } else if (syncMode === 'screen' && screenStream) {
                    interval = setInterval(() => {
                        syncWithScreen();
                    }, 1000); // Faster sync for video
                }
            }
            return () => clearInterval(interval);
        }, [autoSync, spotifyToken, track?.id, syncMode, screenStream, power]);

        // --- Screen Sync Logic ---
        const startScreenShare = async () => {
            try {
                const stream = await navigator.mediaDevices.getDisplayMedia({
                    video: { width: 400, height: 400, frameRate: 10 }, // Low res/FPS for performance
                    audio: false
                });

                setScreenStream(stream);
                setSyncMode('screen');

                // Handle stream stop (user clicks "Stop sharing" in browser UI)
                stream.getVideoTracks()[0].onended = () => {
                    stopScreenShare();
                };

            } catch (err) {
                console.error("Screen Share Error:", err);
                // alert("Failed to start screen share.");
            }
        };

        const stopScreenShare = () => {
            if (screenStream) {
                screenStream.getTracks().forEach(track => track.stop());
                setScreenStream(null);
            }
            setSyncMode('spotify'); // Fallback to spotify
        };

        // --- Spotify Sync Logic ---
        const syncWithSpotify = async (silent = false) => {
            if (syncMode !== 'spotify') return;

            if (!spotifyToken) {
                if (!silent) {
                    if (!spotifyClientId) {
                        alert("Please set Spotify Client ID in settings first.");
                        onOpenSettings && onOpenSettings();
                        return;
                    }
                    const redirectUri = window.location.origin + window.location.pathname;

                    console.log("Debug: Redirecting to Spotify with URI:", redirectUri);
                    spotifyApi.login(spotifyClientId.trim(), redirectUri);
                }
                return;
            }

            const result = await spotifyApi.getCurrentTrack(spotifyToken);

            if (!result.success) {
                // Handle 401 Unauthorized
                if (result.status === 401) {
                    console.warn("Spotify Token Expired or Unauthorized");
                    localStorage.removeItem('spotify_access_token');
                    setSpotifyToken(null);
                    return;
                }

                // Handle other errors
                if (!silent && result.status !== 0) {
                    console.error("Spotify Sync Error:", result.error);
                }
                return;
            }

            let data = result.data;
            let isFallback = false;

            // FALLBACK: If no currently playing track
            if (!data || !data.item) {
                const recent = await spotifyApi.getRecentlyPlayed(spotifyToken);
                if (recent) {
                    data = { item: recent, is_playing: false };
                    isFallback = true;
                }
            }

            if (data && data.item) {
                setIsPlaying(data.is_playing);

                // Update only if track changes
                if (!track || track.id !== data.item.id) {
                    setTrack({ ...data.item, isFallback });

                    // Color extraction
                    const imageUrl = data.item.album.images[0]?.url;
                    if (imageUrl) {
                        const domColor = await extractColorFromImage(imageUrl);
                        if (domColor) {
                            setColor(domColor);
                            setActiveTab('color');
                        }
                    }
                }
            } else if (!silent) {
                alert("No music playing and no history found.");
            }
        };

        const handlePlayback = async (action) => {
            try {
                if (action === 'next') await spotifyApi.nextTrack(spotifyToken);
                if (action === 'prev') await spotifyApi.previousTrack(spotifyToken);
                if (action === 'toggle') {
                    await spotifyApi.togglePlay(spotifyToken, isPlaying);
                    setIsPlaying(!isPlaying);
                }
                setTimeout(() => syncWithSpotify(true), 500);
            } catch (e) {
                console.error("Playback error:", e);
            }
        };

        const handleArtClick = async (e) => {
            if (!track || !track.album.images[0]) return;

            const rect = e.target.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const hex = await getPixelColorFromImage(track.album.images[0].url, x, y, e.target);
            if (hex) {
                setColor(hex);
                setActiveTab('color');
            }
        };

        const togglePower = async () => {
            if (activeDevices.length === 0) return;
            setLoading(true);
            const nextPower = !power;
            try {
                const cmd = nextPower ? 'turnOn' : 'turnOff';
                await Promise.all(activeDevices.map(d =>
                    switchbotApi.sendCommand(token, secret, d.deviceId, cmd)
                ));
                setPower(nextPower);
            } catch (err) {
                alert("Failed to toggle power for one or more devices");
            } finally {
                setLoading(false);
            }
        };

        // Debounced Brightness Change (Broadcast - but we check activeDevices inside)
        useDebounce(async () => {
            if (activeDevices.length === 0) return;
            try {
                await Promise.all(activeDevices.map(d =>
                    switchbotApi.sendCommand(token, secret, d.deviceId, 'setBrightness', brightness.toString())
                ));
            } catch (e) { console.error(e); }
        }, 500, [brightness, activeDevices]);

        // Debounced Color Temp Change (Broadcast)
        useDebounce(async () => {
            if (activeDevices.length === 0 || activeTab !== 'white') return;
            try {
                await Promise.all(activeDevices.map(d =>
                    switchbotApi.sendCommand(token, secret, d.deviceId, 'setColorTemperature', colorTemp.toString())
                ));
            } catch (e) { console.error(e); }
        }, 500, [colorTemp, activeTab, activeDevices]);

        // --- Manual Debounce & Throttling Logic ---
        const lastCommandTime = React.useRef(0);
        const colorDebounceTimer = React.useRef(null);

        // Effect: Handle Color Changes (replaces generic useDebounce)
        useEffect(() => {
            if (activeDevices.length === 0 || activeTab !== 'color') return;

            // If in Screen Sync mode, we control the API calls manually via Throttle in the loop
            if (syncMode === 'screen') {
                // However, we still want the UI (color state) to update instantly.
                // The API call is handled inside syncWithScreen logic to ensure throttling.
                return;
            }

            // Standard Debounce for Manual Picking / Spotify
            if (colorDebounceTimer.current) clearTimeout(colorDebounceTimer.current);

            colorDebounceTimer.current = setTimeout(async () => {
                const r = parseInt(color.slice(1, 3), 16);
                const g = parseInt(color.slice(3, 5), 16);
                const b = parseInt(color.slice(5, 7), 16);
                const parameter = `${r}:${g}:${b}`;
                try {
                    await Promise.all(activeDevices.map(d =>
                        switchbotApi.sendCommand(token, secret, d.deviceId, 'setColor', parameter)
                    ));
                } catch (e) { console.error(e); }
            }, 500);

            return () => clearTimeout(colorDebounceTimer.current);
        }, [color, activeTab, activeDevices, syncMode]);


        // --- Refs for Stale Closure Prevention in Sync Loop ---
        const stateRef = useRef({ activeDevices: [], token: null, secret: null, color: '#000000', syncMode: 'spotify' });
        const canvasRef = useRef(null); // Reuse canvas
        const [debugInfo, setDebugInfo] = useState(''); // Debug overlay text

        // Keep Refs synchronized with latest state
        useEffect(() => {
            stateRef.current = { activeDevices, token, secret, color, syncMode };
        }, [activeDevices, token, secret, color, syncMode]);

        // Handle Video Stream Assignment (Fixes AbortError)
        useEffect(() => {
            const video = videoRef.current;
            if (video && screenStream) {
                // Only update if stream changed
                if (video.srcObject !== screenStream) {
                    video.srcObject = screenStream;

                    // Wait for metadata to load to prevent "interrupted" errors
                    video.onloadedmetadata = () => {
                        if (video.paused) {
                            video.play().catch(e => {
                                // Completely suppress AbortError as it's harmless here
                                if (e.name !== 'AbortError') {
                                    console.error("Video play failed:", e);
                                }
                            });
                        }
                    };
                }
            }
        }, [screenStream]);


        // Auto-Sync Polling
        useEffect(() => {
            let interval;
            let animationFrame;

            if (autoSync && power) {
                if (syncMode === 'spotify' && spotifyToken) {
                    interval = setInterval(() => {
                        syncWithSpotify(true); // silent sync
                    }, 5000);
                } else if (syncMode === 'screen' && screenStream) {
                    // Real-time loop for Screen Sync (60fps UI)
                    const loop = () => {
                        syncWithScreen();
                        animationFrame = requestAnimationFrame(loop);
                    };
                    loop();
                }
            }
            return () => {
                clearInterval(interval);
                cancelAnimationFrame(animationFrame);
            };
        }, [autoSync, spotifyToken, track?.id, syncMode, screenStream, power]);

        // --- Screen Sync Logic (ROBUST REWRITE 2.0) ---
        // ... (start/stopScreenShare reused) ...

        const syncWithScreen = () => {
            if (!screenStream) {
                setDebugInfo("Waiting for stream state...");
                return;
            }

            // Access Ref directly - this is always fresh even in loops
            const video = videoRef.current;

            if (!video) {
                setDebugInfo("Waiting for video element...");
                return;
            }

            if (video.readyState < 2) {
                setDebugInfo(`Video Loading... (State: ${video.readyState})`);
                return;
            }

            // 1. Setup Canvas (Reused)
            if (!canvasRef.current) {
                canvasRef.current = document.createElement('canvas');
                canvasRef.current.width = 50;
                canvasRef.current.height = 50;
            }
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });

            try {
                // 2. Draw & Extract
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

                // 3. Simple Average Calculation (No "Vibrant" logic - Failsafe)
                let sumR = 0, sumG = 0, sumB = 0;
                let count = 0;

                for (let i = 0; i < imageData.length; i += 4) {
                    sumR += imageData[i];
                    sumG += imageData[i + 1];
                    sumB += imageData[i + 2];
                    count++;
                }

                const avgR = Math.round(sumR / count);
                const avgG = Math.round(sumG / count);
                const avgB = Math.round(sumB / count);

                // Helper: RGB to Hex
                const toHex = (c) => {
                    const hex = c.toString(16);
                    return hex.length === 1 ? "0" + hex : hex;
                };
                const hexColor = `#${toHex(avgR)}${toHex(avgG)}${toHex(avgB)}`;

                // Debug Data
                const { activeDevices, token, secret, color } = stateRef.current;
                setDebugInfo(`Video: ${video.videoWidth}x${video.videoHeight} | RGB: ${avgR},${avgG},${avgB} | Hex: ${hexColor}`);

                if (hexColor && hexColor !== color) {
                    // 4. UI Update
                    setColor(hexColor);
                    setActiveTab('color');

                    // 5. Throttled Device Update
                    const now = Date.now();
                    if (now - lastCommandTime.current > 1500) {
                        lastCommandTime.current = now;

                        const parameter = `${avgR}:${avgG}:${avgB}`;

                        if (activeDevices.length > 0 && token && secret) {
                            Promise.all(activeDevices.map(d =>
                                switchbotApi.sendCommand(token, secret, d.deviceId, 'setColor', parameter)
                            )).catch(e => console.warn("Sync error:", e));
                        }
                    }
                }

            } catch (e) {
                setDebugInfo(`Error: ${e.message}`);
            }
        };

        // ... (Spotify Sync reused) ...

        if (devices.length === 0) return null;

        const mainDeviceName = devices.length === 1 ? devices[0].deviceName : `${devices.length} Devices Linked`;
        return (
            <div
                className="animate-in"
                style={{
                    position: 'relative',
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '20px',
                    zIndex: 1,
                    // Main Ambient Background Transition
                    transition: 'background 0.5s ease'
                }}
            >
                {/* --- Dynamic Aurora Background --- */}
                <div style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none', background: '#050505' }}>
                    {/* Blob 1: Top Left / Main Color */}
                    <div className="aurora-blob" style={{
                        top: '-10%', left: '-10%', width: '70vw', height: '70vw',
                        backgroundColor: color, opacity: 0.4,
                        animationDuration: '25s'
                    }} />

                    {/* Blob 2: Bottom Right / Secondary */}
                    <div className="aurora-blob" style={{
                        bottom: '-10%', right: '-10%', width: '60vw', height: '60vw',
                        backgroundColor: color, opacity: 0.3,
                        animationDirection: 'reverse', animationDuration: '30s',
                        filter: 'blur(100px) hue-rotate(30deg)' // Slight hue shift for depth
                    }} />

                    {/* Blob 3: Center Accent (Lighter) */}
                    <div className="aurora-blob" style={{
                        top: '30%', left: '30%', width: '40vw', height: '40vw',
                        backgroundColor: color, opacity: 0.4,
                        animationDuration: '20s',
                        mixBlendMode: 'overlay'
                    }} />

                    {/* Noise texture overlay for texture (optional, subtle) */}
                    <div style={{ position: 'absolute', inset: 0, opacity: 0.03, background: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'0 0 2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.65\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")', pointerEvents: 'none' }} />
                </div>
                {/* Header / Info Bar - SIMPLIFIED */}
                <div className="flex-row justify-end w-full" style={{ padding: '0 8px', height: '40px' }}>
                    <button onClick={fetchStatus} className="btn-icon-playback" title="Refresh Status" style={{ fontSize: '16px', opacity: 0.8, padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '50%' }}>
                        <span className="material-symbols-outlined">refresh</span>
                    </button>
                </div>

                {/* MAIN LAYOUT: SPLIT SCREEN */}
                <div className="flex-row" style={{ gap: '24px', flex: 1, minHeight: 0, alignItems: 'stretch' }}>

                    {/* LEFT: IMMERSIVE SPOTIFY STAGE */}
                    <div className="card flex-1" style={{
                        flex: '1.5', // Reduced flex to shift left and give right panel more space
                        padding: '0',
                        position: 'relative',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        background: 'var(--glass-bg)',
                        borderColor: autoSync ? 'rgba(29, 185, 84, 0.4)' : 'var(--glass-border)',
                    }}>
                        {/* Inner Glow for Spotify */}
                        <div style={{
                            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                            background: autoSync ? `radial-gradient(circle at 50% 50%, rgba(29, 185, 84, 0.1) 0%, transparent 70%)` : 'none',
                            zIndex: 0,
                            pointerEvents: 'none'
                        }} />

                        {/* Content Layer */}
                        <div style={{ zIndex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: '24px' }}>

                            {/* Sync Source Toggle */}
                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px', gap: '8px' }}>
                                <button
                                    onClick={() => { setSyncMode('spotify'); if (screenStream) stopScreenShare(); }}
                                    style={{
                                        background: syncMode === 'spotify' ? 'rgba(29, 185, 84, 0.2)' : 'transparent',
                                        color: syncMode === 'spotify' ? '#1DB954' : 'rgba(255,255,255,0.5)',
                                        border: syncMode === 'spotify' ? '1px solid #1DB954' : '1px solid rgba(255,255,255,0.1)',
                                        padding: '6px 16px', borderRadius: '100px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                                    }}
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>music_note</span> Spotify
                                </button>
                                <button
                                    onClick={() => setSyncMode('screen')}
                                    style={{
                                        background: syncMode === 'screen' ? 'rgba(64, 158, 255, 0.2)' : 'transparent',
                                        color: syncMode === 'screen' ? '#409eff' : 'rgba(255,255,255,0.5)',
                                        border: syncMode === 'screen' ? '1px solid #409eff' : '1px solid rgba(255,255,255,0.1)',
                                        padding: '6px 16px', borderRadius: '100px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                                    }}
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>cast</span> Screen
                                </button>
                            </div>

                            {syncMode === 'spotify' ? (
                                spotifyToken ? (
                                    <>
                                        {track ? (
                                            <div className="animate-in flex-col" style={{ flex: 1, gap: '20px', justifyContent: 'space-between', height: '100%' }}>
                                                {/* (Existing Spotify Card Content) */}
                                                <div style={{
                                                    flex: 1,
                                                    width: '100%',
                                                    display: 'flex',
                                                    justifyContent: 'center',
                                                    alignItems: 'center',
                                                    position: 'relative',
                                                    minHeight: '0'
                                                }}>
                                                    <div style={{
                                                        position: 'relative',
                                                        height: '100%',
                                                        aspectRatio: '1/1',
                                                        maxHeight: '45vh',
                                                        maxWidth: '100%',
                                                        borderRadius: '12px',
                                                        boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                                                        overflow: 'hidden',
                                                        // Group for hover effect
                                                        className: "art-container"
                                                    }}>
                                                        <img
                                                            src={track.album.images[0].url}
                                                            alt="Album Art"
                                                            crossOrigin="Anonymous"
                                                            onClick={handleArtClick}
                                                            style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'crosshair' }}
                                                        />

                                                        {/* Detected Color Badge */}
                                                        <div style={{
                                                            position: 'absolute', bottom: '12px', right: '12px',
                                                            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
                                                            padding: '6px 12px', borderRadius: '100px',
                                                            display: 'flex', alignItems: 'center', gap: '8px',
                                                            border: '1px solid rgba(255,255,255,0.1)',
                                                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                                                        }} title="Detected Color applied to lights">
                                                            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: color, boxShadow: `0 0 10px ${color}` }} />
                                                            <span style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: 'bold' }}>{color}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Track Info */}
                                                <div className="flex-col" style={{ gap: '4px', width: '100%' }}>
                                                    <div style={{ fontSize: '24px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', textAlign: 'center' }}>
                                                        {track.name}
                                                    </div>
                                                    <div style={{ fontSize: '16px', opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', textAlign: 'center' }}>
                                                        {track.artists.map(a => a.name).join(', ')}
                                                    </div>
                                                    <div className="flex-row" style={{ gap: '48px', marginTop: '16px', justifyContent: 'center', width: '100%' }}>
                                                        <button onClick={() => handlePlayback('prev')} className="btn-icon-playback" style={{ opacity: 0.7 }}>
                                                            <span className="material-symbols-outlined" style={{ fontSize: '40px' }}>skip_previous</span>
                                                        </button>
                                                        <button onClick={() => handlePlayback('toggle')} className="btn-icon-playback" style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '50%', width: '72px', height: '72px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            <span className="material-symbols-outlined" style={{ fontSize: '48px', color: isPlaying ? 'var(--primary-color)' : 'white' }}>{isPlaying ? 'pause' : 'play_arrow'}</span>
                                                        </button>
                                                        <button onClick={() => handlePlayback('next')} className="btn-icon-playback" style={{ opacity: 0.7 }}>
                                                            <span className="material-symbols-outlined" style={{ fontSize: '40px' }}>skip_next</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ padding: '40px', opacity: 0.8, textAlign: 'center' }}>
                                                {/* ... (Existing No Track UI) ... */}
                                                <div style={{ fontSize: '48px', marginBottom: '16px', display: 'flex', justifyContent: 'center' }}><span className="material-symbols-outlined" style={{ fontSize: '64px' }}>music_off</span></div>
                                                <h3 style={{ margin: '0 0 16px 0' }}>Waiting for Spotify...</h3>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    // No Spotify Token
                                    <div className="flex-col" style={{ alignItems: 'center', gap: '32px' }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: '80px', filter: 'drop-shadow(0 0 20px rgba(255,255,255,0.2))' }}>music_note</span>
                                        <div className="flex-col" style={{ alignItems: 'center', gap: '8px' }}>
                                            <h2 style={{ fontSize: '32px', margin: 0 }}>Spotify Sync</h2>
                                            <p style={{ opacity: 0.6, fontSize: '16px' }}>Connect to transform your space with music.</p>
                                        </div>
                                        {spotifyClientId ? (
                                            <button onClick={() => syncWithSpotify()} className="btn-primary" style={{ background: '#1DB954', padding: '16px 48px', fontSize: '18px', borderRadius: '100px', boxShadow: '0 10px 40px rgba(29, 185, 84, 0.3)' }}>
                                                Connect Spotify Account
                                            </button>
                                        ) : (
                                            <button onClick={onOpenSettings} className="btn-primary" style={{ background: '#555', padding: '16px 48px', fontSize: '18px', borderRadius: '100px' }}>
                                                ⚠️ Set Client ID First
                                            </button>
                                        )}
                                    </div>
                                )
                            ) : (
                                // --- SCREEN SYNC UI ---
                                <div className="animate-in flex-col" style={{ alignItems: 'center', gap: isCinemaMode ? '0' : '24px', justifyContent: 'center', height: '100%', position: 'relative' }}>

                                    {/* Monitor/Preview Frame */}
                                    <div style={{
                                        width: '100%',
                                        flex: isCinemaMode ? 1 : 'unset', // Fill space in Cinema Mode
                                        height: isCinemaMode ? '100%' : 'unset',
                                        maxHeight: isCinemaMode ? '100%' : '360px',
                                        background: '#000',
                                        borderRadius: '16px',
                                        border: '1px solid var(--glass-border)',
                                        overflow: 'hidden',
                                        display: 'flex',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        position: 'relative',
                                        // Dynamic Ambilight Glow
                                        boxShadow: screenStream ? `0 0 60px ${color}88, 0 0 100px ${color}44` : 'none',
                                        transition: 'all 0.5s cubic-bezier(0.25, 0.8, 0.25, 1)',
                                        transform: isCinemaMode ? 'scale(1.02)' : 'perspective(1000px) rotateX(2deg)',
                                        zIndex: isCinemaMode ? 10 : 1
                                    }}>
                                        {screenStream ? (
                                            <>
                                                {/* Debug Info Overlay */}
                                                <div style={{
                                                    position: 'absolute', top: '50px', left: '16px',
                                                    background: 'rgba(0,0,0,0.8)', color: '#0f0',
                                                    fontFamily: 'monospace', fontSize: '10px',
                                                    padding: '4px 8px', borderRadius: '4px',
                                                    pointerEvents: 'none', zIndex: 100
                                                }}>
                                                    {debugInfo}
                                                </div>

                                                <video
                                                    ref={videoRef}
                                                    playsInline
                                                    muted
                                                    onClick={() => setIsCinemaMode(!isCinemaMode)}
                                                    style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'pointer' }}
                                                    title="Click to Toggle Cinema Mode"
                                                />

                                                {/* Top Right Controls Group */}
                                                <div style={{ position: 'absolute', top: '16px', right: '16px', display: 'flex', gap: '8px', zIndex: 20 }}>
                                                    {/* LIVE Badge */}
                                                    <div style={{
                                                        padding: '4px 12px', background: 'rgba(255,0,0,0.8)', color: 'white',
                                                        borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', letterSpacing: '1px',
                                                        boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
                                                        display: 'flex', alignItems: 'center', gap: '6px'
                                                    }}>
                                                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'white', animation: 'blink 1s infinite' }} />
                                                        LIVE
                                                    </div>

                                                    {/* Cinema Toggle Button */}
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setIsCinemaMode(!isCinemaMode); }}
                                                        style={{
                                                            background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)',
                                                            borderRadius: '4px', color: 'white', padding: '4px', cursor: 'pointer',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                        }}
                                                        title={isCinemaMode ? "Exit Cinema Mode" : "Enter Cinema Mode"}
                                                    >
                                                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                                                            {isCinemaMode ? 'fullscreen_exit' : 'fullscreen'}
                                                        </span>
                                                    </button>
                                                </div>

                                                {/* Detected Color Footer (Hide in Cinema Mode for pure clean view, or keep minimal?) -> Keeping minimal */}
                                                {!isCinemaMode && (
                                                    <div style={{
                                                        position: 'absolute', bottom: '16px', left: '0', right: '0',
                                                        display: 'flex', justifyContent: 'center', pointerEvents: 'none'
                                                    }}>
                                                        <div style={{
                                                            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
                                                            padding: '6px 16px', borderRadius: '100px',
                                                            display: 'flex', alignItems: 'center', gap: '10px',
                                                            border: '1px solid rgba(255,255,255,0.1)'
                                                        }}>
                                                            <span style={{ fontSize: '10px', opacity: 0.7 }}>SYNCING</span>
                                                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
                                                            <span style={{ fontSize: '12px', fontFamily: 'monospace' }}>{color}</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <div className="flex-col" style={{ alignItems: 'center', gap: '16px', opacity: 0.4 }}>
                                                <div style={{
                                                    width: '80px', height: '60px', borderRadius: '8px', border: '2px dashed rgba(255,255,255,0.5)',
                                                    display: 'flex', justifyContent: 'center', alignItems: 'center'
                                                }}>
                                                    <span className="material-symbols-outlined" style={{ fontSize: '32px' }}>present_to_all</span>
                                                </div>
                                                <span style={{ fontSize: '14px', letterSpacing: '0.5px' }}>NO SIGNAL</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Info & Controls - Hidden in Cinema Mode */}
                                    {!isCinemaMode && (
                                        <div className="flex-col animate-in" style={{ alignItems: 'center', gap: '16px', width: '100%' }}>
                                            {!screenStream && (
                                                <div className="flex-col" style={{ alignItems: 'center', gap: '4px' }}>
                                                    <h2 style={{ fontSize: '20px', margin: 0 }}>Visual Sync</h2>
                                                    <p style={{ opacity: 0.6, fontSize: '12px', textAlign: 'center' }}>
                                                        Match lights to movies, games, or videos.
                                                    </p>
                                                </div>
                                            )}

                                            {!screenStream ? (
                                                <button
                                                    onClick={startScreenShare}
                                                    className="btn-primary"
                                                    style={{
                                                        background: '#409eff',
                                                        padding: '14px 40px',
                                                        fontSize: '16px',
                                                        borderRadius: '12px',
                                                        border: 'none',
                                                        boxShadow: '0 8px 24px rgba(64, 158, 255, 0.25)',
                                                        display: 'flex', alignItems: 'center', gap: '8px',
                                                        transition: 'transform 0.2s'
                                                    }}
                                                    onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                                                    onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
                                                >
                                                    <span className="material-symbols-outlined">fit_screen</span>
                                                    Select Window
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={stopScreenShare}
                                                    className="btn-secondary"
                                                    style={{
                                                        padding: '12px 32px',
                                                        fontSize: '14px',
                                                        borderRadius: '12px',
                                                        border: '1px solid rgba(255, 77, 79, 0.5)',
                                                        color: '#ff4d4f',
                                                        background: 'rgba(255, 77, 79, 0.1)',
                                                        cursor: 'pointer',
                                                        display: 'flex', alignItems: 'center', gap: '8px'
                                                    }}
                                                >
                                                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>stop_circle</span>
                                                    Stop Sync
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* RIGHT: COMMAND CENTER (Redesigned & Clean) */}
                    <div className="card" style={{
                        flex: '1',
                        minWidth: '320px',
                        maxWidth: '600px',
                        padding: '32px',
                        background: 'var(--glass-bg)',
                        display: 'flex',
                        flexDirection: 'column',
                        zIndex: 2,
                        justifyContent: 'flex-start',
                        gap: '24px'
                    }}>
                        {/* Header with Status */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '16px' }}>
                            <div style={{ fontWeight: 'bold', fontSize: '14px', letterSpacing: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>tune</span> CONTROL PANEL
                            </div>
                            <div style={{ fontSize: '12px', opacity: 0.7, background: 'rgba(255,255,255,0.1)', padding: '4px 12px', borderRadius: '100px' }}>
                                {activeDevices.length} Lights Active
                            </div>
                        </div>

                        {/* Target Devices (Selection) */}
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {devices.map(d => (
                                <button
                                    key={d.deviceId}
                                    onClick={() => onToggleDevice(d.deviceId)}
                                    style={{
                                        padding: '6px 12px',
                                        background: selectedDeviceIds.includes(d.deviceId) ? 'var(--primary-color)' : 'transparent',
                                        border: selectedDeviceIds.includes(d.deviceId) ? '1px solid var(--primary-color)' : '1px solid var(--glass-border)',
                                        borderRadius: '100px',
                                        color: selectedDeviceIds.includes(d.deviceId) ? 'white' : 'rgba(255,255,255,0.7)',
                                        fontSize: '11px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>{d.deviceType.includes('Strip') ? 'linear_scale' : 'lightbulb'}</span>
                                    {d.deviceName}
                                </button>
                            ))}
                        </div>

                        {/* Master Power (Big Toggle) */}
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <button
                                onClick={togglePower}
                                disabled={activeDevices.length === 0}
                                style={{
                                    width: '100%',
                                    height: '64px',
                                    borderRadius: '16px',
                                    background: power ? 'var(--primary-color)' : 'rgba(255,255,255,0.05)',
                                    border: 'none',
                                    color: 'white',
                                    fontSize: '16px',
                                    fontWeight: 'bold',
                                    cursor: activeDevices.length === 0 ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '12px',
                                    boxShadow: power ? '0 4px 20px rgba(29, 185, 84, 0.4)' : 'none',
                                    transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                                }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>power_settings_new</span>
                                {power ? 'Turn Off' : 'Turn On'}
                            </button>
                        </div>

                        {/* Controls Section */}
                        <div className="flex-col" style={{ gap: '32px', flex: 1, opacity: activeDevices.length === 0 || !power ? 0.4 : 1, pointerEvents: (activeDevices.length === 0 || !power) ? 'none' : 'auto', transition: 'opacity 0.3s' }}>

                            {/* Brightness Slider */}
                            <div className="flex-col" style={{ gap: '12px' }}>
                                <div className="flex-row justify-between" style={{ fontSize: '12px', fontWeight: '500' }}>
                                    <span>Brightness</span>
                                    <span>{brightness}%</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: '16px', opacity: 0.5 }}>brightness_low</span>
                                    <input
                                        type="range"
                                        min="1" max="100"
                                        value={brightness}
                                        onChange={(e) => setBrightness(parseInt(e.target.value))}
                                        className="custom-slider"
                                        style={{
                                            flex: 1,
                                            height: '6px',
                                            background: `linear-gradient(to right, var(--primary-color) ${brightness}%, rgba(255,255,255,0.1) ${brightness}%)`
                                        }}
                                    />
                                    <span className="material-symbols-outlined" style={{ fontSize: '16px', opacity: 0.5 }}>brightness_high</span>
                                </div>
                            </div>

                            {/* Color / White Tabs & Content */}
                            <div className="flex-col" style={{ gap: '16px', flex: 1 }}>
                                {/* Tabs */}
                                <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '12px' }}>
                                    <button
                                        onClick={() => setActiveTab('color')}
                                        style={{
                                            flex: 1, padding: '8px', borderRadius: '8px', border: 'none',
                                            background: activeTab === 'color' ? 'rgba(255,255,255,0.1)' : 'transparent',
                                            color: activeTab === 'color' ? 'white' : 'rgba(255,255,255,0.5)',
                                            cursor: 'pointer', fontSize: '12px', fontWeight: '600',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                                        }}
                                    >
                                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>palette</span> RGB Color
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('white')}
                                        style={{
                                            flex: 1, padding: '8px', borderRadius: '8px', border: 'none',
                                            background: activeTab === 'white' ? 'rgba(255,255,255,0.1)' : 'transparent',
                                            color: activeTab === 'white' ? 'white' : 'rgba(255,255,255,0.5)',
                                            cursor: 'pointer', fontSize: '12px', fontWeight: '600',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                                        }}
                                    >
                                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>thermostat</span> White Temp
                                    </button>
                                </div>

                                {/* Tab Content */}
                                <div style={{ flex: 1, minHeight: '180px', display: 'flex', flexDirection: 'column' }}>
                                    {activeTab === 'color' ? (
                                        <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
                                            <div style={{ flex: 1, borderRadius: '12px', overflow: 'hidden' }}>
                                                <HexColorPicker color={color} onChange={setColor} style={{ width: '100%', height: '100%' }} />
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                                {['#ff0000', '#00ff00', '#0000ff', '#ffffff', '#ff00ff', '#ffff00', '#1DB954'].map(c => (
                                                    <button key={c} onClick={() => setColor(c)} style={{ width: '28px', height: '28px', borderRadius: '50%', background: c, border: color === c ? '2px solid white' : '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', transform: color === c ? 'scale(1.2)' : 'scale(1)', transition: 'transform 0.2s' }} />
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px', justifyContent: 'center', height: '100%' }}>
                                            <div className="flex-row justify-between" style={{ fontSize: '12px', marginBottom: '-12px' }}>
                                                <span>Warm (2700K)</span>
                                                <span>Cool (6500K)</span>
                                            </div>
                                            <div style={{ position: 'relative', height: '40px', display: 'flex', alignItems: 'center' }}>
                                                <div style={{ position: 'absolute', left: 0, right: 0, height: '12px', borderRadius: '8px', background: 'linear-gradient(to right, #ffb157, #ffffff, #d6e4ff)' }} />
                                                <input type="range" min="2700" max="6500" step="100" value={colorTemp} onChange={(e) => setColorTemp(parseInt(e.target.value))} className="custom-slider" style={{ position: 'relative', zIndex: 1, marginTop: 0 }} />
                                            </div>
                                            <div style={{ textAlign: 'center', fontSize: '14px', fontWeight: 'bold' }}>{colorTemp}K</div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Quick Scenes */}
                            <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '4px' }}>
                                {[
                                    { name: 'Read', temp: 4000, icon: 'menu_book' },
                                    { name: 'Relax', temp: 2700, icon: 'coffee' },
                                    { name: 'Focus', temp: 6000, icon: 'computer' },
                                    { name: 'Movie', color: '#1a0033', icon: 'movie' },
                                    { name: 'Game', color: '#ff0055', icon: 'sports_esports' },
                                ].map(scene => (
                                    <button
                                        key={scene.name}
                                        onClick={() => {
                                            if (scene.temp) { setActiveTab('white'); setColorTemp(scene.temp); }
                                            else { setActiveTab('color'); setColor(scene.color); }
                                        }}
                                        style={{
                                            flex: 1, padding: '12px 8px', background: 'rgba(255,255,255,0.03)',
                                            border: '1px solid var(--glass-border)', borderRadius: '12px', cursor: 'pointer',
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', minWidth: '55px',
                                            transition: 'background 0.2s'
                                        }}
                                    >
                                        <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'var(--primary-color)' }}>{scene.icon}</span>
                                        <span style={{ fontSize: '10px', color: 'var(--primary-color)' }}>{scene.name}</span>
                                    </button>
                                ))}
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        );
    }
