import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getRedirectUri } from '../lib/spotify';

export function SettingsPanel({
    onClose, onSave, theme, onThemeChange, accentColor = '#1DB954',
    onShowTutorial, multiColorMode, onMultiColorModeChange,
    onStartScreenSync, onRefreshDevices
}) {
    const { t, i18n } = useTranslation();
    const [token, setToken] = useState(localStorage.getItem('switchbot_token') || '');
    const [secret, setSecret] = useState(localStorage.getItem('switchbot_secret') || '');
    const [spotifyClientId, setSpotifyClientId] = useState(localStorage.getItem('spotify_client_id') || '');
    const [spotifyClientSecret, setSpotifyClientSecret] = useState(localStorage.getItem('spotify_client_secret') || '');
    const [confirmReset, setConfirmReset] = useState(false);

    useEffect(() => {
        // Load existing
        const storedToken = localStorage.getItem('switchbot_token');
        const storedSecret = localStorage.getItem('switchbot_secret');
        const storedSpotifyClientId = localStorage.getItem('spotify_client_id');

        if (storedToken) setToken(storedToken);
        if (storedSecret) setSecret(storedSecret);

        if (storedSpotifyClientId) {
            setSpotifyClientId(storedSpotifyClientId);
        } else {
            setSpotifyClientId('e617f1ec1e874124a3f147b9b6e3182f');
        }
    }, []);

    const handleSave = () => {
        const cleanClientId = spotifyClientId.trim();
        localStorage.setItem('switchbot_token', token);
        localStorage.setItem('switchbot_secret', secret);
        localStorage.setItem('spotify_client_id', cleanClientId);
        localStorage.setItem('spotify_client_secret', spotifyClientSecret);
        onSave(token, secret, cleanClientId, spotifyClientSecret);
    };

    const updateTheme = (key, value) => {
        if (onThemeChange) {
            onThemeChange({ ...theme, [key]: value });
        }
    };

    const changeLanguage = (lng) => {
        i18n.changeLanguage(lng);
    };

    return (
        <div className="glass-panel animate-in" style={{
            width: '320px',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            borderRadius: '24px',
            border: '1px solid var(--glass-border)',
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(var(--backdrop-blur))',
            WebkitBackdropFilter: 'blur(var(--backdrop-blur))',
            boxSizing: 'border-box'
        }}>
            <div className="flex-row justify-between" style={{ padding: '20px 24px', borderBottom: '1px solid var(--glass-border)' }}>
                <h2 className="title" style={{ fontSize: '20px', margin: 0 }}>{t('settings.title')}</h2>
                <button className="btn-icon" onClick={onClose} style={{ color: 'var(--text-secondary)' }}>
                    <span className="material-symbols-outlined">close</span>
                </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                <div className="flex-col animate-in" style={{ gap: '24px' }}>

                    {/* --- Connection Settings --- */}
                    <div className="flex-col" style={{ gap: '16px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 'bold', opacity: 0.7, letterSpacing: '1px' }}>
                            {t('settings.tabs.connection')}
                        </div>

                        {/* SwitchBot Config */}
                        <div className="flex-col" style={{ gap: '12px' }}>
                            <div className="flex-row justify-between align-center">
                                <span style={{ fontSize: '14px', fontWeight: '500' }}>{t('settings.switchbot.title')}</span>
                                <a href="https://github.com/OpenWonderLabs/SwitchBotAPI#getting-started" target="_blank"
                                    style={{ fontSize: '11px', color: accentColor, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    {t('settings.switchbot.getKey')} <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>open_in_new</span>
                                </a>
                            </div>
                            <div className="flex-col" style={{ gap: '4px' }}>
                                <label style={{ fontSize: '11px', opacity: 0.5 }}>{t('settings.switchbot.token')}</label>
                                <input type="password" value={token} onChange={e => setToken(e.target.value)} className="input-field" placeholder="Token" style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white', fontSize: '12px' }} />
                            </div>
                            <div className="flex-col" style={{ gap: '4px' }}>
                                <label style={{ fontSize: '11px', opacity: 0.5 }}>{t('settings.switchbot.secret')}</label>
                                <input type="password" value={secret} onChange={e => setSecret(e.target.value)} className="input-field" placeholder="Secret" style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white', fontSize: '12px' }} />
                            </div>
                            {onRefreshDevices && (
                                <button className="btn-secondary" onClick={() => { handleSave(); onRefreshDevices(); }} style={{ marginTop: '8px', padding: '8px', background: 'rgba(255,255,255,0.1)', color: 'white', borderRadius: '8px', border: '1px solid var(--glass-border)', fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.2)'} onMouseLeave={(e) => e.target.style.background = 'rgba(255,255,255,0.1)'}>
                                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>refresh</span>
                                    {t('settings.switchbot.refresh') || "Refresh Devices"}
                                </button>
                            )}
                        </div>

                        {/* Spotify Config */}
                        <div className="flex-col" style={{ gap: '12px' }}>
                            <div className="flex-row justify-between align-center">
                                <span style={{ fontSize: '14px', fontWeight: '500' }}>{t('settings.spotify.title')}</span>
                                <a href="https://developer.spotify.com/dashboard" target="_blank"
                                    style={{ fontSize: '11px', color: accentColor, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    {t('settings.spotify.dashboard')} <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>open_in_new</span>
                                </a>
                            </div>
                            <div className="flex-col" style={{ gap: '4px' }}>
                                <label style={{ fontSize: '11px', opacity: 0.5 }}>{t('settings.spotify.clientId')}</label>
                                <input type="text" value={spotifyClientId} onChange={e => setSpotifyClientId(e.target.value)} className="input-field" placeholder="Client ID" style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: 'white', fontSize: '12px' }} />
                            </div>

                            {/* Redirect URI Display */}
                            <div className="flex-col" style={{ gap: '4px', marginTop: '4px' }}>
                                <label style={{ fontSize: '11px', opacity: 0.5 }}>Redirect URI (Register in Spotify Dashboard)</label>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <div style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.05)', color: accentColor, fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 'monospace' }}>
                                        {getRedirectUri()}
                                    </div>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(getRedirectUri());
                                            alert('Redirect URI copied to clipboard!');
                                        }}
                                        style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '6px', borderRadius: '6px', display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                                        title="Copy to clipboard"
                                    >
                                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>content_copy</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <button className="btn-primary" onClick={handleSave} style={{ width: '100%', background: accentColor }}>
                            {t('settings.save')}
                        </button>
                    </div>

                    <div style={{ height: '1px', background: 'var(--glass-border)', margin: '8px 0' }} />

                    {/* --- Appearance Settings --- */}
                    <div className="flex-col" style={{ gap: '16px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 'bold', opacity: 0.7, letterSpacing: '1px' }}>
                            {t('settings.tabs.appearance')}
                        </div>

                        {/* Screen Sync Trigger */}
                        {(window.electronAPI || (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia)) && (
                            <div className="setting-group" style={{ marginTop: '8px' }}>
                                <button
                                    onClick={onStartScreenSync}
                                    style={{
                                        width: '100%',
                                        padding: '16px',
                                        borderRadius: '16px',
                                        background: 'rgba(255,255,255,0.05)',
                                        border: '1px solid var(--glass-border)',
                                        color: 'white',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                >
                                    <div className="flex-row align-center" style={{ gap: '12px', display: 'flex', alignItems: 'center' }}>
                                        <span className="material-symbols-outlined" style={{ color: accentColor }}>desktop_windows</span>
                                        <div className="flex-col" style={{ alignItems: 'flex-start', display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{t('controls.tabs.screen')}</span>
                                            <span style={{ fontSize: '10px', opacity: 0.5 }}>Sync lights with your screen</span>
                                        </div>
                                    </div>
                                    <span className="material-symbols-outlined" style={{ fontSize: '20px', opacity: 0.3 }}>chevron_right</span>
                                </button>
                            </div>
                        )}

                        {/* Language Selection */}
                        <div className="setting-group">
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', fontWeight: 'bold', letterSpacing: '1px', opacity: 0.7 }}>
                                {t('settings.language')}
                            </label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    onClick={() => changeLanguage('en')}
                                    className={i18n.language === 'en' ? 'active' : ''}
                                    style={{
                                        flex: 1,
                                        padding: '8px',
                                        borderRadius: '8px',
                                        border: i18n.language === 'en' ? '1px solid var(--primary-color)' : '1px solid var(--glass-border)',
                                        background: i18n.language === 'en' ? 'rgba(29, 185, 84, 0.2)' : 'transparent',
                                        color: 'white',
                                        cursor: 'pointer'
                                    }}
                                >
                                    English
                                </button>
                                <button
                                    onClick={() => changeLanguage('ja')}
                                    className={i18n.language === 'ja' ? 'active' : ''}
                                    style={{
                                        flex: 1,
                                        padding: '8px',
                                        borderRadius: '8px',
                                        border: i18n.language === 'ja' ? '1px solid var(--primary-color)' : '1px solid var(--glass-border)',
                                        background: i18n.language === 'ja' ? 'rgba(29, 185, 84, 0.2)' : 'transparent',
                                        color: 'white',
                                        cursor: 'pointer'
                                    }}
                                >
                                    日本語
                                </button>
                            </div>
                        </div>

                        {/* Multi Color Mode Toggle */}
                        <div style={{ marginTop: '8px', padding: '16px', borderRadius: '16px', background: multiColorMode ? 'rgba(29, 185, 84, 0.1)' : 'rgba(255,255,255,0.05)', border: multiColorMode ? `1px solid ${accentColor}40` : '1px solid rgba(255,255,255,0.1)', transition: 'all 0.3s ease' }}>
                            <div className="flex-row justify-between align-center">
                                <div className="flex-col">
                                    <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{t('settings.appearance.multiColorMode')}</span>
                                    <span style={{ fontSize: '10px', opacity: 0.5 }}>{t('settings.appearance.multiColorModeDesc')}</span>
                                </div>
                                <button onClick={() => onMultiColorModeChange(!multiColorMode)} style={{ width: '40px', height: '20px', borderRadius: '10px', background: multiColorMode ? accentColor : 'rgba(255,255,255,0.2)', position: 'relative', border: 'none', transition: 'all 0.2s' }}>
                                    <div style={{ position: 'absolute', top: '2px', left: multiColorMode ? '22px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                                </button>
                            </div>
                        </div>

                        {/* Theme Controls */}
                        <div className="flex-col" style={{ gap: '8px' }}>
                            <div className="flex-row justify-between" style={{ fontSize: '12px' }}>
                                <span>{t('settings.appearance.glassEffect')}</span>
                                <span style={{ opacity: 0.5 }}>{theme.blurStrength}px</span>
                            </div>
                            <input type="range" min="0" max="60" value={theme.blurStrength} onChange={(e) => updateTheme('blurStrength', parseInt(e.target.value))} className="custom-slider" style={{ width: '100%', height: '4px' }} />
                        </div>

                        <div className="flex-col" style={{ gap: '8px' }}>
                            <div className="flex-row justify-between" style={{ fontSize: '12px' }}>
                                <span>{t('settings.appearance.auroraIntensity')}</span>
                                <span style={{ opacity: 0.5 }}>{Math.round(theme.auroraOpacity * 100)}%</span>
                            </div>
                            <input type="range" min="0" max="100" value={theme.auroraOpacity * 100} onChange={(e) => updateTheme('auroraOpacity', parseInt(e.target.value) / 100)} className="custom-slider" style={{ width: '100%', height: '4px' }} />
                        </div>

                        <div className="flex-col" style={{ gap: '8px' }}>
                            <div className="flex-row justify-between" style={{ fontSize: '12px' }}>
                                <span>{t('settings.appearance.animationSpeed')}</span>
                                <span style={{ opacity: 0.5 }}>{theme.animationSpeed}s</span>
                            </div>
                            <input type="range" min="5" max="60" step="5" value={theme.animationSpeed} onChange={(e) => updateTheme('animationSpeed', parseInt(e.target.value))} className="custom-slider" style={{ width: '100%', height: '4px' }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', opacity: 0.4 }}><span>Fast</span><span>Slow</span></div>
                        </div>

                        {/* Toggles */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div className="flex-row justify-between align-center">
                                <span style={{ fontSize: '13px' }}>{t('settings.appearance.dynamicAccent')}</span>
                                <button onClick={() => updateTheme('useDynamicAccent', !theme.useDynamicAccent)} style={{ width: '40px', height: '20px', borderRadius: '10px', background: theme.useDynamicAccent ? accentColor : 'rgba(255,255,255,0.2)', position: 'relative', border: 'none', transition: 'all 0.2s' }}>
                                    <div style={{ position: 'absolute', top: '2px', left: theme.useDynamicAccent ? '22px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                                </button>
                            </div>
                            <div className="flex-row justify-between align-center">
                                <span style={{ fontSize: '13px' }}>{t('settings.appearance.showLogo')}</span>
                                <button onClick={() => updateTheme('showLogo', !theme.showLogo)} style={{ width: '40px', height: '20px', borderRadius: '10px', background: theme.showLogo ? accentColor : 'rgba(255,255,255,0.2)', position: 'relative', border: 'none', transition: 'all 0.2s' }}>
                                    <div style={{ position: 'absolute', top: '2px', left: theme.showLogo ? '22px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                                </button>
                            </div>
                            <div className="flex-row justify-between align-center">
                                <span style={{ fontSize: '13px' }}>{t('settings.appearance.filmGrain')}</span>
                                <button onClick={() => updateTheme('noiseEnabled', !theme.noiseEnabled)} style={{ width: '40px', height: '20px', borderRadius: '10px', background: theme.noiseEnabled ? accentColor : 'rgba(255,255,255,0.2)', position: 'relative', border: 'none', transition: 'all 0.2s' }}>
                                    <div style={{ position: 'absolute', top: '2px', left: theme.noiseEnabled ? '22px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                                </button>
                            </div>
                        </div>

                        {/* Reset Settings Button */}
                        <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--glass-border)' }}>
                            <button
                                onClick={() => {
                                    if (onShowTutorial) {
                                        onShowTutorial();
                                        onClose();
                                    }
                                }}
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    borderRadius: '12px',
                                    border: '1px solid var(--glass-border)',
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    color: 'var(--text-secondary)',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    fontWeight: '500',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    marginBottom: '12px'
                                }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>help</span>
                                Show Tutorial
                            </button>

                            {!confirmReset ? (
                                <button
                                    onClick={() => setConfirmReset(true)}
                                    style={{
                                        width: '100%',
                                        padding: '12px',
                                        borderRadius: '12px',
                                        border: '1px solid rgba(255, 100, 100, 0.3)',
                                        background: 'rgba(255, 0, 0, 0.1)',
                                        color: '#ff6b6b',
                                        cursor: 'pointer',
                                        fontSize: '13px',
                                        fontWeight: 'bold',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.target.style.background = 'rgba(255, 0, 0, 0.2)';
                                        e.target.style.border = '1px solid rgba(255, 100, 100, 0.5)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.target.style.background = 'rgba(255, 0, 0, 0.1)';
                                        e.target.style.border = '1px solid rgba(255, 100, 100, 0.3)';
                                    }}
                                >
                                    {t('settings.reset')}
                                </button>
                            ) : (
                                <div className="flex-col animate-in" style={{ gap: '12px', padding: '12px', borderRadius: '12px', background: 'rgba(255, 0, 0, 0.05)', border: '1px solid rgba(255, 100, 100, 0.2)' }}>
                                    <p style={{ fontSize: '12px', color: '#ff6b6b', textAlign: 'center', margin: 0, fontWeight: '500' }}>
                                        {t('settings.resetConfirm')}
                                    </p>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            onClick={() => setConfirmReset(false)}
                                            style={{
                                                flex: 1,
                                                padding: '8px',
                                                borderRadius: '8px',
                                                border: '1px solid var(--glass-border)',
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                color: 'var(--text-secondary)',
                                                cursor: 'pointer',
                                                fontSize: '12px'
                                            }}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={() => {
                                                onThemeChange({
                                                    blurStrength: 20,
                                                    noiseEnabled: true,
                                                    auroraOpacity: 0.6,
                                                    animationSpeed: 20,
                                                    useDynamicAccent: false,
                                                    showLogo: true
                                                });
                                                setConfirmReset(false);
                                            }}
                                            style={{
                                                flex: 1,
                                                padding: '8px',
                                                borderRadius: '8px',
                                                border: 'none',
                                                background: '#ff6b6b',
                                                color: 'white',
                                                cursor: 'pointer',
                                                fontSize: '12px',
                                                fontWeight: 'bold'
                                            }}
                                        >
                                            Reset
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
