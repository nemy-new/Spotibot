import React, { useState, useEffect, useRef } from 'react';
import { HexColorPicker } from 'react-colorful';
import { switchbotApi } from '../lib/switchbot';
import { spotifyApi } from '../lib/spotify';
import { extractColorFromImage, getPixelColorFromImage } from '../utils/color';
import { useIsMobile } from '../hooks/useIsMobile';

const useDebounce = (effect, delay, deps) => {
    useEffect(() => {
        const handler = setTimeout(() => effect(), delay);
        return () => clearTimeout(handler);
    }, [...deps || [], delay]);
};

export function ColorController({ devices, selectedDeviceIds, onToggleDevice, token, secret, spotifyToken, spotifyClientId, onOpenSettings, onTokenExpired }) {
    // Filter active devices
    const activeDevices = devices.filter(d => selectedDeviceIds.includes(d.deviceId));
    const offlineDevices = useRef(new Map());

    // State
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

    // UI Mode
    const isMobile = useIsMobile();
    const [mobileTab, setMobileTab] = useState('visual'); // 'visual' | 'control'

    // Helpers
    const formatKey = (key, mode) => {
        const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        return `${keys[key] || '?'} ${mode === 1 ? 'Maj' : 'Min'}`;
    };

    const StatRing = ({ value, label, color }) => (
        <div style={{ position: 'relative', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)', width: '100%', height: '100%' }}>
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={color} strokeWidth="3" strokeDasharray={`${value * 100}, 100`} />
            </svg>
            <div style={{ position: 'absolute', flexDirection: 'column', display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: '8px', fontWeight: 'bold' }}>{Math.round(value * 100)}</span>
            </div>
            <div style={{ position: 'absolute', bottom: '-16px', fontSize: '8px', opacity: 0.5 }}>{label}</div>
        </div>
    );

    // --- SYNC LOGIC ---
    const lastCommandTime = useRef(0);
    const colorDebounceTimer = useRef(null);

    // 2. Fetch Initial Status
    useEffect(() => {
        if (activeDevices.length > 0) fetchStatus();
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
                    setColor('#' + [r, g, b].map(x => parseInt(x).toString(16).padStart(2, '0')).join(''));
                    setActiveTab('color');
                } else if (status.colorTemperature) {
                    setColorTemp(status.colorTemperature);
                    setActiveTab('white');
                }
            }
        } catch (e) {
            console.warn("Failed to fetch status:", e);
        }
    };

    // 3. Spotify Polling
    useEffect(() => {
        let interval;
        if (autoSync && power && spotifyToken) {
            interval = setInterval(() => syncWithSpotify(true), 5000);
        }
        return () => clearInterval(interval);
    }, [autoSync, spotifyToken, track?.id, power]);

    // Logic Helpers
    const syncWithSpotify = async (silent = false) => {
        if (!spotifyToken) {
            if (!silent) {
                if (!spotifyClientId) { onOpenSettings && onOpenSettings(); return; }
                const redirectUri = window.location.origin + window.location.pathname;
                spotifyApi.login(spotifyClientId.trim(), redirectUri);
            }
            return;
        }
        const result = await spotifyApi.getCurrentTrack(spotifyToken);
        if (!result.success) {
            if (result.status === 401) { localStorage.removeItem('spotify_access_token'); if (onTokenExpired) onTokenExpired(); }
            return;
        }
        let data = result.data;
        let isFallback = false;
        if (!data || !data.item) {
            const recent = await spotifyApi.getRecentlyPlayed(spotifyToken);
            if (recent) { data = { item: recent, is_playing: false }; isFallback = true; }
        }
        if (data && data.item) {
            setIsPlaying(data.is_playing);
            if (!track || track.id !== data.item.id) {
                setTrack({ ...data.item, isFallback });

                // Fetch Audio Features
                if (!data.item.is_local) {
                    spotifyApi.getAudioFeatures(spotifyToken, data.item.id).then(features => {
                        if (features) setAudioFeatures(features);
                    });
                } else {
                    setAudioFeatures(null);
                }

                const imageUrl = data.item.album.images[0]?.url;
                if (imageUrl) {
                    const domColor = await extractColorFromImage(imageUrl);
                    if (domColor) { setColor(domColor); setActiveTab('color'); }
                }
            }
        }
    };

    const handlePlayback = async (action) => {
        try {
            if (action === 'next') await spotifyApi.nextTrack(spotifyToken);
            if (action === 'prev') await spotifyApi.previousTrack(spotifyToken);
            if (action === 'toggle') { await spotifyApi.togglePlay(spotifyToken, isPlaying); setIsPlaying(!isPlaying); }
            setTimeout(() => syncWithSpotify(true), 500);
        } catch (e) {
            console.error(e);
        }
    };

    const handleArtClick = async (e) => {
        if (!track || !track.album.images[0]) return;
        const rect = e.target.getBoundingClientRect();
        const hex = await getPixelColorFromImage(track.album.images[0].url, e.clientX - rect.left, e.clientY - rect.top, e.target);
        if (hex) { setColor(hex); setActiveTab('color'); }
    };

    const togglePower = async () => {
        if (activeDevices.length === 0) return;
        setLoading(true);
        try {
            await Promise.all(activeDevices.map(async (d) => {
                try {
                    await switchbotApi.sendCommand(token, secret, d.deviceId, power ? 'turnOff' : 'turnOn');
                } catch (e) {
                    console.warn(`Failed to toggle power for ${d.deviceName}:`, e);
                }
            }));
            setPower(!power);
        } catch (err) {
            console.error(err);
        } finally { setLoading(false); }
    };

    // Debouncers
    useDebounce(async () => {
        if (activeDevices.length === 0) return;
        await Promise.all(activeDevices.map(async d => {
            try {
                await switchbotApi.sendCommand(token, secret, d.deviceId, 'setBrightness', brightness.toString());
            } catch (e) { console.warn(`Failed to set brightness for ${d.deviceName}`, e); }
        }));
    }, 500, [brightness, activeDevices]);

    useDebounce(async () => {
        if (activeDevices.length === 0 || activeTab !== 'white') return;
        await Promise.all(activeDevices.map(async d => {
            try {
                await switchbotApi.sendCommand(token, secret, d.deviceId, 'setColorTemperature', colorTemp.toString());
            } catch (e) { console.warn(`Failed to set temp for ${d.deviceName}`, e); }
        })).catch(console.error);
    }, 500, [colorTemp, activeTab, activeDevices]);

    // Manual Color (Debounced)
    useEffect(() => {
        if (activeDevices.length === 0 || activeTab !== 'color') return;
        if (colorDebounceTimer.current) clearTimeout(colorDebounceTimer.current);

        colorDebounceTimer.current = setTimeout(async () => {
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            const validDevices = activeDevices.filter(d => !offlineDevices.current.has(d.deviceId) || Date.now() > offlineDevices.current.get(d.deviceId));
            if (validDevices.length === 0) return;

            await Promise.all(validDevices.map(async d => {
                try {
                    await switchbotApi.sendCommand(token, secret, d.deviceId, 'setColor', `${r}:${g}:${b}`);
                } catch (e) { console.warn("Color set failed", e); }
            }));
        }, 500);

        return () => clearTimeout(colorDebounceTimer.current);
    }, [color, activeTab, activeDevices]);


    // ====================================================================================
    //                                  MOBILE LAYOUT
    // ====================================================================================
    if (isMobile) {
        return (
            <div style={{
                position: 'fixed', inset: 0,
                background: '#0a0a0a',
                color: 'white',
                display: 'flex', flexDirection: 'column',
                zIndex: 9999, // Ensure it sits on top of everything
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
            }}>
                {/* 1. APP HEADER */}
                <div style={{
                    height: '60px', padding: '0 20px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'rgba(10,10,10,0.8)', backdropFilter: 'blur(10px)',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    zIndex: 10, flexShrink: 0
                }}>
                    <div style={{ fontSize: '20px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ color: '#1DB954' }}>Spoti</span>Bot
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={fetchStatus} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>refresh</span>
                        </button>
                        <button onClick={onOpenSettings} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>settings</span>
                        </button>
                    </div>
                </div>

                {/* 2. SCROLLABLE CONTENT AREA */}
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    padding: '24px',
                    paddingBottom: '140px', // Extra space for floating nav
                    display: 'flex', flexDirection: 'column'
                }}>
                    {mobileTab === 'visual' ? (
                        // ================= VISUAL TAB =================
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '32px', minHeight: '100%' }}>

                            {/* Content Display */}
                            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                {track ? (
                                    <>
                                        <div style={{
                                            width: '80vw', maxWidth: '320px', aspectRatio: '1/1',
                                            borderRadius: '24px', overflow: 'hidden',
                                            boxShadow: `0 20px 60px ${color || 'rgba(0,0,0)'}`, // Dynamic Glow
                                            position: 'relative', marginBottom: '32px'
                                        }}>
                                            <img src={track.album.images[0].url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onClick={handleArtClick} />
                                        </div>

                                        <div style={{ textAlign: 'center', width: '100%', marginBottom: '32px' }}>
                                            <h2 style={{ fontSize: '24px', fontWeight: '800', margin: '0 0 8px 0', lineHeight: 1.2 }}>{track.name}</h2>
                                            <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.6)', margin: 0 }}>{track.artists.map(a => a.name).join(', ')}</p>
                                            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '4px', marginBottom: '12px' }}>
                                                {track?.album?.name || 'Unknown Album'} • {track?.album?.release_date?.substring(0, 4) || '----'}
                                            </p>

                                            {/* Popularity */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: 0.6, marginBottom: '8px' }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>whatshot</span>
                                                <div style={{ width: '100px', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                                                    <div style={{ width: `${track?.popularity || 0}%`, height: '100%', background: '#1DB954' }} />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Audio Analysis Stats */}
                                        {audioFeatures && (
                                            <div style={{ display: 'flex', gap: '24px', marginBottom: '32px', background: 'rgba(255,255,255,0.05)', padding: '16px 24px', borderRadius: '16px', backdropFilter: 'blur(10px)' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '18px', fontWeight: '800', fontFamily: 'monospace' }}>{Math.round(audioFeatures.tempo)}</span>
                                                    <span style={{ fontSize: '10px', opacity: 0.5 }}>BPM</span>
                                                </div>
                                                <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '18px', fontWeight: '800' }}>{formatKey(audioFeatures.key, audioFeatures.mode)}</span>
                                                    <span style={{ fontSize: '10px', opacity: 0.5 }}>KEY</span>
                                                </div>
                                                <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />
                                                <StatRing value={audioFeatures.danceability} label="DANCE" color="#1DB954" />
                                                <StatRing value={audioFeatures.energy} label="NRG" color="#FFB157" />
                                            </div>
                                        )}

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
                                            <button onClick={() => handlePlayback('prev')} style={{ background: 'none', border: 'none', color: 'white', opacity: 0.7 }}><span className="material-symbols-outlined" style={{ fontSize: '48px' }}>skip_previous</span></button>
                                            <button onClick={() => handlePlayback('toggle')} style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'white', border: 'none', color: 'black', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 30px rgba(255,255,255,0.3)' }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: '40px' }}>{isPlaying ? 'pause' : 'play_arrow'}</span>
                                            </button>
                                            <button onClick={() => handlePlayback('next')} style={{ background: 'none', border: 'none', color: 'white', opacity: 0.7 }}><span className="material-symbols-outlined" style={{ fontSize: '48px' }}>skip_next</span></button>
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ opacity: 0.5, textAlign: 'center', padding: '40px' }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: '64px', marginBottom: '16px' }}>music_off</span>
                                        <div>Waiting for Spotify...</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        // ================= CONTROLS TAB =================
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                            {/* Device Chips */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {devices.map(d => (
                                    <button key={d.deviceId} onClick={() => onToggleDevice(d.deviceId)}
                                        style={{
                                            padding: '8px 16px', borderRadius: '100px', fontSize: '13px',
                                            background: selectedDeviceIds.includes(d.deviceId) ? '#1DB954' : 'rgba(255,255,255,0.08)',
                                            color: selectedDeviceIds.includes(d.deviceId) ? 'white' : 'rgba(255,255,255,0.6)',
                                            border: selectedDeviceIds.includes(d.deviceId) ? '1px solid #1DB954' : '1px solid rgba(255,255,255,0.1)',
                                            transition: 'all 0.2s'
                                        }}>
                                        {d.deviceName}
                                    </button>
                                ))}
                            </div>

                            {/* Power Toggle */}
                            <button onClick={togglePower} disabled={activeDevices.length === 0}
                                style={{
                                    width: '100%', padding: '24px', borderRadius: '24px',
                                    background: power ? '#1DB954' : 'rgba(255,255,255,0.05)',
                                    color: 'white', border: 'none', fontSize: '20px', fontWeight: 'bold',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px',
                                    boxShadow: power ? '0 10px 40px rgba(29, 185, 84, 0.3)' : 'none',
                                    transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                                }}>
                                <span className="material-symbols-outlined" style={{ fontSize: '32px' }}>power_settings_new</span>
                                {power ? 'Turn Off' : 'Turn On'}
                            </button>

                            {/* Sliders Block */}
                            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '24px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                {/* Brightness */}
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', fontSize: '14px', fontWeight: '600', opacity: 0.8 }}>
                                        <span>Brightness</span><span>{brightness}%</span>
                                    </div>
                                    <input type="range" min="1" max="100" value={brightness} onChange={(e) => setBrightness(parseInt(e.target.value))}
                                        style={{ width: '100%', height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', outline: 'none' }}
                                        className="custom-range"
                                    />
                                </div>
                            </div>

                            {/* Color Block */}
                            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '24px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', padding: '4px' }}>
                                    <button onClick={() => setActiveTab('color')} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: activeTab === 'color' ? 'rgba(255,255,255,0.15)' : 'transparent', color: 'white', fontWeight: '600', fontSize: '14px' }}>RGB</button>
                                    <button onClick={() => setActiveTab('white')} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: activeTab === 'white' ? 'rgba(255,255,255,0.15)' : 'transparent', color: 'white', fontWeight: '600', fontSize: '14px' }}>White</button>
                                </div>

                                {activeTab === 'color' ? (
                                    <>
                                        <div style={{ height: '280px', width: '100%', borderRadius: '16px', overflow: 'hidden' }}>
                                            <HexColorPicker color={color} onChange={setColor} style={{ width: '100%', height: '100%' }} />
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 8px' }}>
                                            {['#ff0000', '#00ff00', '#0000ff', '#ffffff', '#ff00ff', '#ffff00', '#1DB954'].map(c => (
                                                <button key={c} onClick={() => setColor(c)} style={{ width: '40px', height: '40px', borderRadius: '50%', background: c, border: color === c ? '3px solid white' : '1px solid rgba(255,255,255,0.1)' }} />
                                            ))}
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ padding: '40px 0' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', fontSize: '12px', opacity: 0.5 }}>
                                            <span>Warm (2700K)</span><span>Cool (6500K)</span>
                                        </div>
                                        <div style={{ position: 'relative', height: '40px', display: 'flex', alignItems: 'center' }}>
                                            <div style={{ position: 'absolute', left: 0, right: 0, height: '16px', borderRadius: '8px', background: 'linear-gradient(to right, #ffb157, #ffffff, #d6e4ff)' }} />
                                            <input type="range" min="2700" max="6500" step="100" value={colorTemp} onChange={(e) => setColorTemp(parseInt(e.target.value))} style={{ width: '100%', position: 'relative', zIndex: 1, opacity: 0.8 }} />
                                        </div>
                                        <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '24px', fontWeight: 'bold' }}>{colorTemp}K</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* 3. FLOATING BOTTOM NAV */}
                <div style={{
                    position: 'absolute', bottom: '30px', left: '50%', transform: 'translateX(-50%)',
                    width: '90%', maxWidth: '360px', height: '70px',
                    background: 'rgba(20,20,20,0.85)', backdropFilter: 'blur(20px)',
                    borderRadius: '100px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-evenly',
                    border: '1px solid rgba(255,255,255,0.1)',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
                    zIndex: 20
                }}>
                    <button onClick={() => setMobileTab('visual')} style={{ background: 'transparent', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', color: mobileTab === 'visual' ? '#1DB954' : 'rgba(255,255,255,0.4)', transition: 'all 0.2s' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '28px', fontVariationSettings: "'FILL' 1" }}>music_note</span>
                        <span style={{ fontSize: '10px', fontWeight: '600' }}>Visuals</span>
                    </button>

                    <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)' }} />

                    <button onClick={() => setMobileTab('control')} style={{ background: 'transparent', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', color: mobileTab === 'control' ? '#1DB954' : 'rgba(255,255,255,0.4)', transition: 'all 0.2s' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '28px', fontVariationSettings: "'FILL' 1" }}>tv_remote</span>
                        <span style={{ fontSize: '10px', fontWeight: '600' }}>Remote</span>
                    </button>
                </div>

            </div>
        );
    }

    // ====================================================================================
    //                                  DESKTOP LAYOUT (Legacy)
    // ====================================================================================

    // Helper functions for desktop...
    const renderVisualPanel = () => (
        <div className="card flex-1" style={{
            flex: '1.5',
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
            {/* Inner Glow */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                background: autoSync ? `radial-gradient(circle at 50% 50%, rgba(29, 185, 84, 0.1) 0%, transparent 70%)` : 'none',
                zIndex: 0,
                pointerEvents: 'none'
            }} />

            {/* Content Layer */}
            <div style={{ zIndex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: '24px' }}>


                {spotifyToken ? (
                    <>
                        {track ? (
                            <div className="animate-in flex-col" style={{ flex: 1, gap: '20px', justifyContent: 'space-between', height: '100%' }}>

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
                                    <div style={{ fontSize: '14px', opacity: 0.5, marginTop: '4px', textAlign: 'center' }}>
                                        {track?.album?.name || 'Unknown Album'} ({track?.album?.release_date?.substring(0, 4) || '----'})
                                    </div>

                                    {/* Popularity */}
                                    <div className="flex-row" style={{ alignItems: 'center', gap: '8px', justifyContent: 'center', marginTop: '8px', opacity: 0.7 }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>local_fire_department</span>
                                        <div style={{ width: '80px', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                                            <div style={{ width: `${track?.popularity || 0}%`, height: '100%', background: '#1DB954' }} />
                                        </div>
                                    </div>

                                    {/* Desktop Stats */}
                                    {audioFeatures && (
                                        <div className="flex-row" style={{ justifyContent: 'center', gap: '32px', marginTop: '24px', opacity: 0.8 }}>
                                            <div className="flex-col" style={{ alignItems: 'center' }}>
                                                <span style={{ fontSize: '24px', fontWeight: '300' }}>{Math.round(audioFeatures.tempo)}</span>
                                                <span style={{ fontSize: '10px', letterSpacing: '2px', opacity: 0.5 }}>BPM</span>
                                            </div>
                                            <div className="flex-col" style={{ alignItems: 'center' }}>
                                                <span style={{ fontSize: '24px', fontWeight: '300' }}>{formatKey(audioFeatures.key, audioFeatures.mode)}</span>
                                                <span style={{ fontSize: '10px', letterSpacing: '2px', opacity: 0.5 }}>KEY</span>
                                            </div>
                                            <div style={{ width: '1px', height: '40px', background: 'rgba(255,255,255,0.1)' }} />
                                            <div className="flex-col" style={{ alignItems: 'center', gap: '4px' }}>
                                                <div style={{ width: '60px', height: '4px', background: '#333', borderRadius: '2px', overflow: 'hidden' }}>
                                                    <div style={{ width: `${audioFeatures.energy * 100}%`, height: '100%', background: '#ffb157' }} />
                                                </div>
                                                <span style={{ fontSize: '9px', opacity: 0.5 }}>ENERGY</span>
                                            </div>
                                            <div className="flex-col" style={{ alignItems: 'center', gap: '4px' }}>
                                                <div style={{ width: '60px', height: '4px', background: '#333', borderRadius: '2px', overflow: 'hidden' }}>
                                                    <div style={{ width: `${audioFeatures.valence * 100}%`, height: '100%', background: '#69b4ff' }} />
                                                </div>
                                                <span style={{ fontSize: '9px', opacity: 0.5 }}>MOOD</span>
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex-row" style={{ gap: '48px', marginTop: '24px', justifyContent: 'center', width: '100%' }}>
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
                    <div className="flex-col" style={{ alignItems: 'center', gap: '32px', flex: 1, justifyContent: 'center' }}>
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
                )}
            </div>
        </div>
    );

    const renderControlsPanel = () => (
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
            gap: '24px',
        }}>
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
                                    <div style={{ position: 'absolute', left: 0, right: 0, height: '8px', borderRadius: '8px', background: 'linear-gradient(to right, #ffb157, #ffffff, #d6e4ff)' }} />
                                    <input
                                        type="range"
                                        min="2700" max="6500" step="100"
                                        value={colorTemp}
                                        onChange={(e) => setColorTemp(parseInt(e.target.value))}
                                        style={{ width: '100%', position: 'relative', zIndex: 1, opacity: 0.8 }}
                                        className="custom-range" // requires no-style inputs css
                                    />
                                </div>
                                <div style={{ textAlign: 'center', fontSize: '20px', fontWeight: 'bold' }}>{colorTemp}K</div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>

            {/* Ambient Background (Global) */}
            <div style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden', background: '#050505' }}>
                <div className="aurora-blob" style={{ top: '-40%', left: '-20%', width: '80vw', height: '80vw', backgroundColor: color, opacity: 0.25, filter: 'blur(120px)', animationDuration: '30s' }} />
                <div className="aurora-blob" style={{ bottom: '-40%', right: '-20%', width: '80vw', height: '80vw', backgroundColor: color, opacity: 0.15, filter: 'blur(120px)', animationDuration: '40s', animationDirection: 'reverse' }} />
                {/* Noise texture for "premium" feel */}
                <div style={{ position: 'absolute', inset: 0, background: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'0 0 2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.8\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")', opacity: 0.03, pointerEvents: 'none' }} />
            </div>

            {/* Desktop Navbar (if needed) */}
            {!isMobile && (
                <div style={{
                    height: '60px', padding: '0 32px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    zIndex: 10,
                    WebkitAppRegion: 'drag' // Allow dragging window
                }}>
                    <div style={{ fontSize: '24px', fontWeight: '700', fontFamily: 'Quicksand, sans-serif', letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <img src="./src/assets/logo.png" style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
                        <span>SpotiBot</span>
                    </div>
                    <div style={{ display: 'flex', gap: '16px', WebkitAppRegion: 'no-drag' /* Buttons clickable */ }}>
                        <button onClick={fetchStatus} className="btn-icon" style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}>
                            <span className="material-symbols-outlined">refresh</span>
                        </button>
                        <button onClick={onOpenSettings} className="btn-icon" style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}>
                            <span className="material-symbols-outlined">settings</span>
                        </button>
                    </div>
                </div>
            )}

            {/* MAIN LAYOUT */}
            <div className="flex-row" style={{ gap: '24px', flex: 1, minHeight: 0, alignItems: 'stretch', padding: isMobile ? 0 : '0 32px 32px 32px', zIndex: 1 }}>

                {/* Visual Panel */}
                {renderVisualPanel()}

                {/* Controls Panel */}
                {renderControlsPanel()}

            </div>
        </div>
    );
}
