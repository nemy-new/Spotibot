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
        if (storedSpotifyClientId) setSpotifyClientId(storedSpotifyClientId);
    }, []);

    const handleSave = () => {
        localStorage.setItem('switchbot_token', token);
        localStorage.setItem('switchbot_secret', secret);
        localStorage.setItem('spotify_client_id', spotifyClientId);
        onSave(token, secret, spotifyClientId, null);
        onClose();
    };

    return (
        <div className="modal-overlay">
            <div className="card animate-in" style={{ width: '100%', maxWidth: '350px' }}>
                <h2 className="title">API Settings</h2>

                <div className="flex-col">
                    <label style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Open Token</label>
                    <input
                        type="password"
                        placeholder="Paste your Token here"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                    />
                </div>

                <div className="flex-col">
                    <label style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Secret Key (Optional)</label>
                    <input
                        type="password"
                        placeholder="Paste your Secret Key here (if you have one)"
                        value={secret}
                        onChange={(e) => setSecret(e.target.value)}
                    />
                </div>

                <hr style={{ borderColor: 'var(--glass-border)', margin: '16px 0', width: '100%' }} />

                <div className="flex-col">
                    <label style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Spotify Client ID</label>
                    <input
                        type="text"
                        placeholder="For syncing music colors"
                        value={spotifyClientId}
                        onChange={(e) => setSpotifyClientId(e.target.value)}
                    />
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
