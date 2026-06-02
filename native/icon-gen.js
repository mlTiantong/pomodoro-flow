/**
 * Generate a simple PNG tray icon programmatically.
 * This creates a tiny tomato icon as a data URL.
 */
function generateTrayIcon(size = 16) {
    // Simple 16x16 red circle with green leaf
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Red circle (tomato body)
    ctx.beginPath();
    ctx.arc(size/2, size/2 + 1, size/2 - 2, 0, Math.PI * 2);
    ctx.fillStyle = '#E85D3A';
    ctx.fill();

    // Green leaf
    ctx.beginPath();
    ctx.ellipse(size/2, size/2 - size/3, 2, 3, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#4CAF50';
    ctx.fill();

    return canvas.toDataURL('image/png');
}

// This file is for reference - the actual tray icon is generated in main.js
module.exports = { generateTrayIcon };
