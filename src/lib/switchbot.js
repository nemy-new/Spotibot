import CryptoJS from 'crypto-js';

const BASE_URL = 'https://thingproxy.freeboard.io/fetch/https://api.switch-bot.com/v1.1';

/**
 * Generate the Request Header as per SwitchBot API v1.1
 * @param {string} token 
 * @param {string} secret 
 */
const generateHeaders = (token, secret) => {
  if (!secret) {
    return {
      "Authorization": token,
      "Content-Type": "application/json; charset=utf8",
    };
  }
  const t = Date.now();
  const nonce = 'requestID';
  const data = token + t + nonce;
  const sign = CryptoJS.HmacSHA256(data, secret).toString(CryptoJS.enc.Base64);

  return {
    "Authorization": token,
    "sign": sign,
    "nonce": nonce,
    "t": t,
    "Content-Type": "application/json; charset=utf8",
  };
};

export const switchbotApi = {
  /**
   * Get all devices
   */
  getDevices: async (token, secret) => {
    try {
      const response = await fetch(`${BASE_URL}/devices`, {
        method: 'GET',
        headers: generateHeaders(token, secret),
      });
      const data = await response.json();
      if (data.statusCode !== 100) {
        throw new Error(data.message || 'Failed to fetch devices');
      }
      return data.body;
    } catch (error) {
      console.error("SwitchBot API Error:", error);
      throw error;
    }
  },

  /**
   * Get device status
   */
  getDeviceStatus: async (token, secret, deviceId) => {
    try {
      const response = await fetch(`${BASE_URL}/devices/${deviceId}/status`, {
        method: 'GET',
        headers: generateHeaders(token, secret),
      });
      const data = await response.json();
      if (data.statusCode !== 100) {
        throw new Error(data.message || 'Failed to fetch status');
      }
      return data.body;
    } catch (error) {
      console.error("SwitchBot API Error:", error);
      throw error;
    }
  },

  /**
   * Send command to device
   */
  sendCommand: async (token, secret, deviceId, command, parameter = 'default', commandType = 'command') => {
    try {
      const response = await fetch(`${BASE_URL}/devices/${deviceId}/commands`, {
        method: 'POST',
        headers: generateHeaders(token, secret),
        body: JSON.stringify({
          command,
          parameter,
          commandType,
        }),
      });
      const data = await response.json();
      if (data.statusCode !== 100) {
        throw new Error(data.message || 'Failed to send command');
      }
      return data;
    } catch (error) {
      console.error("SwitchBot API Error:", error);
      throw error;
    }
  }
};
