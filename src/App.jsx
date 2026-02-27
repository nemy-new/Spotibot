import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingsPanel } from './components/SettingsPanel';
import { ColorController } from './components/ColorController';
import { TutorialOverlay } from './components/TutorialOverlay'; // Added
import { switchbotApi } from './lib/switchbot';
import { spotifyApi, getRedirectUri } from './lib/spotify';

const DEFAULT_SPOTIFY_CLIENT_ID = 'e617f1ec1e874124a3f147b9b6e3182f';

function App() {
  const { t } = useTranslation();
  const [token, setToken] = useState(localStorage.getItem('switchbot_token') || '');
  const [secret, setSecret] = useState(localStorage.getItem('switchbot_secret') || '');
  const [spotifyClientId, setSpotifyClientId] = useState(localStorage.getItem('spotify_client_id') || DEFAULT_SPOTIFY_CLIENT_ID);
  const [spotifyClientSecret, setSpotifyClientSecret] = useState(localStorage.getItem('spotify_client_secret') || '');
  const [spotifyToken, setSpotifyToken] = useState(localStorage.getItem('spotify_access_token') || '');

  // Shared Accent Color State (lifted from ColorController)
  const [accentColor, setAccentColor] = useState('#1DB954');

  const [devices, setDevices] = useState([]);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState(() => {
    const saved = localStorage.getItem('selected_device_ids');
    return saved ? JSON.parse(saved) : [];
  });
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Tutorial State
  const [showTutorial, setShowTutorial] = useState(() => {
    return !localStorage.getItem('spotibot_tutorial_completed');
  });

  const handleCloseTutorial = () => {
    localStorage.setItem('spotibot_tutorial_completed', 'true');
    setShowTutorial(false);
  };

  const handleResetTutorial = () => {
    setShowTutorial(true);
    setShowSettings(false);
  };

  // Theme State
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('spotibot_theme');
    return saved ? JSON.parse(saved) : {
      blurStrength: 20,
      auroraOpacity: 0.6,
      noiseEnabled: true,
      animationSpeed: 10,
      useDynamicAccent: true,
      showLogo: true
    };
  });

  // Multi Color Mode State
  const [multiColorMode, setMultiColorMode] = useState(() => {
    return localStorage.getItem('multi_color_mode') === 'true';
  });

  // Global Tab State for ColorController
  const [activeTab, setActiveTab] = useState('color');
  const [pickerTrigger, setPickerTrigger] = useState(0); // Added to trigger screen source picker

  // Persist Multi Color Mode
  useEffect(() => {
    localStorage.setItem('multi_color_mode', multiColorMode);
  }, [multiColorMode]);

  // Persist Theme & Apply CSS Variables
  useEffect(() => {
    localStorage.setItem('spotibot_theme', JSON.stringify(theme));

    // Apply to Root
    const root = document.documentElement;
    root.style.setProperty('--aurora-speed', `${theme.animationSpeed}s`);
    root.style.setProperty('--aurora-opacity', theme.auroraOpacity);
    root.style.setProperty('--noise-opacity', theme.noiseEnabled ? 0.05 : 0);
    root.style.setProperty('--backdrop-blur', `${theme.blurStrength}px`);
    root.style.setProperty('--dynamic-accent', accentColor);
    root.style.setProperty('--primary-color', accentColor);

  }, [theme, accentColor]);

  // Handle Spotify Auth (PKCE Flow)
  const processedCode = React.useRef(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (code && processedCode.current !== code) {
      console.log("Debug: Code found, exchanging for token...");
      processedCode.current = code;

      const redirectUri = getRedirectUri();
      console.log("Debug: Exchange Redirect URI used:", redirectUri);

      spotifyApi.getToken(code, spotifyClientId, redirectUri, spotifyClientSecret)
        .then(accessToken => {
          console.log("Debug: Token retrieved!");
          setSpotifyToken(accessToken);
          localStorage.setItem('spotify_access_token', accessToken);
          // Output success message to console
          console.info('Spotify Login Successful');
          // Clean URL
          window.history.pushState({}, document.title, window.location.pathname);
        })
        .catch(err => {
          console.error("PKCE Token Exchange Failed:", err);
          setError("Login failed: " + err.message);
          processedCode.current = null; // Allow retry if failed? Or maybe not.
        });
    }
  }, [spotifyClientId]);

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

  const fetchDevices = async (force = false) => {
    if (loading) return; // Guard against concurrent calls
    setLoading(true);
    setError('');

    try {
      let relevantDevices = [];
      const cached = localStorage.getItem('switchbot_device_cache');
      const cacheTime = localStorage.getItem('switchbot_device_cache_time');
      const now = Date.now();

      // Use cache if not forcing, cache exists, and is less than 24 hours old (86400000 ms)
      if (!force && cached && cacheTime && (now - parseInt(cacheTime) < 86400000)) {
        relevantDevices = JSON.parse(cached);
        console.log("Loaded devices from cache");
      } else {
        console.log("Fetching devices from SwitchBot API...");
        const data = await switchbotApi.getDevices(token, secret);
        relevantDevices = (data.deviceList || []).filter(d =>
          d.deviceType.includes('Light') || d.deviceType.includes('Bulb') || d.deviceType.includes('Strip')
        );
        // Save to cache
        localStorage.setItem('switchbot_device_cache', JSON.stringify(relevantDevices));
        localStorage.setItem('switchbot_device_cache_time', now.toString());
      }

      setDevices(relevantDevices);

      // Auto-select first if none selected
      if (relevantDevices.length > 0 && selectedDeviceIds.length === 0) {
        handleDeviceToggle(relevantDevices[0].deviceId);
      }
    } catch (err) {
      if (err.message?.includes('429') || err.message?.includes('Too Many Requests')) {
        setError('SwitchBot API rate limit reached. Please try again later.');
      } else {
        setError('Failed to load devices.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeviceToggle = (idOrIds, forceSet = false) => {
    setSelectedDeviceIds(prev => {
      let next;
      if (Array.isArray(idOrIds)) {
        // Bulk set (Group selection)
        next = forceSet ? [...idOrIds] : [...prev, ...idOrIds.filter(id => !prev.includes(id))];
        // If forceSet is true, we replace the selection. usage: onToggleDevice(ids, true)
      } else {
        // Single toggle
        next = prev.includes(idOrIds) ? prev.filter(i => i !== idOrIds) : [...prev, idOrIds];
      }
      localStorage.setItem('selected_device_ids', JSON.stringify(next));
      return next;
    });
  };


  return (
    <div className="container">
      {/* Background Effect Layers */}
      <div className="noise-overlay" />

      {/* Aurora Blobs */}
      <div style={{ position: 'fixed', inset: 0, zIndex: -1, overflow: 'hidden', pointerEvents: 'none' }}>
        <div className="aurora-blob" style={{ top: '-10%', left: '-10%', background: accentColor, width: '80vw', height: '80vw', animationDelay: '0s', opacity: 0.8 }} />
        <div className="aurora-blob" style={{ top: '30%', right: '-20%', background: '#00ff88', width: '70vw', height: '70vw', animationDelay: '-5s', opacity: 0.5 }} />
        <div className="aurora-blob" style={{ bottom: '-10%', left: '10%', background: accentColor, width: '75vw', height: '75vw', animationDelay: '-10s', opacity: 0.7 }} />
        <div className="aurora-blob" style={{ bottom: '10%', right: '20%', background: '#ffffff', width: '50vw', height: '50vw', opacity: 0.2, animationDelay: '-15s' }} />
      </div>

      {/* Header - Compact - Only show if ColorController is NOT active (prevent double logo) */}
      {(!token || devices.length === 0) && (
        <header className="flex-row justify-between" style={{ padding: '0 8px', marginBottom: '16px', position: 'relative', zIndex: 1 }}>
          {theme.showLogo ? (
            <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 800, opacity: 0.8 }}>
              <span style={{ color: accentColor }}>Spoti</span>Bot
            </h1>
          ) : <div />}
          <button className="btn-icon" onClick={() => setShowSettings(true)} style={{ width: '40px', height: '40px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>settings</span>
          </button>
        </header>
      )}

      {/* Main Content */}
      <main className="flex-col animate-in" style={{ flex: 1, minHeight: 0, overflow: 'hidden', gap: '16px' }}>
        {!token ? (
          <div className="card" style={{ textAlign: 'center', justifyContent: 'center', height: '100%' }}>
            <p>Welcome! Please configure your SwitchBot API credentials to get started.</p>
            <button className="btn-primary" onClick={() => setShowSettings(true)} style={{ background: accentColor }}>
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

                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
                  pickerTrigger={pickerTrigger}

                  // Multi Color Mode
                  multiColorMode={multiColorMode}
                  setMultiColorMode={setMultiColorMode}

                  // Theme Props
                  theme={theme}
                  onAccentColorChange={setAccentColor}

                  onOpenSettings={() => setShowSettings(prev => !prev)}
                  onTokenExpired={() => setSpotifyToken(null)}

                  // Settings Panel Props
                  showSettings={showSettings}
                  settingsPanel={
                    <SettingsPanel
                      onClose={() => setShowSettings(false)}
                      onSave={handleSaveSettings}
                      theme={theme}
                      onThemeChange={setTheme}
                      accentColor={accentColor}
                      onShowTutorial={handleResetTutorial}
                      multiColorMode={multiColorMode}
                      onMultiColorModeChange={setMultiColorMode}
                      onStartScreenSync={() => {
                        setActiveTab('screen');
                        setPickerTrigger(prev => prev + 1);
                        setShowSettings(false);
                      }}
                      onRefreshDevices={() => fetchDevices(true)}
                    />
                  }
                />
              </div>
            ) : (
              !loading && (
                <div className="card" style={{ flex: 1, justifyContent: 'center', alignItems: 'center', opacity: 0.5 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '64px', marginBottom: '16px' }}>search_off</span>
                  <div>
                    {t('app.noDevices')}
                  </div>
                  <button className="btn-primary" onClick={() => setShowSettings(true)} style={{ background: accentColor, marginTop: '24px' }}>
                    {t('app.openSettings')}
                  </button>
                </div>
              )
            )}
          </>
        )}
      </main>

      {/* Global Settings Panel Overlay (for initial state or no devices) */}
      {showSettings && (devices.length === 0 || !token) && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)'
        }}>
          <SettingsPanel
            onClose={() => setShowSettings(false)}
            onSave={handleSaveSettings}
            theme={theme}
            onThemeChange={setTheme}
            accentColor={accentColor}
            onShowTutorial={handleResetTutorial}
            multiColorMode={multiColorMode}
            onMultiColorModeChange={setMultiColorMode}
            onStartScreenSync={() => {
              setActiveTab('screen');
              setPickerTrigger(prev => prev + 1);
              setShowSettings(false);
            }}
            onRefreshDevices={() => fetchDevices(true)}
          />
        </div>
      )}

      {/* Tutorial Overlay */}
      {showTutorial && (
        <TutorialOverlay onClose={handleCloseTutorial} />
      )}
    </div >
  );
}

export default App;
