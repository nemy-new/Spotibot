import React, { useState, useEffect } from 'react';
import { SettingsModal } from './components/SettingsModal';
import { ColorController } from './components/ColorController';
import { switchbotApi } from './lib/switchbot';
import { spotifyApi } from './lib/spotify';

function App() {
  const [token, setToken] = useState(localStorage.getItem('switchbot_token') || '');
  const [secret, setSecret] = useState(localStorage.getItem('switchbot_secret') || '');
  const [spotifyClientId, setSpotifyClientId] = useState(localStorage.getItem('spotify_client_id') || '');
  const [spotifyClientSecret, setSpotifyClientSecret] = useState(localStorage.getItem('spotify_client_secret') || '');
  const [spotifyToken, setSpotifyToken] = useState(localStorage.getItem('spotify_access_token') || '');

  const [devices, setDevices] = useState([]);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState(() => {
    const saved = localStorage.getItem('selected_device_ids');
    return saved ? JSON.parse(saved) : [];
  });
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Handle Spotify Auth (Implicit Grant)
  useEffect(() => {
    const hash = spotifyApi.getTokenFromUrl();
    window.location.hash = "";
    const _token = hash.access_token;

    if (_token) {
      setSpotifyToken(_token);
      localStorage.setItem('spotify_access_token', _token);
      // Clean URL hash
      window.history.pushState({}, document.title, window.location.pathname);
    }
  }, []);

  // Fetch devices when token/secret changes
  useEffect(() => {
    if (token) {
      fetchDevices();
    }
  }, [token, secret]);

  const handleSaveSettings = (newToken, newSecret, newSpotifyClientId, newSpotifyClientSecret) => {
    setToken(newToken);
    setSecret(newSecret);
    setSpotifyClientId(newSpotifyClientId);
    setSpotifyClientSecret(newSpotifyClientSecret);
  };

  const fetchDevices = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await switchbotApi.getDevices(token, secret);
      const relevantDevices = data.deviceList.filter(d =>
        d.deviceType.includes('Light') || d.deviceType.includes('Bulb') || d.deviceType.includes('Strip')
      );

      setDevices(relevantDevices);

      // Auto-select first if none selected
      if (relevantDevices.length > 0 && selectedDeviceIds.length === 0) {
        handleDeviceToggle(relevantDevices[0].deviceId);
      }
    } catch (err) {
      setError('Failed to load devices.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeviceToggle = (id) => {
    setSelectedDeviceIds(prev => {
      const next = prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id];
      localStorage.setItem('selected_device_ids', JSON.stringify(next));
      return next;
    });
  };

  const selectedDevices = devices.filter(d => selectedDeviceIds.includes(d.deviceId));

  return (
    <div className="container">
      {/* Header - Compact */}
      <header className="flex-row justify-between" style={{ padding: '0 8px', marginBottom: '16px' }}>
        <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 800, opacity: 0.8 }}>
          <span style={{ color: 'var(--primary-color)' }}>Spoti</span>Bot
        </h1>
        <button className="btn-icon" onClick={() => setShowSettings(true)} style={{ width: '40px', height: '40px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>settings</span>
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-col animate-in" style={{ flex: 1, minHeight: 0, overflow: 'hidden', gap: '16px' }}>
        {!token ? (
          <div className="card" style={{ textAlign: 'center', justifyContent: 'center', height: '100%' }}>
            <p>Welcome! Please configure your SwitchBot API credentials to get started.</p>
            <button className="btn-primary" onClick={() => setShowSettings(true)}>
              Open Settings
            </button>
          </div>
        ) : (
          <>
            {error && (
              <div style={{ background: 'rgba(255,0,0,0.2)', color: '#ff6b6b', padding: '12px', borderRadius: '8px', fontSize: '14px' }}>
                {error}
              </div>
            )}

            {loading && <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Loading...</div>}

            {/* Always Render ColorController if devices exist (it handles selection now) */}
            {devices.length > 0 ? (
              <div style={{ flex: 1, minHeight: 0 }}>
                <ColorController
                  devices={devices}
                  selectedDeviceIds={selectedDeviceIds}
                  onToggleDevice={handleDeviceToggle}
                  token={token}
                  secret={secret}
                  spotifyToken={spotifyToken}
                  spotifyClientId={spotifyClientId}
                  onOpenSettings={() => setShowSettings(true)}
                />
              </div>
            ) : (
              !loading && (
                <div className="card" style={{ flex: 1, justifyContent: 'center', alignItems: 'center', opacity: 0.5 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '64px', marginBottom: '16px' }}>search_off</span>
                  <div>
                    No lights found directly. Please check your SwitchBot configuration.
                  </div>
                </div>
              )
            )}
          </>
        )}
      </main>


      {/* Settings Modal */}
      {
        showSettings && (
          <SettingsModal
            onClose={() => setShowSettings(false)}
            onSave={handleSaveSettings}
          />
        )
      }
    </div >
  );
}

export default App;
