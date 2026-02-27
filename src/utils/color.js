// Helper: Convert RGB to HSL
export function rgbToHsl(r, g, b) {
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

// Helper: Convert HSL to RGB
export function hslToRgb(h, s, l) {
    let r, g, b;

    if (s === 0) {
        r = g = b = l; // achromatic
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
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
    const palette = await extractPaletteFromImage(imageUrl, 1);
    return palette[0] || null;
};

export const extractPaletteFromImage = async (imageUrl, count = 3) => {
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
                        resolve([rgbToHex(Math.round(sumR / count), Math.round(sumG / count), Math.round(sumB / count))]);
                        return;
                    }
                    resolve(["#ffffff"]);
                    return;
                }

                // Sort by score descending
                colorScores.sort((a, b) => b.score - a.score);

                // Select distinct colors
                const palette = [];
                const minDistance = 50; // Minimum Euclidean distance between selected colors

                for (const color of colorScores) {
                    if (palette.length >= count) break;

                    let isDistinct = true;
                    for (const selected of palette) {
                        const dr = color.r - selected.r;
                        const dg = color.g - selected.g;
                        const db = color.b - selected.b;
                        const distance = Math.sqrt(dr * dr + dg * dg + db * db);
                        if (distance < minDistance) {
                            isDistinct = false;
                            break;
                        }
                    }

                    if (isDistinct) {
                        palette.push(color);
                    }
                }

                // If we couldn't find enough distinct colors, fill with the top ones (even if similar) or duplicates
                while (palette.length < count && colorScores.length > palette.length) {
                    // Just take next best score ensuring it's not EXACTLY same pixel if possible, but for now just simple fill
                    const nextBest = colorScores[palette.length];
                    if (nextBest) palette.push(nextBest);
                    else break;
                }

                resolve(palette.map(c => rgbToHex(c.r, c.g, c.b)));

            } catch (e) {
                console.warn("Color extraction failed:", e);
                resolve([]);
            }
        };

        img.onerror = () => {
            console.warn("Image load failed");
            resolve([]);
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
