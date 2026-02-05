import React, { useState, useEffect, useRef } from 'react';
import { HexColorPicker } from 'react-colorful';
import { switchbotApi } from '../lib/switchbot';
import { spotifyApi } from '../lib/spotify';
import { extractColorFromImage, getPixelColorFromImage } from '../utils/color';
import { useScreenSync } from '../hooks/useScreenSync';
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

    // Spotify / Sync State
    const [track, setTrack] = useState(null);
    const [autoSync, setAutoSync] = useState(true);
    const [isPlaying, setIsPlaying] = useState(false);

    // UI Mode
    const isMobile = useIsMobile();
    const [mobileTab, setMobileTab] = useState('visual'); // 'visual' | 'control'
    const [syncMode, setSyncMode] = useState('spotify'); // 'spotify' | 'screen'
    const [isCinemaMode, setIsCinemaMode] = useState(false); // Desktop only feature really

    // Screen Sync Hook
    const { startShare, stopShare, isSharing, stream, extractedColor, debugInfo, videoRef } = useScreenSync();

    // --- SYNC LOGIC (Same as before) ---
    const lastCommandTime = useRef(0);
    const colorDebounceTimer = useRef(null);

    // 1. Handle Extracted Color (Auto Sync)
    useEffect(() => {
        if (isSharing && extractedColor) {
            if (extractedColor !== color) {
                setColor(extractedColor);
            }
            const now = Date.now();
            if (now - lastCommandTime.current > 1500) {
                lastCommandTime.current = now;
                const r = parseInt(extractedColor.slice(1, 3), 16);
                const g = parseInt(extractedColor.slice(3, 5), 16);
                const b = parseInt(extractedColor.slice(5, 7), 16);
                const parameter = `${r}:${g}:${b}`;

                if (activeDevices.length > 0 && token && secret) {
                    const validDevices = activeDevices.filter(d => {
                        if (offlineDevices.current.has(d.deviceId)) {
                            if (now < offlineDevices.current.get(d.deviceId)) return false;
                            offlineDevices.current.delete(d.deviceId);
                        }
                        return true;
                    });
                    if (validDevices.length === 0) return;

                    Promise.all(validDevices.map(async (d) => {
                        try {
                            await switchbotApi.sendCommand(token, secret, d.deviceId, 'setColor', parameter);
                        } catch (e) {
                            if (e.message && e.message.includes("offline")) {
                                offlineDevices.current.set(d.deviceId, Date.now() + 60000);
                            }
                        }
                    }));
                }
            }
        }
    }, [extractedColor, isSharing, activeDevices, token, secret]);

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
        } catch (e) { console.error(e); }
    };

    // 3. Spotify Polling
    useEffect(() => {
        let interval;
        if (autoSync && power && syncMode === 'spotify' && spotifyToken) {
            interval = setInterval(() => syncWithSpotify(true), 5000);
        }
        return () => clearInterval(interval);
    }, [autoSync, spotifyToken, track?.id, syncMode, power]);

    // Logic Helpers
    const syncWithSpotify = async (silent = false) => {
        if (syncMode !== 'spotify') return;
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
            await Promise.all(activeDevices.map(d => switchbotApi.sendCommand(token, secret, d.deviceId, power ? 'turnOff' : 'turnOn')));
            setPower(!power);
        } catch (err) { alert("Failed to toggle power"); } finally { setLoading(false); }
    };

    // Debouncers
    useDebounce(async () => {
        if (activeDevices.length === 0) return;
        await Promise.all(activeDevices.map(d => switchbotApi.sendCommand(token, secret, d.deviceId, 'setBrightness', brightness.toString()))).catch(console.error);
    }, 500, [brightness, activeDevices]);

    useDebounce(async () => {
        if (activeDevices.length === 0 || activeTab !== 'white') return;
        await Promise.all(activeDevices.map(d => switchbotApi.sendCommand(token, secret, d.deviceId, 'setColorTemperature', colorTemp.toString()))).catch(console.error);
    }, 500, [colorTemp, activeTab, activeDevices]);

    // Manual Color (Debounced)
    useEffect(() => {
        if (activeDevices.length === 0 || activeTab !== 'color' || syncMode === 'screen') return;
        if (colorDebounceTimer.current) clearTimeout(colorDebounceTimer.current);

        colorDebounceTimer.current = setTimeout(async () => {
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            const validDevices = activeDevices.filter(d => !offlineDevices.current.has(d.deviceId) || Date.now() > offlineDevices.current.get(d.deviceId));
            if (validDevices.length === 0) return;

            await Promise.all(validDevices.map(d => switchbotApi.sendCommand(token, secret, d.deviceId, 'setColor', `${r}:${g}:${b}`))).catch(console.error);
        }, 500);

        return () => clearTimeout(colorDebounceTimer.current);
    }, [color, activeTab, activeDevices, syncMode]);


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

                            {/* Source Switcher */}
                            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '100px', padding: '4px' }}>
                                <button onClick={() => { setSyncMode('spotify'); if (isSharing) stopShare(); }}
                                    style={{ padding: '8px 24px', borderRadius: '100px', border: 'none', background: syncMode === 'spotify' ? 'rgba(29, 185, 84, 0.2)' : 'transparent', color: syncMode === 'spotify' ? '#1DB954' : 'rgba(255,255,255,0.5)', fontWeight: '600', fontSize: '14px', transition: 'all 0.2s' }}>
                                    Spotify
                                </button>
                                <button onClick={() => setSyncMode('screen')}
                                    style={{ padding: '8px 24px', borderRadius: '100px', border: 'none', background: syncMode === 'screen' ? 'rgba(64, 158, 255, 0.2)' : 'transparent', color: syncMode === 'screen' ? '#409eff' : 'rgba(255,255,255,0.5)', fontWeight: '600', fontSize: '14px', transition: 'all 0.2s' }}>
                                    Screen
                                </button>
                            </div>

                            {/* Content Display */}
                            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                {syncMode === 'spotify' ? (
                                    track ? (
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
                                            </div>

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
                                    )
                                ) : (
                                    // Screen Sync
                                    <div style={{ width: '100%', aspectRatio: '16/9', background: '#000', borderRadius: '16px', overflow: 'hidden', position: 'relative', border: '1px solid rgba(255,255,255,0.1)' }}>
                                        <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'contain', display: isSharing ? 'block' : 'none' }} />
                                        {!isSharing && (
                                            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: '48px', opacity: 0.5 }}>desktop_windows</span>
                                                <button onClick={startScreenShare} className="btn-primary" style={{ padding: '12px 24px', fontSize: '14px' }}>Start Casting</button>
                                            </div>
                                        )}
                                        {isSharing && <button onClick={stopScreenShare} style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', padding: '8px 20px', background: 'rgba(255,0,0,0.8)', color: 'white', border: 'none', borderRadius: '100px', fontWeight: 'bold', fontSize: '12px' }}>STOP SYNC</button>}
                                        {isSharing && <div style={{ position: 'absolute', top: 12, left: 12, fontSize: '10px', fontFamily: 'monospace', color: '#0f0', background: 'rgba(0,0,0,0.5)', padding: '2px 6px', borderRadius: '4px' }}>{debugInfo}</div>}
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
    //                                  DESKTOP LAYOUT (Refactored)
    // ====================================================================================

    // 1. Visual Panel (Left Side)
    const renderVisualPanelContainer = () => (
        <div className="card" style={{
            flex: '2.5', // More importance to visuals
            padding: '40px',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            background: 'var(--glass-bg)',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: '32px',
            boxShadow: '0 30px 60px rgba(0,0,0,0.2)'
        }}>
            {/* Source Switcher */}
            <div style={{ position: 'absolute', top: 32, right: 32, display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '100px', padding: '4px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <button onClick={() => { setSyncMode('spotify'); if (isSharing) stopShare(); }}
                    style={{ padding: '8px 20px', borderRadius: '100px', border: 'none', background: syncMode === 'spotify' ? 'rgba(29, 185, 84, 0.2)' : 'transparent', color: syncMode === 'spotify' ? '#1DB954' : 'rgba(255,255,255,0.5)', fontWeight: '600', fontSize: '12px', transition: 'all 0.2s', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>music_note</span> Spotify
                </button>
                <button onClick={() => setSyncMode('screen')}
                    style={{ padding: '8px 20px', borderRadius: '100px', border: 'none', background: syncMode === 'screen' ? 'rgba(64, 158, 255, 0.2)' : 'transparent', color: syncMode === 'screen' ? '#409eff' : 'rgba(255,255,255,0.5)', fontWeight: '600', fontSize: '12px', transition: 'all 0.2s', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>desktop_mac</span> Screen
                </button>
            </div>

            {syncMode === 'spotify' ? (
                track ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '32px', width: '100%', maxWidth: '500px' }}>

                        {/* Album Art with Glass Effect */}
                        <div style={{ position: 'relative', width: '100%', aspectRatio: '1/1', borderRadius: '24px', boxShadow: `0 40px 80px -12px ${color || 'rgba(0,0,0,0.5)'}`, transition: 'box-shadow 0.5s ease' }}>
                            <img src={track.album.images[0].url} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '24px' }} onClick={handleArtClick} />

                            {/* Floating Color Badge */}
                            <div style={{
                                position: 'absolute', bottom: -16, left: '50%', transform: 'translateX(-50%)',
                                background: 'rgba(30,30,30,0.8)', backdropFilter: 'blur(12px)',
                                padding: '8px 16px', borderRadius: '100px',
                                display: 'flex', alignItems: 'center', gap: '10px',
                                border: '1px solid rgba(255,255,255,0.1)',
                                boxShadow: '0 10px 20px rgba(0,0,0,0.3)'
                            }} title="Detected Color applied to lights">
                                <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: color, boxShadow: `0 0 10px ${color}` }} />
                                <span style={{ fontSize: '13px', fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: '1px' }}>{color}</span>
                            </div>
                        </div>

                        {/* Track Details */}
                        <div style={{ textAlign: 'center', marginTop: '16px' }}>
                            <h2 style={{ fontSize: '32px', fontWeight: '800', margin: '0 0 8px 0', lineHeight: 1.1 }}>{track.name}</h2>
                            <p style={{ fontSize: '18px', color: 'rgba(255,255,255,0.6)', margin: 0, fontWeight: '500' }}>{track.artists.map(a => a.name).join(', ')}</p>
                        </div>

                        {/* Playback Controls */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '48px', marginTop: '16px' }}>
                            <button onClick={() => handlePlayback('prev')} style={{ background: 'none', border: 'none', color: 'white', opacity: 0.6, cursor: 'pointer', transition: 'opacity 0.2s' }} className="hover-bright"><span className="material-symbols-outlined" style={{ fontSize: '48px' }}>skip_previous</span></button>
                            <button onClick={() => handlePlayback('toggle')} style={{ width: '84px', height: '84px', borderRadius: '50%', background: 'white', border: 'none', color: 'black', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 40px rgba(255,255,255,0.2)', cursor: 'pointer', transition: 'transform 0.1s' }} className="active-scale">
                                <span className="material-symbols-outlined" style={{ fontSize: '42px', marginLeft: isPlaying ? 0 : '4px' }}>{isPlaying ? 'pause' : 'play_arrow'}</span>
                            </button>
                            <button onClick={() => handlePlayback('next')} style={{ background: 'none', border: 'none', color: 'white', opacity: 0.6, cursor: 'pointer', transition: 'opacity 0.2s' }} className="hover-bright"><span className="material-symbols-outlined" style={{ fontSize: '48px' }}>skip_next</span></button>
                        </div>

                    </div>
                ) : (
                    <div style={{ opacity: 0.6, textAlign: 'center' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '64px', marginBottom: '24px' }}>music_off</span>
                        <h3 style={{ fontSize: '24px' }}>Waiting for Spotify...</h3>
                        <p>Play some music to sync your lights.</p>
                    </div>
                )
            ) : (
                // Screen Mode
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '100%', maxWidth: '800px', aspectRatio: '16/9', background: '#000', borderRadius: '24px', overflow: 'hidden', position: 'relative', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 40px 80px rgba(0,0,0,0.5)' }}>
                        <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'contain', display: isSharing ? 'block' : 'none' }} />
                        {!isSharing && (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '24px' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: '64px', opacity: 0.3 }}>desktop_windows</span>
                                <button onClick={startScreenShare} className="btn-primary" style={{ padding: '16px 32px', fontSize: '16px', borderRadius: '100px' }}>Start Screen Mirroring</button>
                            </div>
                        )}
                        {isSharing && <button onClick={stopScreenShare} style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', padding: '10px 32px', background: 'rgba(255,0,0,0.8)', color: 'white', border: 'none', borderRadius: '100px', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>STOP SYNC</button>}
                    </div>
                </div>
            )}
        </div>
    );

    // 2. Control Panel (Right Side)
    const renderControlsPanelContainer = () => (
        <div className="card" style={{
            flex: '1.2', // Fixed simpler width for controls
            minWidth: '380px',
            padding: '32px',
            background: 'rgba(20,20,20,0.6)', backdropFilter: 'blur(40px)', // Darker glass for controls
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '32px',
            display: 'flex', flexDirection: 'column', gap: '32px'
        }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: '14px', fontWeight: '700', letterSpacing: '1px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Control Center</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: activeDevices.length > 0 ? '#1DB954' : '#555' }} />
                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>{activeDevices.length} Connected</span>
                </div>
            </div>

            {/* Target Devices - Grid Layout */}
            <div>
                <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '12px', color: 'rgba(255,255,255,0.7)' }}>Devices</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '10px' }}>
                    {devices.map(d => (
                        <button key={d.deviceId} onClick={() => onToggleDevice(d.deviceId)}
                            style={{
                                padding: '12px', borderRadius: '12px',
                                background: selectedDeviceIds.includes(d.deviceId) ? 'rgba(29, 185, 84, 0.2)' : 'rgba(255,255,255,0.03)',
                                border: selectedDeviceIds.includes(d.deviceId) ? '1px solid #1DB954' : '1px solid rgba(255,255,255,0.05)',
                                color: selectedDeviceIds.includes(d.deviceId) ? 'white' : 'rgba(255,255,255,0.5)',
                                fontSize: '12px', fontWeight: '600',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                                cursor: 'pointer', transition: 'all 0.2s', textAlign: 'center'
                            }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>{d.deviceType.includes('Strip') ? 'linear_scale' : 'lightbulb'}</span>
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{d.deviceName}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Power */}
            <div>
                <button onClick={togglePower} disabled={activeDevices.length === 0}
                    style={{
                        width: '100%', padding: '20px', borderRadius: '16px',
                        background: power ? '#1DB954' : 'rgba(255,255,255,0.05)',
                        color: 'white', border: 'none', fontSize: '16px', fontWeight: 'bold',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
                        cursor: activeDevices.length > 0 ? 'pointer' : 'not-allowed',
                        transition: 'all 0.2s', opacity: activeDevices.length > 0 ? 1 : 0.5,
                        boxShadow: power ? '0 8px 24px rgba(29, 185, 84, 0.3)' : 'none'
                    }}>
                    <span className="material-symbols-outlined">power_settings_new</span>
                    {power ? 'Turn Off' : 'Turn On'}
                </button>
            </div>

            {/* Brightness */}
            <div style={{ opacity: power ? 1 : 0.5, pointerEvents: power ? 'auto' : 'none', transition: 'opacity 0.3s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '13px', fontWeight: '600' }}>
                    <span>Brightness</span><span>{brightness}%</span>
                </div>
                <div style={{ height: '48px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '0 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '18px', opacity: 0.5 }}>brightness_low</span>
                    <input type="range" min="1" max="100" value={brightness} onChange={(e) => setBrightness(parseInt(e.target.value))}
                        style={{ flex: 1, height: '4px', background: `rgba(255,255,255,0.2)`, borderRadius: '2px', outline: 'none', cursor: 'pointer' }} />
                    <span className="material-symbols-outlined" style={{ fontSize: '18px', opacity: 0.5 }}>brightness_high</span>
                </div>
            </div>

            {/* Color/White Picker */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', opacity: power ? 1 : 0.5, pointerEvents: power ? 'auto' : 'none', transition: 'opacity 0.3s' }}>
                <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '12px', marginBottom: '24px' }}>
                    <button onClick={() => setActiveTab('color')} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: activeTab === 'color' ? 'rgba(255,255,255,0.1)' : 'transparent', color: 'white', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>Color</button>
                    <button onClick={() => setActiveTab('white')} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: activeTab === 'white' ? 'rgba(255,255,255,0.1)' : 'transparent', color: 'white', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>White</button>
                </div>

                {activeTab === 'color' ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div style={{ flex: 1, maxHeight: '200px', borderRadius: '16px', overflow: 'hidden' }}>
                            <HexColorPicker color={color} onChange={setColor} style={{ width: '100%', height: '100%' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            {['#ff0000', '#00ff00', '#0000ff', '#ffffff', '#ff00ff', '#ffff00', '#1DB954'].map(c => (
                                <button key={c} onClick={() => setColor(c)} style={{ width: '32px', height: '32px', borderRadius: '50%', background: c, border: color === c ? '2px solid white' : '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', transform: color === c ? 'scale(1.2)' : 'scale(1)', transition: 'transform 0.2s' }} />
                            ))}
                        </div>
                    </div>
                ) : (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '20px 0' }}>
                        <div style={{ position: 'relative', height: '48px', display: 'flex', alignItems: 'center' }}>
                            <div style={{ position: 'absolute', left: 0, right: 0, height: '12px', borderRadius: '8px', background: 'linear-gradient(to right, #ffb157, #ffffff, #d6e4ff)' }} />
                            <input type="range" min="2700" max="6500" step="100" value={colorTemp} onChange={(e) => setColorTemp(parseInt(e.target.value))} style={{ width: '100%', position: 'relative', zIndex: 1, opacity: 0.8, cursor: 'pointer', margin: 0 }} className="custom-slider" />
                        </div>
                        <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '24px', fontWeight: 'bold' }}>{colorTemp}K</div>
                        <div style={{ textAlign: 'center', fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginTop: '8px' }}>Temperature</div>
                    </div>
                )}
            </div>

        </div>
    );


    // ==========================================
    //            DESKTOP MAIN RETURN
    // ==========================================
    return (
        <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            color: 'white',
            overflow: 'hidden'
        }}>

            {/* Ambient Background (Global) */}
            <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: '#050505' }}>
                <div className="aurora-blob" style={{ top: '-20%', left: '-10%', width: '60vw', height: '60vw', backgroundColor: color, opacity: 0.25, filter: 'blur(120px)', animationDuration: '30s' }} />
                <div className="aurora-blob" style={{ bottom: '-20%', right: '-10%', width: '60vw', height: '60vw', backgroundColor: color, opacity: 0.15, filter: 'blur(120px)', animationDuration: '40s', animationDirection: 'reverse' }} />
                <div style={{ position: 'absolute', inset: 0, background: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'0 0 2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.8\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")', opacity: 0.02, pointerEvents: 'none' }} />
            </div>

            {/* Desktop Navbar */}
            <div style={{
                height: '80px', padding: '0 40px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                zIndex: 10,
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.4), transparent)'
            }}>
                <div style={{ fontSize: '24px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#1DB954', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'black' }}>graphic_eq</span>
                    </div>
                    <span>SpotiBot</span>
                </div>

                <div style={{ display: 'flex', gap: '16px' }}>
                    <button onClick={fetchStatus} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.2s' }} className="hover-bg">
                        <span className="material-symbols-outlined">refresh</span>
                    </button>
                    <button onClick={onOpenSettings} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.2s' }} className="hover-bg">
                        <span className="material-symbols-outlined">settings</span>
                    </button>
                </div>
            </div>

            {/* Content Container (Centered) */}
            <div style={{
                flex: 1,
                width: '100%', maxWidth: '1400px', margin: '0 auto',
                padding: '0 40px 40px 40px',
                display: 'flex', gap: '32px',
                zIndex: 1
            }}>
                {renderVisualPanelContainer()}
                {renderControlsPanelContainer()}
            </div>

        </div>
    );
}
