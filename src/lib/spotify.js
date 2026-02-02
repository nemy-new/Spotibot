import CryptoJS from 'crypto-js';

const AUTH_ENDPOINT = "https://accounts.spotify.com/authorize";
const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const SCOPES = ["user-read-currently-playing", "user-read-playback-state", "user-modify-playback-state", "user-read-recently-played"];

const generateRandomString = (length) => {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
};

const generateCodeChallenge = (codeVerifier) => {
    return CryptoJS.SHA256(codeVerifier).toString(CryptoJS.enc.Base64)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
};

export const spotifyApi = {
    login: async (clientId, redirectUri) => {
        const codeVerifier = generateRandomString(128);
        const codeChallenge = generateCodeChallenge(codeVerifier);

        localStorage.setItem('spotify_code_verifier', codeVerifier);

        const url = `${AUTH_ENDPOINT}?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${SCOPES.join(
            "%20"
        )}&response_type=code&code_challenge_method=S256&code_challenge=${codeChallenge}&show_dialog=true`;

        console.log("--------- PKCE LOGIN ---------");
        console.log("Verifier:", codeVerifier);
        console.log("Challenge:", codeChallenge);
        console.log("URL:", url);

        window.location.href = url;
    },

    getToken: async (code, clientId, redirectUri) => {
        const codeVerifier = localStorage.getItem('spotify_code_verifier');

        const payload = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: clientId,
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
                code_verifier: codeVerifier,
            }),
        };

        const response = await fetch(TOKEN_ENDPOINT, payload);
        const data = await response.json();

        if (data.access_token) {
            return data.access_token;
        } else {
            throw new Error(data.error_description || "Failed to retrieve token");
        }
    },

    getCurrentTrack: async (token) => {
        try {
            const response = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (response.status === 204) {
                return { success: true, data: null, status: 204 };
            }

            if (response.status === 401) {
                return { success: false, error: 'Unauthorized', status: 401 };
            }

            if (response.status > 400) {
                return { success: false, error: `API Error: ${response.status}`, status: response.status };
            }

            const data = await response.json();
            return { success: true, data: data, status: 200 };
        } catch (error) {
            console.error("Spotify API Error:", error);
            return { success: false, error: error.message, status: 0 };
        }
    },

    nextTrack: async (token) => {
        return fetch("https://api.spotify.com/v1/me/player/next", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` }
        });
    },

    getRecentlyPlayed: async (token) => {
        try {
            const response = await fetch("https://api.spotify.com/v1/me/player/recently-played?limit=1", {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            const data = await response.json();
            return data.items && data.items.length > 0 ? data.items[0].track : null;
        } catch (error) {
            console.error("Spotify API Error (Recently Played):", error);
            return null;
        }
    },

    getAudioFeatures: async (token, trackId) => {
        try {
            const response = await fetch(`https://api.spotify.com/v1/audio-features/${trackId}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            if (response.status !== 200) return null;
            return await response.json();
        } catch (error) {
            console.error("Spotify API Error (Audio Features):", error);
            return null;
        }
    },

    previousTrack: async (token) => {
        return fetch("https://api.spotify.com/v1/me/player/previous", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` }
        });
    },

    togglePlay: async (token, isPlaying) => {
        const endpoint = isPlaying ? "pause" : "play";
        return fetch(`https://api.spotify.com/v1/me/player/${endpoint}`, {
            method: "PUT",
            headers: { Authorization: `Bearer ${token}` }
        });
    }
};
