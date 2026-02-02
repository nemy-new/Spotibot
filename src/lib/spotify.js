const AUTH_ENDPOINT = "https://accounts.spotify.com/authorize";
const TOKEN_ENDPOINT = "/api/spotify-token"; // Proxy to https://accounts.spotify.com/api/token
const SCOPES = ["user-read-currently-playing", "user-read-playback-state", "user-modify-playback-state", "user-read-recently-played"];

export const spotifyApi = {
    login: (clientId, redirectUri) => {
        const url = `${AUTH_ENDPOINT}?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${SCOPES.join(
            "%20"
        )}&response_type=code&show_dialog=true`;
        window.location.href = url;
    },

    getToken: async (code, clientId, clientSecret, redirectUri) => {
        const params = new URLSearchParams();
        params.append("grant_type", "authorization_code");
        params.append("code", code);
        params.append("redirect_uri", redirectUri);

        const headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": "Basic " + btoa(clientId + ":" + clientSecret)
        };

        try {
            const response = await fetch(TOKEN_ENDPOINT, {
                method: "POST",
                headers: headers,
                body: params
            });
            return await response.json();
        } catch (error) {
            console.error("Spotify Token Error:", error);
            throw error;
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
