import { FastAverageColor } from 'fast-average-color';

const fac = new FastAverageColor();

export const extractColorFromImage = async (imageUrl) => {
    try {
        const color = await fac.getColorAsync(imageUrl);
        return color.hex;
    } catch (error) {
        console.warn("Failed to extract color:", error);
        return null;
    }
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
