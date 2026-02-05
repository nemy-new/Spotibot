// Helper: Convert RGB to HSL
function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0; // achromatic
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return [h, s, l];
}

// Helper: Convert component to Hex
function componentToHex(c) {
    const hex = c.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
}

function rgbToHex(r, g, b) {
    return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
}

export const extractColorFromImage = async (imageUrl) => {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = imageUrl;

        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Downscale for performance (50x50 is enough for palette)
                const width = 50;
                const height = 50;
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);

                const imageData = ctx.getImageData(0, 0, width, height).data;
                const colorScores = [];

                for (let i = 0; i < imageData.length; i += 4) {
                    const r = imageData[i];
                    const g = imageData[i + 1];
                    const b = imageData[i + 2];
                    const a = imageData[i + 3];

                    // Skip mostly transparent pixels
                    if (a < 128) continue;

                    const [h, s, l] = rgbToHsl(r, g, b);

                    // Relaxed filters: Allow lower saturation (0.05) and wider lightness (0.10 - 0.95)
                    // This ensures we capture colors from movies/websites that aren't super neon.
                    if (l < 0.10 || l > 0.95 || s < 0.05) continue;

                    // Scoring: Still favor saturation, but be less punishing
                    const score = (s * 2.0) + (1.0 - Math.abs(l - 0.5));

                    colorScores.push({ r, g, b, score });
                }

                if (colorScores.length === 0) {
                    // Fallback: If no "decent" pixels found (e.g. pure B&W image),
                    // Just take a simple average of the center of the image.
                    let sumR = 0, sumG = 0, sumB = 0, count = 0;
                    for (let i = 0; i < imageData.length; i += 40) { // sparse sample
                        sumR += imageData[i]; sumG += imageData[i + 1]; sumB += imageData[i + 2]; count++;
                    }
                    if (count > 0) {
                        resolve(rgbToHex(Math.round(sumR / count), Math.round(sumG / count), Math.round(sumB / count)));
                        return;
                    }
                    resolve("#ffffff");
                    return;
                }

                // Sort by score descending and take the top one
                // To avoid 1-pixel noise, we could bucket, but taking the top percentile is usually fine for "Vibrant"
                colorScores.sort((a, b) => b.score - a.score);

                // Take average of top 10 vivid pixels to smooth out noise
                const topPicks = colorScores.slice(0, 10);
                let sumR = 0, sumG = 0, sumB = 0;
                topPicks.forEach(c => { sumR += c.r; sumG += c.g; sumB += c.b; });

                const finalR = Math.round(sumR / topPicks.length);
                const finalG = Math.round(sumG / topPicks.length);
                const finalB = Math.round(sumB / topPicks.length);

                resolve(rgbToHex(finalR, finalG, finalB));

            } catch (e) {
                console.warn("Color extraction failed:", e);
                resolve(null);
            }
        };

        img.onerror = () => {
            console.warn("Image load failed");
            resolve(null);
        };
    });
};

export const getPixelColorFromImage = async (imageUrl, x, y, imgElement) => {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // If we already have the loaded image element, use it (faster)
        if (imgElement && imgElement.complete) {
            canvas.width = imgElement.naturalWidth;
            canvas.height = imgElement.naturalHeight;
            ctx.drawImage(imgElement, 0, 0);

            // Map display coordinates to natural image coordinates
            const rect = imgElement.getBoundingClientRect();
            const scaleX = imgElement.naturalWidth / rect.width;
            const scaleY = imgElement.naturalHeight / rect.height;

            const pixelX = Math.floor(x * scaleX);
            const pixelY = Math.floor(y * scaleY);

            const pixelData = ctx.getImageData(pixelX, pixelY, 1, 1).data;
            const hex = '#' + [pixelData[0], pixelData[1], pixelData[2]]
                .map(n => n.toString(16).padStart(2, '0')).join('');
            resolve(hex);
            return;
        }

        // Fallback: Load image from URL
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = imageUrl;
        img.onload = () => {
            // Basic fallback without scaling knowledge isn't great, but sufficient for raw usage
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            const pixelData = ctx.getImageData(x, y, 1, 1).data;
            const hex = '#' + [pixelData[0], pixelData[1], pixelData[2]]
                .map(n => n.toString(16).padStart(2, '0')).join('');
            resolve(hex);
        };
        img.onerror = () => resolve(null);
    });
};
