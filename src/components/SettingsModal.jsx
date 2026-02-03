import React, { useState, useEffect } from 'react';

export function SettingsModal({ onClose, onSave }) {
    const [token, setToken] = useState('');
    const [secret, setSecret] = useState('');
    const [spotifyClientId, setSpotifyClientId] = useState('');

    useEffect(() => {
        // Load existing
        const storedToken = localStorage.getItem('switchbot_token');
        const storedSecret = localStorage.getItem('switchbot_secret');
        const storedSpotifyClientId = localStorage.getItem('spotify_client_id');

        if (storedToken) setToken(storedToken);
        if (storedSecret) setSecret(storedSecret);

        // Use stored ID if available, otherwise use default hardcoded ID
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
        onSave(token, secret, cleanClientId, null);
        onClose();
    };

    return (
        <div className="modal-overlay">
            <div className="card animate-in" style={{ width: '100%', maxWidth: '350px' }}>
                <h2 className="title" style={{ marginBottom: '8px' }}>API Settings</h2>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: '1.4' }}>
                    This app requires a <strong>SwitchBot API Token</strong> to control your devices.
                </p>

                <div className="flex-col">
                    <label style={{ fontSize: '14px', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>SwitchBot Token</span>
                        <a href="https://support.switch-bot.com/hc/en-us/articles/12822710195351-How-to-obtain-a-Token-and-Secret-Key" target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: 'var(--primary-color)' }}>How to get?</a>
                    </label>
                    <input
                        type="password"
                        placeholder="Paste your Token here"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                    />
                    <p style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        SwitchBot App → Profile → Preferences → Tap 'App Version' 10 times → Developer Options
                    </p>
                </div>

                <div className="flex-col">
                    <label style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>SwitchBot Client Secret</label>
                    <input
                        type="password"
                        placeholder="Paste your Secret Key here"
                        value={secret}
                        onChange={(e) => setSecret(e.target.value)}
                    />
                </div>

                <hr style={{ borderColor: 'var(--glass-border)', margin: '20px 0', width: '100%' }} />

                <div className="flex-col">
                    <label style={{ fontSize: '14px', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Spotify Client ID</span>
                        <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: 'var(--primary-color)' }}>Open Dashboard</a>
                    </label>
                    <input
                        type="text"
                        placeholder="For syncing music colors"
                        value={spotifyClientId}
                        onChange={(e) => setSpotifyClientId(e.target.value)}
                    />
                    <p style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Required for music sync. Create an app in Spotify Dashboard to get one.
                    </p>
                </div>

                <button className="btn-primary w-full" onClick={handleSave}>
                    Save Credentials
                </button>

                <button
                    style={{ background: 'transparent', color: 'var(--text-secondary)', marginTop: '8px' }}
                    onClick={onClose}
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}
