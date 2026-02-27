import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { HexColorPicker } from 'react-colorful';
import { switchbotApi } from '../lib/switchbot';
import { spotifyApi, getRedirectUri } from '../lib/spotify';
import { extractColorFromImage, extractPaletteFromImage, getPixelColorFromImage, rgbToHsl, hslToRgb } from '../utils/color';
import { useIsMobile } from '../hooks/useIsMobile';
import logo from '../assets/logo.png';

const useDebounce = (effect, delay, deps) => {
    useEffect(() => {
        const handler = setTimeout(() => effect(), delay);
        return () => clearTimeout(handler);
    }, [...deps || [], delay]);
};

export function ColorController({
    devices,
    selectedDeviceIds,
    onToggleDevice,
    token,
    secret,
    spotifyToken,
    spotifyClientId,
    onOpenSettings,
    onTokenExpired,
    theme,
    onAccentColorChange,
    showSettings,
    settingsPanel,
    onShowTutorial,
    multiColorMode,
    setMultiColorMode,
    activeTab,
    setActiveTab,
    pickerTrigger
}) {
    const { t } = useTranslation();
    // Filter active devices
    const activeDevices = devices.filter(d => selectedDeviceIds.includes(d.deviceId));
    const offlineDevices = useRef(new Map());

    // State
    const [power, setPower] = useState(true);
    const [brightness, setBrightness] = useState(100);
    const [color, setColor] = useState("#ffffff");
    const [colorTemp, setColorTemp] = useState(4000);
    const [loading, setLoading] = useState(false);
    const [deviceColorMapping, setDeviceColorMapping] = useState(() => {
        const saved = localStorage.getItem('spotibot_device_routing');
        return saved ? JSON.parse(saved) : {};
    }); // { deviceId: colorIndex }
    const [currentPalette, setCurrentPalette] = useState([]);
    const [cycleIndex, setCycleIndex] = useState(0);
    const [enableEnergySync, setEnableEnergySync] = useState(() => {
        const saved = localStorage.getItem('spotibot_energy_sync');
        return saved === null ? true : saved === 'true';
    });
    const [enableRhythmicCycle, setEnableRhythmicCycle] = useState(() => {
        const saved = localStorage.getItem('spotibot_rhythmic_cycle');
        return saved === null ? true : saved === 'true';
    });

    // Color Sampler (Album Art)
    const [samplerPositions, setSamplerPositions] = useState(() => {
        const saved = localStorage.getItem('spotibot_sampler_positions');
        return saved ? JSON.parse(saved) : [
            { x: 25, y: 25 }, // Color 1 relative %
            { x: 75, y: 75 }  // Color 2 relative %
        ];
    });
    const [activeSamplerIndex, setActiveSamplerIndex] = useState(null); // Which pointer are we moving?

    // Groups State
    const [groups, setGroups] = useState(() => {
        const saved = localStorage.getItem('spotibot_groups');
        return saved ? JSON.parse(saved) : [];
    });
    const [isCreatingGroup, setIsCreatingGroup] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');

    // Screen Sync State
    const [screenSyncEnabled, setScreenSyncEnabled] = useState(false);
    const [captureSources, setCaptureSources] = useState([]);
    const [selectedSource, setSelectedSource] = useState(null);
    const [showSourcePicker, setShowSourcePicker] = useState(false);
    const screenCaptureInterval = useRef(null);
    const videoRef = useRef(document.createElement('video'));
    const canvasRef = useRef(document.createElement('canvas'));

    // Group Helpers
    const handleCreateGroup = () => {
        if (!newGroupName.trim() || selectedDeviceIds.length === 0) return;
        const newGroup = {
            id: Date.now().toString(),
            name: newGroupName.trim(),
            deviceIds: [...selectedDeviceIds]
        };
        const updatedGroups = [...groups, newGroup];
        setGroups(updatedGroups);
        localStorage.setItem('spotibot_groups', JSON.stringify(updatedGroups));
        setNewGroupName('');
        setIsCreatingGroup(false);
    };

    const handleDeleteGroup = (groupId) => {
        const updatedGroups = groups.filter(g => g.id !== groupId);
        setGroups(updatedGroups);
        localStorage.setItem('spotibot_groups', JSON.stringify(updatedGroups));
    };

    const handleSelectGroup = (groupId) => {
        const group = groups.find(g => g.id === groupId);
        if (group) {
            // Logic: If group is already fully selected, deselect it? 
            // Or just set selection to this group (exclusive)? 
            // Let's make it additive or toggle-like?
            // "One-tap select" usually implies "Switch to this group".
            // Let's implement "Switch to this group" behavior for now.
            onToggleDevice(group.deviceIds, true); // We need to update onToggleDevice to handle bulk set or modify parent to pass a setter
        }
    };

    // Persistence Effects
    useEffect(() => {
        localStorage.setItem('spotibot_multi_color_mode', multiColorMode);
    }, [multiColorMode]);

    useEffect(() => {
        localStorage.setItem('spotibot_energy_sync', enableEnergySync);
    }, [enableEnergySync]);

    useEffect(() => {
        localStorage.setItem('spotibot_rhythmic_cycle', enableRhythmicCycle);
    }, [enableRhythmicCycle]);

    useEffect(() => {
        localStorage.setItem('spotibot_device_routing', JSON.stringify(deviceColorMapping));
    }, [deviceColorMapping]);

    useEffect(() => {
        localStorage.setItem('spotibot_sampler_positions', JSON.stringify(samplerPositions));
    }, [samplerPositions]);

    // 6. Mode Switch Transition
    useEffect(() => {
        // Trigger sync immediately whenever mode switches to ensure palette/colors are correct
        syncWithSpotify(true);
    }, [multiColorMode]);

    // Handle remote picker trigger from Settings
    useEffect(() => {
        if (pickerTrigger > 0) {
            if (window.electronAPI) {
                fetchSources().then(() => setShowSourcePicker(true));
            } else {
                startScreenSync();
            }
        }
    }, [pickerTrigger]);

    // Spotify State
    const [track, setTrack] = useState(null);
    const [audioFeatures, setAudioFeatures] = useState(null);
    const [autoSync, setAutoSync] = useState(true);
    const [isPlaying, setIsPlaying] = useState(false);
    // UI Mode
    const isMobile = useIsMobile();
    const [mobileTab, setMobileTab] = useState('visual'); // 'visual' | 'control'

    // Dynamic Accent Color
    const accentColor = theme?.useDynamicAccent && color ? color : '#1DB954';

    // Broadcast Accent Color
    useEffect(() => {
        if (onAccentColorChange) {
            onAccentColorChange(accentColor);
        }
    }, [accentColor, onAccentColorChange]);

    // Helper to get RGB numbers for shadows (e.g. "29, 185, 84")
    const getAccentRgb = () => {
        if (accentColor.startsWith('#')) {
            const r = parseInt(accentColor.slice(1, 3), 16);
            const g = parseInt(accentColor.slice(3, 5), 16);
            const b = parseInt(accentColor.slice(5, 7), 16);
            return `${r}, ${g}, ${b}`;
        }
        return '29, 185, 84';
    };
    const accentRgb = getAccentRgb();

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
    const lastSentCommands = useRef({}); // { deviceId: 'command:param' }
    const colorDebounceTimer = useRef(null);
    const controlActive = useRef(false); // Validates when we can start sending commands
    const failedAudioFeatureTrackIds = useRef(new Set()); // Negative cache for 403s
    const currentTrackId = useRef(null); // Prevents stale state in setInterval closure

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

    const activeDevicesFingerprint = activeDevices.map(d => d.deviceId).sort().join(',');

    // 3. Spotify Polling
    useEffect(() => {
        let interval;
        if (autoSync && power && spotifyToken) {
            interval = setInterval(() => syncWithSpotify(true), 5000);
        }
        return () => clearInterval(interval);
    }, [autoSync, spotifyToken, track?.id, power, multiColorMode, activeDevicesFingerprint, deviceColorMapping, samplerPositions]);

    // 4. Rhythmic Cycling Effect
    useEffect(() => {
        let cycleInterval;
        if (multiColorMode && enableRhythmicCycle && isPlaying && audioFeatures?.tempo) {
            // Calculate BPM-based interval (every 16 beats)
            // If energy is high, make it faster (every 8 beats)
            const bpm = audioFeatures.tempo;
            const energyFactor = audioFeatures.energy || 0.5;
            const beatsPerCycle = energyFactor > 0.7 ? 8 : 16;
            const intervalMs = (60000 / bpm) * beatsPerCycle;

            cycleInterval = setInterval(() => {
                setCycleIndex(prev => prev + 1);
            }, intervalMs);
        }
        return () => clearInterval(cycleInterval);
    }, [multiColorMode, enableRhythmicCycle, isPlaying, audioFeatures?.tempo]);

    // Screen Sync Logic
    const fetchSources = async () => {
        if (!window.electronAPI) return;
        const sources = await window.electronAPI.getSources({ types: ['window', 'screen'], thumbnailSize: { width: 150, height: 150 } });
        setCaptureSources(sources);
    };

    const startScreenSync = async (source = null) => {
        try {
            let stream;
            if (source) {
                // Electron specific behavior
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: {
                        mandatory: {
                            chromeMediaSource: 'desktop',
                            chromeMediaSourceId: source.id,
                            minWidth: 1280,
                            maxWidth: 1280,
                            minHeight: 720,
                            maxHeight: 720
                        }
                    }
                });
            } else {
                // Web standard behavior
                stream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: false
                });
            }

            videoRef.current.srcObject = stream;
            videoRef.current.onloadedmetadata = () => {
                videoRef.current.play();
                setSelectedSource(source || { name: 'Stream' });
                setShowSourcePicker(false);
                setScreenSyncEnabled(true);
                setAutoSync(false); // Disable Spotify sync

                // Start Extraction Loop
                if (screenCaptureInterval.current) clearInterval(screenCaptureInterval.current);
                screenCaptureInterval.current = setInterval(extractColorFromScreen, 2000);
            };

            // Handle browser-specific "Stop sharing" button
            stream.getVideoTracks()[0].onended = () => {
                stopScreenSync();
            };

        } catch (e) {
            console.error('Failed to start screen sync:', e);
            setScreenSyncEnabled(false);
            if (e.name === 'NotAllowedError') {
                alert("Screen capture permission was denied.");
            }
        }
    };

    const stopScreenSync = () => {
        if (screenCaptureInterval.current) clearInterval(screenCaptureInterval.current);
        if (videoRef.current.srcObject) {
            videoRef.current.srcObject.getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
        setScreenSyncEnabled(false);
        setSelectedSource(null);
    };

    const extractColorFromScreen = () => {
        if (!videoRef.current || !canvasRef.current || videoRef.current.paused || videoRef.current.ended) return;

        const canvas = canvasRef.current;
        const video = videoRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        canvas.width = 100; // Small size for performance
        canvas.height = 100;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let r = 0, g = 0, b = 0;

        for (let i = 0; i < imageData.length; i += 4) {
            r += imageData[i];
            g += imageData[i + 1];
            b += imageData[i + 2];
        }

        const count = imageData.length / 4;
        r = Math.floor(r / count);
        g = Math.floor(g / count);
        b = Math.floor(b / count);

        const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');

        // Apply color
        if (activeDevices.length > 0) {
            setColor(hex);
            controlActive.current = true;
            // Throttled send
            activeDevices.forEach(d => {
                const param = `${r}:${g}:${b}`;
                const commandKey = `${d.deviceId}:setColor:${param}`;

                if (lastSentCommands.current[d.deviceId] !== commandKey) {
                    switchbotApi.sendCommand(token, secret, d.deviceId, 'setColor', param)
                        .then(() => {
                            lastSentCommands.current[d.deviceId] = commandKey;
                        })
                        .catch(e => console.warn('Screen sync send failed', e));
                }
            });
        }
    };

    useEffect(() => {
        return () => stopScreenSync();
    }, []);

    // 5. State-Driven Sync (Routing, Samplers, Modes)
    useEffect(() => {
        if (multiColorMode && track) {
            syncWithSpotify(true);
        }
    }, [deviceColorMapping, samplerPositions, enableEnergySync, enableRhythmicCycle, multiColorMode]);

    // Force sync when cycleIndex changes
    useEffect(() => {
        if (multiColorMode && enableRhythmicCycle) {
            syncWithSpotify(true);
        }
    }, [cycleIndex]);

    // Logic Helpers
    const syncWithSpotify = async (silent = false) => {
        if (!spotifyToken) {
            if (!silent) {
                if (!spotifyClientId) { onOpenSettings && onOpenSettings(); return; }
                const redirectUri = getRedirectUri();
                spotifyApi.login(spotifyClientId.trim());
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
            const trackChanged = currentTrackId.current !== data.item.id;

            if (trackChanged) {
                currentTrackId.current = data.item.id;
                setTrack({ ...data.item, isFallback });

                // Fetch Audio Features
                if (!data.item.is_local && !failedAudioFeatureTrackIds.current.has(data.item.id)) {
                    spotifyApi.getAudioFeatures(spotifyToken, data.item.id)
                        .then(features => {
                            if (features) {
                                setAudioFeatures(features);
                            } else {
                                // If null returned (likely 403), cache the failure
                                failedAudioFeatureTrackIds.current.add(data.item.id);
                                setAudioFeatures(null);
                            }
                        })
                        .catch(err => {
                            console.warn("Failed to fetch audio features (possibly restricted):", err);
                            failedAudioFeatureTrackIds.current.add(data.item.id);
                            setAudioFeatures(null);
                        });
                } else {
                    setAudioFeatures(null);
                }
            }

            const imageUrl = data.item.album.images[0]?.url;
            if (imageUrl) {
                if (multiColorMode) {
                    let paletteToUse = null;
                    // Skip palette extraction if we already have it for this track, unless specifically forced or empty
                    if (trackChanged || currentPalette.length === 0) {
                        const positions = Array.isArray(samplerPositions) ? samplerPositions : [{ x: 25, y: 25 }, { x: 75, y: 75 }];
                        console.log("Extracting Multi-Color Palette for:", data.item.name);
                        const manualPalette = await Promise.all(positions.map(async (pos) => {
                            return new Promise((resolve) => {
                                const img = new Image();
                                img.crossOrigin = "Anonymous";
                                img.src = imageUrl;
                                img.onload = () => {
                                    const canvas = document.createElement('canvas');
                                    const ctx = canvas.getContext('2d', { willReadFrequently: true });
                                    canvas.width = img.width;
                                    canvas.height = img.height;
                                    ctx.drawImage(img, 0, 0);
                                    const px = Math.floor((pos.x / 100) * img.width);
                                    const py = Math.floor((pos.y / 100) * img.height);
                                    const pixelData = ctx.getImageData(px, py, 1, 1).data;
                                    const hex = '#' + [pixelData[0], pixelData[1], pixelData[2]]
                                        .map(n => n.toString(16).padStart(2, '0')).join('');
                                    resolve(hex);
                                };
                                img.onerror = () => resolve("#ffffff");
                            });
                        }));

                        let palette = manualPalette;
                        if (!palette || palette.length < 2) {
                            const baseColor = (palette && palette[0]) || '#ffffff';
                            palette = [baseColor, '#ffffff'];
                        }
                        setCurrentPalette(palette);
                        paletteToUse = palette; // Use local variable to avoid React state delay
                    }

                    // Always sync devices if in multiColorMode (handles track changes OR rhythmic cycles)
                    // If we didn't extract above, use the existing state
                    if (!paletteToUse) paletteToUse = currentPalette.length > 0 ? currentPalette : ['#ffffff', '#ffffff'];

                    for (let i = 0; i < activeDevices.length; i++) {
                        const device = activeDevices[i];
                        let colorIndex = i;
                        if (enableRhythmicCycle) {
                            colorIndex = (i + cycleIndex) % paletteToUse.length;
                        } else {
                            colorIndex = i % paletteToUse.length;
                        }

                        if (deviceColorMapping[device.deviceId] !== undefined) {
                            colorIndex = deviceColorMapping[device.deviceId];
                        }

                        const c = paletteToUse[colorIndex % paletteToUse.length];

                        if (device && c) {
                            let r = parseInt(c.slice(1, 3), 16);
                            let g = parseInt(c.slice(3, 5), 16);
                            let b = parseInt(c.slice(5, 7), 16);

                            if (enableEnergySync && audioFeatures?.energy) {
                                const energy = audioFeatures.energy;
                                const energyFactor = 0.5 + (energy * 0.5);
                                let [h, s, l] = rgbToHsl(r, g, b);
                                if (energy > 0.6) {
                                    const satBoost = (energy - 0.6) * 0.75;
                                    s = Math.min(1, s + satBoost);
                                } else if (energy < 0.3) {
                                    s = Math.max(0, s - 0.2);
                                }
                                [r, g, b] = hslToRgb(h, s, l);
                                // Note: Brightness modulation is handled in the command side usually, 
                                // but we can't easily modulate brightness without a separate command or HSB support.
                                // For now we keep it simple.
                            }

                            const param = `${r}:${g}:${b}`;
                            const commandKey = `${device.deviceId}:setColor:${param}`;

                            if (lastSentCommands.current[device.deviceId] !== commandKey) {
                                switchbotApi.sendCommand(token, secret, device.deviceId, 'setColor', param)
                                    .then(() => {
                                        lastSentCommands.current[device.deviceId] = commandKey;
                                    })
                                    .catch(e => console.warn(`Failed to set multicolor for ${device.deviceName}`, e));
                            }
                        }
                    }
                } else if (trackChanged || !color) {
                    const domColor = await extractColorFromImage(imageUrl);
                    if (domColor) {
                        setColor(domColor);
                        setActiveTab('color');
                        controlActive.current = true;
                    }
                }
            }
        } else {
            setIsPlaying(false);
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
        const rect = e.currentTarget.getBoundingClientRect();
        const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
        const yPercent = ((e.clientY - rect.top) / rect.height) * 100;

        if (activeSamplerIndex !== null) {
            // Picking Mode
            const newPositions = [...samplerPositions];
            newPositions[activeSamplerIndex] = { x: xPercent, y: yPercent };
            setSamplerPositions(newPositions);
            setActiveSamplerIndex(null); // Finish picking

            // Re-sample immediately
            const hex = await getPixelColorFromImage(
                track.album.images[0].url,
                e.clientX - rect.left,
                e.clientY - rect.top,
                e.currentTarget
            );
            if (hex) {
                const newPalette = [...currentPalette];
                newPalette[activeSamplerIndex] = hex;
                setCurrentPalette(newPalette);
                controlActive.current = true;
            }
        } else {
            // Legacy/Default click: Just set main color
            const hex = await getPixelColorFromImage(
                track.album.images[0].url,
                e.clientX - rect.left,
                e.clientY - rect.top,
                e.currentTarget
            );
            if (hex) {
                setColor(hex);
                setActiveTab('color');
                controlActive.current = true;
            }
        }
    };

    const togglePower = async () => {
        if (activeDevices.length === 0) return;
        setLoading(true);
        controlActive.current = true; // Enable control on user interaction
        try {
            await Promise.all(activeDevices.map(async (d) => {
                const command = power ? 'turnOff' : 'turnOn';
                const commandKey = `${d.deviceId}:${command}`;

                if (lastSentCommands.current[d.deviceId] !== commandKey) {
                    try {
                        await switchbotApi.sendCommand(token, secret, d.deviceId, command);
                        lastSentCommands.current[d.deviceId] = commandKey;
                    } catch (e) {
                        console.warn(`Failed to toggle power for ${d.deviceName}:`, e);
                    }
                }
            }));
            setPower(!power);
        } catch (err) {
            console.error(err);
        } finally { setLoading(false); }
    };

    // Debouncers
    useDebounce(async () => {
        if (activeDevices.length === 0 || multiColorMode) return;
        if (!controlActive.current) return;
        await Promise.all(activeDevices.map(async d => {
            const param = brightness.toString();
            const commandKey = `${d.deviceId}:setBrightness:${param}`;

            if (lastSentCommands.current[d.deviceId] !== commandKey) {
                try {
                    await switchbotApi.sendCommand(token, secret, d.deviceId, 'setBrightness', param);
                    lastSentCommands.current[d.deviceId] = commandKey;
                } catch (e) {
                    console.warn(`Failed to set brightness for ${d.deviceName}`, e);
                }
            }
        }));
    }, 500, [brightness, activeDevices, multiColorMode]);

    useDebounce(async () => {
        if (activeDevices.length === 0 || activeTab !== 'white' || multiColorMode) return;
        if (!controlActive.current) return;
        await Promise.all(activeDevices.map(async d => {
            const param = colorTemp.toString();
            const commandKey = `${d.deviceId}:setColorTemperature:${param}`;

            if (lastSentCommands.current[d.deviceId] !== commandKey) {
                try {
                    await switchbotApi.sendCommand(token, secret, d.deviceId, 'setColorTemperature', param);
                    lastSentCommands.current[d.deviceId] = commandKey;
                } catch (e) {
                    console.warn(`Failed to set temp for ${d.deviceName}`, e);
                }
            }
        })).catch(console.error);
    }, 500, [colorTemp, activeTab, activeDevices, multiColorMode]);

    // Individual Control State
    const [individualControlMode, setIndividualControlMode] = useState(false);
    const [manualDeviceColors, setManualDeviceColors] = useState({});

    // Manual Color (Debounced)
    useEffect(() => {
        if (activeDevices.length === 0 || activeTab !== 'color' || multiColorMode) return;
        if (!controlActive.current) return; // Prevent initial sync echo

        if (colorDebounceTimer.current) clearTimeout(colorDebounceTimer.current);

        colorDebounceTimer.current = setTimeout(async () => {
            const validDevices = activeDevices.filter(d => !offlineDevices.current.has(d.deviceId) || Date.now() > offlineDevices.current.get(d.deviceId));
            if (validDevices.length === 0) return;

            await Promise.all(validDevices.map(async d => {
                try {
                    const r = parseInt(color.slice(1, 3), 16);
                    const g = parseInt(color.slice(3, 5), 16);
                    const b = parseInt(color.slice(5, 7), 16);
                    const param = `${r}:${g}:${b}`;
                    const commandKey = `${d.deviceId}:setColor:${param}`;

                    if (lastSentCommands.current[d.deviceId] !== commandKey) {
                        await switchbotApi.sendCommand(token, secret, d.deviceId, 'setColor', param);
                        lastSentCommands.current[d.deviceId] = commandKey;
                    }
                } catch (e) {
                    console.warn("Color set failed", e);
                }
            }));
        }, 500);

        return () => clearTimeout(colorDebounceTimer.current);
    }, [color, activeTab, activeDevices, multiColorMode]);

    const handleColorChange = (newColor) => {
        setColor(newColor);
        setMultiColorMode(false); // Override auto-sync models
        controlActive.current = true;
    };

    const handleBrightnessChange = (val) => {
        setBrightness(val);
        controlActive.current = true;
    };

    // Preset Helpers
    const applyPreset = (presetColor) => {
        setColor(presetColor);
        setMultiColorMode(false); // Override auto-sync models
        controlActive.current = true;
    };

    const saveCurrentColorAsPreset = () => {
        const newPresets = [color, ...presets].slice(0, 10);
        setPresets(newPresets);
        localStorage.setItem('spotibot_presets', JSON.stringify(newPresets));
    };

    const deletePreset = (idx) => {
        const newPresets = presets.filter((_, i) => i !== idx);
        setPresets(newPresets);
        localStorage.setItem('spotibot_presets', JSON.stringify(newPresets));
    };

    // Drag and Drop Helpers
    const handleDragStart = (e, deviceId) => {
        e.dataTransfer.setData("deviceId", deviceId);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDrop = (e, colorIndex) => {
        e.preventDefault();
        const deviceId = e.dataTransfer.getData("deviceId");
        if (deviceId) {
            setDeviceColorMapping(prev => ({ ...prev, [deviceId]: colorIndex }));
            controlActive.current = true; // Trigger update
            setTimeout(() => syncWithSpotify(true), 200); // Immediate sync to update device
        }
    };

    // ====================================================================================
    //                                  MOBILE LAYOUT
    // ====================================================================================
    // --- PRESET STATE (Moved to top level) ---
    const [presets, setPresets] = useState(() => {
        const saved = localStorage.getItem('spotibot_presets');
        return saved ? JSON.parse(saved) : ['#ff0000', '#00ff00', '#0000ff', '#ffffff', '#ff00ff', '#ffff00', '#1DB954'];
    });
    const [isEditingPresets, setIsEditingPresets] = useState(false);

    const handlePresetClick = (idx) => {
        if (isEditingPresets) {
            // Save mode: overwrites the clicked preset with current color
            const newPresets = [...presets];
            newPresets[idx] = color;
            setPresets(newPresets);
            localStorage.setItem('spotibot_presets', JSON.stringify(newPresets));
            setIsEditingPresets(false); // optimize flow: click -> save -> exit mode
        } else {
            // Normal mode: apply color
            setColor(presets[idx]);
            controlActive.current = true; // Trigger color update
        }
    };

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
                        <span style={{ color: accentColor }}>Spoti</span>Bot
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
                                {screenSyncEnabled ? (
                                    <div style={{
                                        width: '100vw',
                                        aspectRatio: '16/9',
                                        background: '#000',
                                        position: 'relative',
                                        marginBottom: '32px',
                                        boxShadow: `0 20px 60px ${color || 'rgba(0,0,0)'}`
                                    }}>
                                        <video
                                            ref={(el) => {
                                                if (el && videoRef.current.srcObject && el.srcObject !== videoRef.current.srcObject) {
                                                    el.srcObject = videoRef.current.srcObject;
                                                    el.play();
                                                }
                                            }}
                                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                            muted
                                            autoPlay
                                        />
                                        <div style={{
                                            position: 'absolute', bottom: '12px', right: '12px',
                                            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
                                            padding: '4px 10px', borderRadius: '100px',
                                            display: 'flex', alignItems: 'center', gap: '6px',
                                            border: '1px solid rgba(255,255,255,0.1)'
                                        }}>
                                            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color }} />
                                            <span style={{ fontSize: '10px', fontFamily: 'monospace' }}>{color}</span>
                                        </div>
                                    </div>
                                ) : track ? (
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
                                            background: selectedDeviceIds.includes(d.deviceId) ? accentColor : 'rgba(255,255,255,0.08)',
                                            color: selectedDeviceIds.includes(d.deviceId) ? 'white' : 'rgba(255,255,255,0.6)',
                                            border: selectedDeviceIds.includes(d.deviceId) ? `1px solid ${accentColor}` : '1px solid rgba(255,255,255,0.1)',
                                            transition: 'all 0.2s'
                                        }}>
                                        {d.deviceName}
                                    </button>
                                ))}
                            </div>

                            {/* Tab Switcher for Mobile */}
                            <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', padding: '4px' }}>
                                <button onClick={() => setActiveTab('color')} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: activeTab === 'color' ? 'rgba(255,255,255,0.1)' : 'transparent', color: 'white', fontWeight: 'bold', fontSize: '12px' }}>RGB</button>
                                <button onClick={() => setActiveTab('white')} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: activeTab === 'white' ? 'rgba(255,255,255,0.1)' : 'transparent', color: 'white', fontWeight: 'bold', fontSize: '12px' }}>WHITE</button>
                                {(window.electronAPI || (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia)) && (
                                    <button onClick={() => setActiveTab('screen')} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: activeTab === 'screen' ? 'rgba(255,255,255,0.1)' : 'transparent', color: 'white', fontWeight: 'bold', fontSize: '12px' }}>SCREEN</button>
                                )}
                            </div>

                            {/* Power Toggle */}
                            <button onClick={togglePower} disabled={activeDevices.length === 0}
                                style={{
                                    width: '100%', padding: '24px', borderRadius: '24px',
                                    background: power ? accentColor : 'rgba(255,255,255,0.05)',
                                    color: 'white', border: 'none', fontSize: '20px', fontWeight: 'bold',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px',
                                    boxShadow: power ? `0 10px 40px rgba(${accentRgb}, 0.3)` : 'none',
                                    transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                                }}>
                                <span className="material-symbols-outlined" style={{ fontSize: '32px' }}>power_settings_new</span>
                                {power ? 'Turn Off' : 'Turn On'}
                            </button>

                            {/* Content based on Active Tab */}
                            {activeTab === 'screen' ? renderScreenSyncContent() : (
                                <div className="animate-in flex-col" style={{ gap: '32px' }}>
                                    {/* Brightness Section */}
                                    <div className="flex-col" style={{ gap: '16px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 'bold', opacity: 0.7 }}>
                                            <span>Brightness</span>
                                            <span>{brightness}%</span>
                                        </div>
                                        <input type="range" min="1" max="100" value={brightness} onChange={(e) => setBrightness(parseInt(e.target.value))} style={{ width: '100%' }} />
                                    </div>

                                    {activeTab === 'color' && (
                                        <div className="flex-col" style={{ gap: '24px' }}>
                                            <div style={{ height: '300px', width: '100%', borderRadius: '24px', overflow: 'hidden' }}>
                                                <HexColorPicker color={color} onChange={handleColorChange} style={{ width: '100%', height: '100%' }} />
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                                                {presets.map((p, i) => (
                                                    <button key={i} onClick={() => applyPreset(p)} style={{ width: '100%', aspectRatio: '1', borderRadius: '12px', background: p, border: color === p ? '3px solid white' : 'none' }} />
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {activeTab === 'white' && (
                                        <div className="flex-col" style={{ gap: '24px', padding: '20px 0' }}>
                                            <input type="range" min="2700" max="6500" step="100" value={colorTemp} onChange={(e) => setColorTemp(parseInt(e.target.value))} style={{ width: '100%' }} />
                                            <div style={{ textAlign: 'center', fontSize: '24px', fontWeight: 'bold' }}>{colorTemp}K</div>
                                        </div>
                                    )}
                                </div>
                            )}

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
                                    <button onClick={() => setActiveTab('color')} className={activeTab === 'color' ? 'active' : ''} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: activeTab === 'color' ? 'rgba(255,255,255,0.15)' : 'transparent', color: 'white', fontWeight: '600', fontSize: '13px' }}>RGB</button>
                                    <button onClick={() => setActiveTab('white')} className={activeTab === 'white' ? 'active' : ''} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: activeTab === 'white' ? 'rgba(255,255,255,0.15)' : 'transparent', color: 'white', fontWeight: '600', fontSize: '13px' }}>White</button>
                                    {(window.electronAPI || (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia)) && (
                                        <button onClick={() => setActiveTab('screen')} className={activeTab === 'screen' ? 'active' : ''} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: activeTab === 'screen' ? 'rgba(255,255,255,0.15)' : 'transparent', color: 'white', fontWeight: '600', fontSize: '13px' }}>{t('controls.tabs.screen')}</button>
                                    )}
                                </div>

                                {activeTab === 'color' && (
                                    <>
                                        <div style={{ height: '280px', width: '100%', borderRadius: '16px', overflow: 'hidden' }}>
                                            <HexColorPicker color={color} onChange={handleColorChange} style={{ width: '100%', height: '100%' }} />
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 8px' }}>
                                            {['#ff0000', '#00ff00', '#0000ff', '#ffffff', '#ff00ff', '#ffff00', '#1DB954'].map(c => (
                                                <button key={c} onClick={() => applyPreset(c)} style={{ width: '40px', height: '40px', borderRadius: '50%', background: c, border: color === c ? '3px solid white' : '1px solid rgba(255,255,255,0.1)' }} />
                                            ))}
                                        </div>
                                    </>
                                )}

                                {activeTab === 'white' && (
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

                                {activeTab === 'screen' && renderScreenSyncContent()}
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
                    <button onClick={() => setMobileTab('visual')} style={{ background: 'transparent', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', color: mobileTab === 'visual' ? accentColor : 'rgba(255,255,255,0.4)', transition: 'all 0.2s' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '28px', fontVariationSettings: "'FILL' 1" }}>music_note</span>
                        <span style={{ fontSize: '10px', fontWeight: '600' }}>Visuals</span>
                    </button>

                    <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)' }} />

                    <button onClick={() => setMobileTab('control')} style={{ background: 'transparent', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', color: mobileTab === 'control' ? accentColor : 'rgba(255,255,255,0.4)', transition: 'all 0.2s' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '28px', fontVariationSettings: "'FILL' 1" }}>tv_remote</span>
                        <span style={{ fontSize: '10px', fontWeight: '600' }}>Remote</span>
                    </button>
                </div>

            </div >
        );
    }

    const renderScreenSyncContent = () => (
        <div className="animate-in flex-col" style={{ gap: '20px', padding: '10px 0' }}>
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '24px', textAlign: 'center', border: '1px solid var(--glass-border)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '48px', color: screenSyncEnabled ? accentColor : 'white', marginBottom: '16px', display: 'block', opacity: screenSyncEnabled ? 1 : 0.5 }}>
                    {screenSyncEnabled ? 'leak_add' : 'desktop_windows'}
                </span>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '18px' }}>{screenSyncEnabled ? 'Screen Sync Active' : 'Screen Sync Ready'}</h3>
                <p style={{ margin: '0 0 24px 0', fontSize: '13px', opacity: 0.6, lineHeight: '1.5' }}>
                    {screenSyncEnabled
                        ? 'Your lights are currently syncing with your screen content.'
                        : 'Source selected. Start syncing to apply screen colors to your lights.'}
                </p>

                <div className="flex-col" style={{ gap: '12px' }}>
                    {screenSyncEnabled ? (
                        <div className="flex-col" style={{ gap: '12px' }}>
                            <button
                                onClick={stopScreenSync}
                                className="btn-primary"
                                style={{ background: '#ff4b4b', width: '100%', padding: '14px', borderRadius: '12px' }}
                            >
                                Stop Sync
                            </button>
                            <button
                                onClick={() => {
                                    if (window.electronAPI) {
                                        fetchSources().then(() => setShowSourcePicker(true));
                                    } else {
                                        startScreenSync();
                                    }
                                }}
                                style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid var(--glass-border)', background: 'transparent', color: 'white', cursor: 'pointer' }}
                            >
                                Change Source
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => {
                                if (window.electronAPI) {
                                    fetchSources().then(() => setShowSourcePicker(true));
                                } else {
                                    startScreenSync();
                                }
                            }}
                            className="btn-primary"
                            style={{ background: accentColor, width: '100%', padding: '14px', borderRadius: '12px' }}
                        >
                            {window.electronAPI ? 'Select Source' : 'Start Sync'}
                        </button>
                    )}
                </div>
            </div>

            {/* Source Picker Modal (Electron Only) */}
            {showSourcePicker && window.electronAPI && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                    <div className="glass-panel animate-in" style={{ width: '100%', maxWidth: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', borderRadius: '24px', overflow: 'hidden' }}>
                        <div className="flex-row justify-between" style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            <h2 style={{ margin: 0, fontSize: '20px' }}>Select Capture Source</h2>
                            <button onClick={() => setShowSourcePicker(false)} className="btn-icon"><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '16px' }}>
                            {captureSources.map(source => (
                                <button
                                    key={source.id}
                                    onClick={() => {
                                        setSelectedSource(source);
                                        setShowSourcePicker(false);
                                    }}
                                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '12px', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                >
                                    <img src={source.thumbnail} alt={source.name} style={{ width: '100%', borderRadius: '8px', aspectRatio: '16/9', objectFit: 'cover' }} />
                                    <span style={{ fontSize: '11px', color: 'white', fontWeight: '500', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', whiteSpace: 'nowrap' }}>{source.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    // ====================================================================================
    //                                  DESKTOP LAYOUT (Legacy)
    // ====================================================================================

    // Helper functions for desktop...
    const renderVisualPanel = () => (
        <div className="glass-panel animate-in" style={{
            flex: 1,
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            position: 'relative',
            borderRadius: '24px',
            backgroundColor: 'var(--glass-bg)',
            backdropFilter: 'blur(var(--backdrop-blur))',
            WebkitBackdropFilter: 'blur(var(--backdrop-blur))',
            border: theme?.autoSync ? `1px solid rgba(${accentRgb}, 0.5)` : '1px solid var(--glass-border)',
            overflow: 'hidden',
            boxSizing: 'border-box'
        }}>
            {/* Inner Glow (Aurora) */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                background: autoSync ? (
                    multiColorMode && currentPalette.length >= 2 ? (
                        `radial-gradient(circle at 30% 30%, rgba(${parseInt(currentPalette[0].slice(1, 3), 16)}, ${parseInt(currentPalette[0].slice(3, 5), 16)}, ${parseInt(currentPalette[0].slice(5, 7), 16)}, 0.15) 0%, transparent 60%),
                         radial-gradient(circle at 70% 70%, rgba(${parseInt(currentPalette[1].slice(1, 3), 16)}, ${parseInt(currentPalette[1].slice(3, 5), 16)}, ${parseInt(currentPalette[1].slice(5, 7), 16)}, 0.1) 0%, transparent 60%)`
                    ) : (
                        `radial-gradient(circle at 50% 50%, rgba(${accentRgb}, 0.1) 0%, transparent 70%)`
                    )
                ) : 'none',
                zIndex: 0,
                pointerEvents: 'none',
            }} />

            {/* Content Layer */}
            <div style={{ zIndex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: '24px' }}>
                {screenSyncEnabled ? (
                    <div className="animate-in flex-col" style={{ flex: 1, gap: '20px', justifyContent: 'center', height: '100%' }}>
                        <div style={{
                            flex: 1,
                            width: '100%',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            position: 'relative',
                            minHeight: '0'
                        }}>
                            <div
                                className="art-container"
                                style={{
                                    position: 'relative',
                                    height: 'auto',
                                    width: '100%',
                                    aspectRatio: '16/9',
                                    maxHeight: '70vh',
                                    maxWidth: '100%',
                                    borderRadius: '12px',
                                    boxShadow: `0 20px 80px ${color}80`,
                                    overflow: 'hidden',
                                    transition: 'all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)'
                                }}
                            >
                                <video
                                    ref={(el) => {
                                        if (el && videoRef.current.srcObject && el.srcObject !== videoRef.current.srcObject) {
                                            el.srcObject = videoRef.current.srcObject;
                                            el.play();
                                        }
                                    }}
                                    style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
                                    muted
                                    autoPlay
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
                    </div>
                ) : spotifyToken ? (
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
                                    <div
                                        className="art-container"
                                        style={{
                                            position: 'relative',
                                            height: '100%',
                                            width: 'auto',
                                            aspectRatio: '1/1',
                                            maxHeight: '45vh',
                                            maxWidth: '100%',
                                            borderRadius: '12px',
                                            boxShadow: `0 20px 80px ${color}80`,
                                            overflow: 'hidden',
                                            transition: 'all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)'
                                        }}
                                    >
                                        <img
                                            src={track.album.images[0].url}
                                            alt="Album Art"
                                            crossOrigin="Anonymous"
                                            onClick={handleArtClick}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'crosshair', borderRadius: '12px' }}
                                        />

                                        {/* Color 1 Pointer */}
                                        {multiColorMode && currentPalette.length > 0 && (
                                            <div
                                                onClick={(e) => { e.stopPropagation(); setActiveSamplerIndex(0); }}
                                                onDragOver={(e) => e.preventDefault()}
                                                onDrop={(e) => handleDrop(e, 0)}
                                                style={{
                                                    position: 'absolute',
                                                    top: `${samplerPositions[0].y}%`,
                                                    left: `${samplerPositions[0].x}%`,
                                                    transform: 'translate(-50%, -50%)',
                                                    width: '48px', height: '48px', borderRadius: '50%',
                                                    background: currentPalette[0],
                                                    border: activeSamplerIndex === 0 ? `4px solid ${accentColor}` : '4px solid rgba(255,255,255,0.2)',
                                                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    cursor: 'pointer', zIndex: 10,
                                                    transition: 'all 0.2s',
                                                    scale: activeSamplerIndex === 0 ? '1.2' : '1'
                                                }}
                                                title="Color 1 (Click to move, Drop light to route)"
                                            >
                                                <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'rgba(255,255,255,0.8)', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                                                    {activeSamplerIndex === 0 ? 'near_me' : 'colorize'}
                                                </span>
                                            </div>
                                        )}
                                        {/* Color 2 Pointer */}
                                        {multiColorMode && currentPalette.length > 1 && (
                                            <div
                                                onClick={(e) => { e.stopPropagation(); setActiveSamplerIndex(1); }}
                                                onDragOver={(e) => e.preventDefault()}
                                                onDrop={(e) => handleDrop(e, 1)}
                                                style={{
                                                    position: 'absolute',
                                                    top: `${samplerPositions[1].y}%`,
                                                    left: `${samplerPositions[1].x}%`,
                                                    transform: 'translate(-50%, -50%)',
                                                    width: '48px', height: '48px', borderRadius: '50%',
                                                    background: currentPalette[1],
                                                    border: activeSamplerIndex === 1 ? `4px solid ${accentColor}` : '4px solid rgba(255,255,255,0.2)',
                                                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    cursor: 'pointer', zIndex: 10,
                                                    transition: 'all 0.2s',
                                                    scale: activeSamplerIndex === 1 ? '1.2' : '1'
                                                }}
                                                title="Color 2 (Click to move, Drop light to route)"
                                            >
                                                <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'rgba(255,255,255,0.8)', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                                                    {activeSamplerIndex === 1 ? 'near_me' : 'colorize'}
                                                </span>
                                            </div>
                                        )}
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

                                <div className="flex-col" style={{ gap: '4px', width: '100%' }}>
                                    <div style={{ fontSize: '24px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', textAlign: 'center' }}>{track.name}</div>
                                    <div style={{ fontSize: '16px', opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', textAlign: 'center' }}>{track.artists.map(a => a.name).join(', ')}</div>
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
                                        </div>
                                    )}
                                </div>

                                <div className="flex-row" style={{ gap: '48px', marginTop: '24px', justifyContent: 'center', width: '100%' }}>
                                    <button onClick={() => handlePlayback('prev')} className="btn-icon-playback" style={{ opacity: 0.7 }}><span className="material-symbols-outlined" style={{ fontSize: '40px' }}>skip_previous</span></button>
                                    <button onClick={() => handlePlayback('toggle')} className="btn-icon-playback" style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '50%', width: '72px', height: '72px' }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: '48px', color: isPlaying ? accentColor : 'white' }}>{isPlaying ? 'pause' : 'play_arrow'}</span>
                                    </button>
                                    <button onClick={() => handlePlayback('next')} className="btn-icon-playback" style={{ opacity: 0.7 }}><span className="material-symbols-outlined" style={{ fontSize: '40px' }}>skip_next</span></button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ padding: '40px', opacity: 0.8, textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: '64px', marginBottom: '16px' }}>music_off</span>
                                <h3 style={{ margin: '0' }}>Waiting for Spotify...</h3>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex-col" style={{ alignItems: 'center', gap: '32px', flex: 1, justifyContent: 'center' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '80px', opacity: 0.2 }}>music_note</span>
                        <button onClick={() => syncWithSpotify()} className="btn-primary" style={{ background: accentColor, padding: '16px 48px', borderRadius: '100px' }}>Connect Spotify</button>
                    </div>
                )}
            </div>
        </div >
    );
    const renderStandardControls = () => (
        <div className="flex-col animate-in" style={{ gap: '24px', flex: 1, opacity: activeDevices.length === 0 || !power ? 0.4 : 1, transition: 'opacity 0.3s' }}>
            {/* Groups Section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', opacity: 0.5, letterSpacing: '1px' }}>{t('controls.groups')}</span>
                    <button
                        onClick={() => setIsCreatingGroup(!isCreatingGroup)}
                        style={{ background: 'none', border: 'none', color: 'white', opacity: 0.5, cursor: 'pointer', fontSize: '18px', padding: 0, display: 'flex' }}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{isCreatingGroup ? 'close' : 'add'}</span>
                    </button>
                </div>

                {isCreatingGroup && (
                    <div className="animate-in" style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        <input
                            type="text"
                            placeholder={t('controls.groupNamePlaceholder')}
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            style={{
                                flex: 1, background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px',
                                padding: '8px 12px', color: 'white', fontSize: '12px'
                            }}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
                        />
                        <button onClick={handleCreateGroup} style={{ background: accentColor, border: 'none', borderRadius: '8px', padding: '0 12px', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>{t('settings.save')}</button>
                    </div>
                )}

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {groups.map(g => (
                        <div key={g.id} style={{ position: 'relative' }}>
                            <button
                                onClick={() => handleSelectGroup(g.id)}
                                style={{
                                    padding: '6px 12px',
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '100px',
                                    color: 'rgba(255,255,255,0.8)',
                                    fontSize: '11px',
                                    cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    transition: 'all 0.2s',
                                }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: '14px', opacity: 0.7 }}>folder</span>
                                {g.name}
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteGroup(g.id); }}
                                style={{
                                    position: 'absolute', top: -4, right: -4, width: '14px', height: '14px', borderRadius: '50%',
                                    background: 'rgba(0,0,0,0.8)', color: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', fontSize: '8px', opacity: 0.6
                                }}
                            >✕</button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Device List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold', opacity: 0.5, letterSpacing: '1px' }}>{t('controls.devices')}</span>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {devices.map(d => {
                        const isSelected = selectedDeviceIds.includes(d.deviceId);
                        return (
                            <button
                                key={d.deviceId}
                                onClick={() => onToggleDevice(d.deviceId)}
                                style={{
                                    padding: '6px 12px',
                                    background: isSelected ? accentColor : 'transparent',
                                    border: isSelected ? `1px solid ${accentColor}` : '1px solid var(--glass-border)',
                                    borderRadius: '100px',
                                    color: isSelected ? 'white' : 'rgba(255,255,255,0.7)',
                                    fontSize: '11px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    display: 'flex', alignItems: 'center', gap: '6px'
                                }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>{d.deviceType.includes('Strip') ? 'linear_scale' : 'lightbulb'}</span>
                                {d.deviceName}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Brightness Section */}
            <div className="flex-col" style={{ gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 'bold' }}>
                    <span style={{ opacity: 0.6 }}>Brightness</span>
                    <span>{brightness}%</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '18px', opacity: 0.4 }}>brightness_low</span>
                    <div style={{ flex: 1, position: 'relative', height: '32px', display: 'flex', alignItems: 'center' }}>
                        <div style={{ position: 'absolute', width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${brightness}%`, height: '100%', background: accentColor, transition: 'width 0.2s' }} />
                        </div>
                        <input
                            type="range" min="1" max="100" value={brightness}
                            onChange={(e) => handleBrightnessChange(parseInt(e.target.value))}
                            style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 10 }}
                        />
                    </div>
                    <span className="material-symbols-outlined" style={{ fontSize: '18px', opacity: 0.4 }}>brightness_high</span>
                </div>
            </div>

            <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '12px' }}>
                <button onClick={() => setActiveTab('color')} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: activeTab === 'color' ? 'rgba(255,255,255,0.1)' : 'transparent', color: 'white', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>RGB</button>
                <button onClick={() => setActiveTab('white')} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: activeTab === 'white' ? 'rgba(255,255,255,0.1)' : 'transparent', color: 'white', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>WHITE</button>
                {(window.electronAPI || (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia)) && (
                    <button onClick={() => setActiveTab('screen')} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: activeTab === 'screen' ? 'rgba(255,255,255,0.1)' : 'transparent', color: 'white', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>SCREEN</button>
                )}
            </div>

            {activeTab === 'color' && (
                <div className="animate-in flex-col" style={{ gap: '20px' }}>
                    <div style={{ height: '220px', width: '100%', borderRadius: '16px', overflow: 'hidden' }}>
                        <HexColorPicker color={color} onChange={handleColorChange} style={{ width: '100%', height: '100%' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px' }}>
                        {presets.map((p, i) => (
                            <button key={i} onClick={() => applyPreset(p)} style={{ width: '100%', aspectRatio: '1', borderRadius: '8px', background: p, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }} />
                        ))}
                    </div>
                </div>
            )}

            {activeTab === 'white' && (
                <div className="animate-in" style={{ padding: '20px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '11px', opacity: 0.5 }}>
                        <span>Warm</span><span>Cool</span>
                    </div>
                    <input type="range" min="2700" max="6500" step="100" value={colorTemp} onChange={(e) => setColorTemp(parseInt(e.target.value))} style={{ width: '100%' }} />
                    <div style={{ textAlign: 'center', marginTop: '16px', fontWeight: 'bold' }}>{colorTemp}K</div>
                </div>
            )}

            {activeTab === 'screen' && renderScreenSyncContent()}
        </div>
    );

    const renderMultiColorDashboard = () => (
        <div className="flex-col animate-in" style={{ gap: '24px', flex: 1 }}>
            {/* Quick Effects Section */}
            <div style={{ display: 'flex', gap: '12px' }}>
                <label style={{ flex: 1, background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '8px', border: enableEnergySync ? `1px solid ${accentColor}40` : '1px solid transparent' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '20px', color: enableEnergySync ? accentColor : 'rgba(255,255,255,0.3)' }}>bolt</span>
                        <div style={{ width: '20px', height: '10px', background: enableEnergySync ? accentColor : 'rgba(255,255,255,0.1)', borderRadius: '10px', position: 'relative' }}>
                            <div style={{ width: '6px', height: '6px', background: 'white', borderRadius: '50%', position: 'absolute', top: '2px', left: enableEnergySync ? '12px' : '2px', transition: 'all 0.2s' }} />
                        </div>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 'bold' }}>{t('controls.energySync')}</span>
                    <input type="checkbox" checked={enableEnergySync} onChange={(e) => setEnableEnergySync(e.target.checked)} style={{ display: 'none' }} />
                </label>

                <label style={{ flex: 1, background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '8px', border: enableRhythmicCycle ? `1px solid ${accentColor}40` : '1px solid transparent' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '20px', color: enableRhythmicCycle ? accentColor : 'rgba(255,255,255,0.3)' }}>sync</span>
                        <div style={{ width: '20px', height: '10px', background: enableRhythmicCycle ? accentColor : 'rgba(255,255,255,0.1)', borderRadius: '100px', position: 'relative' }}>
                            <div style={{ width: '6px', height: '6px', background: 'white', borderRadius: '50%', position: 'absolute', top: '2px', left: enableRhythmicCycle ? '12px' : '2px', transition: 'all 0.2s' }} />
                        </div>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 'bold' }}>{t('controls.rhythmLoop')}</span>
                    <input type="checkbox" checked={enableRhythmicCycle} onChange={(e) => setEnableRhythmicCycle(e.target.checked)} style={{ display: 'none' }} />
                </label>
            </div>

            {/* Tab Switcher for Live Mode */}
            <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', padding: '4px' }}>
                <button onClick={() => setActiveTab('color')} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: activeTab === 'color' ? 'rgba(255,255,255,0.1)' : 'transparent', color: 'white', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>MULTI-COLOR</button>
                {(window.electronAPI || (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia)) && (
                    <button onClick={() => setActiveTab('screen')} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: activeTab === 'screen' ? 'rgba(255,255,255,0.1)' : 'transparent', color: 'white', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>SCREEN SYNC</button>
                )}
            </div>

            {activeTab === 'screen' ? renderScreenSyncContent() : (
                <div className="animate-in flex-col" style={{ gap: '24px' }}>
                    {/* Manual Color Picker Integration */}
                    <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '16px', padding: '16px', gap: '16px', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 'bold', opacity: 0.5, letterSpacing: '1px' }}>{t('controls.manualPicker')}</span>
                            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.05)' }} />
                        </div>
                        <div style={{ height: '160px', width: '100%', borderRadius: '12px', overflow: 'hidden' }}>
                            <HexColorPicker color={color} onChange={handleColorChange} style={{ width: '100%', height: '100%' }} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
                            {presets.map((p, i) => (
                                <button
                                    key={i}
                                    onClick={() => applyPreset(p)}
                                    style={{ width: '100%', aspectRatio: '1', borderRadius: '6px', background: p, border: color === p ? '1px solid white' : '1px solid transparent', cursor: 'pointer' }}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Palette & Routing Section */}
                    <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '16px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                <span style={{ fontSize: '11px', fontWeight: 'bold', opacity: 0.5, letterSpacing: '1px' }}>{t('controls.paletteSwatches')}</span>
                                <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.05)' }} />
                            </div>
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                {currentPalette.map((c, i) => (
                                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                                        <div
                                            onDragOver={(e) => e.preventDefault()}
                                            onDrop={(e) => handleDrop(e, i)}
                                            style={{
                                                width: '40px', height: '40px', borderRadius: '50%', background: c,
                                                border: '3px solid rgba(255,255,255,0.1)', boxShadow: `0 0 15px ${c}40`
                                            }}
                                        />
                                        <span style={{ fontSize: '9px', fontWeight: 'bold', opacity: 0.5 }}>{t('controls.channel')} {i + 1}</span>
                                    </div>
                                ))}
                            </div>
                            <p style={{ fontSize: '10px', opacity: 0.4, marginTop: '8px', fontStyle: 'italic' }}>{t('controls.dropToRoute')}</p>
                        </div>

                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                <span style={{ fontSize: '11px', fontWeight: 'bold', opacity: 0.5, letterSpacing: '1px' }}>{t('controls.deviceRouting')}</span>
                                <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.05)' }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {activeDevices.map(device => (
                                    <div key={device.deviceId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span style={{ fontSize: '12px', fontWeight: '500' }}>{device.deviceName}</span>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <button
                                                onClick={() => {
                                                    const newMap = { ...deviceColorMapping };
                                                    delete newMap[device.deviceId];
                                                    setDeviceColorMapping(newMap);
                                                    controlActive.current = true;
                                                }}
                                                style={{
                                                    padding: '4px 8px', borderRadius: '6px', border: 'none',
                                                    background: deviceColorMapping[device.deviceId] === undefined ? accentColor : 'rgba(255,255,255,0.1)',
                                                    color: 'white', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer'
                                                }}
                                            >{t('controls.auto')}</button>
                                            {currentPalette.map((c, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => {
                                                        setDeviceColorMapping(prev => ({ ...prev, [device.deviceId]: i }));
                                                        controlActive.current = true;
                                                    }}
                                                    style={{
                                                        width: '24px', height: '24px', borderRadius: '6px',
                                                        background: c, cursor: 'pointer',
                                                        border: deviceColorMapping[device.deviceId] === i ? '2px solid white' : '1px solid transparent',
                                                        transform: deviceColorMapping[device.deviceId] === i ? 'scale(1.1)' : 'scale(1)',
                                                        transition: 'all 0.2s'
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Shared Brightness in Live Mode */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '16px' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '20px', opacity: 0.5 }}>flare</span>
                        <input
                            type="range" min="1" max="100" value={brightness}
                            onChange={(e) => handleBrightnessChange(parseInt(e.target.value))}
                            style={{ flex: 1 }}
                        />
                        <span style={{ fontSize: '12px', fontWeight: 'bold', width: '32px' }}>{brightness}%</span>
                    </div>
                </div>
            )}
        </div>
    );

    const renderControlsPanel = () => {
        return (
            <div className="glass-panel animate-in no-scrollbar" style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: '24px',
                padding: '24px',
                borderRadius: '24px',
                backgroundColor: 'var(--glass-bg)',
                backdropFilter: 'blur(var(--backdrop-blur))',
                WebkitBackdropFilter: 'blur(var(--backdrop-blur))',
                border: '1px solid var(--glass-border)',
                overflowY: 'auto',
                boxSizing: 'border-box',
                position: 'relative'
            }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    {multiColorMode ? renderMultiColorDashboard() : renderStandardControls()}
                </div>

                {/* 3. MASTER POWER (Sticky Bottom) */}
                <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <button
                        onClick={togglePower}
                        disabled={activeDevices.length === 0}
                        style={{
                            height: '64px',
                            borderRadius: '16px',
                            background: power ? accentColor : 'rgba(255,255,255,0.05)',
                            color: power ? 'white' : 'rgba(255,255,255,0.3)',
                            border: 'none',
                            fontSize: '18px', fontWeight: 'bold',
                            cursor: activeDevices.length === 0 ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
                            transition: 'all 0.3s',
                            boxShadow: power ? `0 8px 24px ${accentColor}60` : 'none'
                        }}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>power_settings_new</span>
                        {power ? (activeDevices.length > 0 ? t('controls.lightsOn') : t('controls.noDevices')) : t('controls.lightsOff')}
                    </button>
                </div >

            </div >
        );
    };

    return (
        <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>

            {/* Ambient Background (Global) */}
            <div style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden', background: 'radial-gradient(circle at center, #1a1a1a 0%, #000000 100%)' }}>
                <div className="aurora-blob" style={{ top: '-40%', left: '-20%', width: '80vw', height: '80vw', backgroundColor: color, opacity: theme.auroraOpacity, animationDuration: `${theme.animationSpeed}s`, mixBlendMode: 'normal' }} />
                <div className="aurora-blob" style={{ bottom: '-40%', right: '-20%', width: '80vw', height: '80vw', backgroundColor: color, opacity: theme.auroraOpacity * 0.7, animationName: 'driftAlt', animationDuration: `${theme.animationSpeed * 1.5}s`, animationDirection: 'normal', mixBlendMode: 'normal' }} />
                {/* Noise texture for "premium" feel */}
                <div style={{ position: 'absolute', inset: 0, background: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'0 0 2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.8\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")', opacity: 0.03, pointerEvents: 'none' }} />
            </div>

            {/* Desktop Navbar (if needed) */}
            {!isMobile && (
                <div style={{
                    height: '60px',
                    padding: navigator.platform.toUpperCase().indexOf('MAC') >= 0 && navigator.userAgent.toLowerCase().includes('electron') ? '0 32px 0 100px' : '0 32px', // Conditional padding: Mac Electron only
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    zIndex: 10,
                    WebkitAppRegion: 'drag' // Allow dragging window
                }}>
                    <div style={{ fontSize: '24px', fontWeight: '700', fontFamily: 'Quicksand, sans-serif', letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {theme?.showLogo ? (
                            <>
                                <img src={logo} style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
                                <span>SpotiBot</span>
                            </>
                        ) : <div />}
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
            <div className="flex-row" style={{ flex: 1, width: '100%', minHeight: 0, alignItems: 'stretch', padding: isMobile ? 0 : '0 32px 32px 32px', zIndex: 1, boxSizing: 'border-box' }}>

                {/* Settings Panel (Sidebar) - Animated Wrapper */}
                <div style={{
                    width: showSettings ? '320px' : '0px',
                    opacity: showSettings ? 1 : 0,
                    marginRight: showSettings ? '24px' : '0px',
                    overflow: 'hidden',
                    transition: 'all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)',
                    flexShrink: 0,
                    display: 'flex'
                }}>
                    <div style={{ minWidth: '320px', height: '100%' }}>
                        {settingsPanel}
                    </div>
                </div>

                {/* Visual Panel - Wrapper for margin */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', transition: 'all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
                    {/* Pass style to component or wrap it? renderVisualPanel returns a JSX element.
                         If renderVisualPanel returns a div with flex: 1, we might need to adjust it.
                         Let's see renderVisualPanel implementation.
                         It seems I can't easily wrap it without potentially breaking flex behaviors if it expects to be a direct child.
                         However, looking at line 976 {renderVisualPanel()}, it's a function call.
                         If I change the parent gap to 0, I need to ensure spacing.
                         I'll add a spacer div or margin to the Visual Panel.
                     */}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', marginRight: '24px' }}>
                        {renderVisualPanel()}
                    </div>
                </div>

                {/* Controls Panel */}
                <div style={{
                    width: showSettings ? '320px' : '420px',
                    flexShrink: 0,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)'
                }}>
                    {renderControlsPanel()}
                </div>

            </div>

            {/* Source Picker Modal */}
            {showSourcePicker && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)' }}>
                    <div className="glass-panel animate-in" style={{ width: '80%', maxWidth: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px', background: 'rgba(30,30,30,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px' }}>
                        <div className="flex-row justify-between align-center" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ margin: 0 }}>{t('controls.screen.selectSource')}</h2>
                            <button className="btn-icon" onClick={() => setShowSourcePicker(false)} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '16px', padding: '8px' }}>
                            {captureSources.map(source => (
                                <div key={source.id} onClick={() => startScreenSync(source)} style={{ cursor: 'pointer', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', transition: 'all 0.2s' }}>
                                    <div style={{ aspectRatio: '16/9', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <img src={source.thumbnail.toDataURL()} style={{ maxWidth: '100%', maxHeight: '100%' }} />
                                    </div>
                                    <div style={{ padding: '8px', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>
                                        {source.name}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

