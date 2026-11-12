
const input = document.getElementById("imageInput");
const canvas = document.getElementById("myCanvas");
const ctx = canvas.getContext("2d");

function rgbToHsv(red, green, blue) {

    // Normalize RGB values
    const r = red / 255;
    const g = green / 255;
    const b = blue / 255;

    // Find maximum and minimum
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);

    // Find delta
    const delta = max - min;

    // Calculate Hue
    let h;

    if (delta === 0) {
        h = 0;
    }
    else if (max === r) {
        h = 60 * (((g - b) / delta) % 6);
    }
    else if (max === g) {
        h = 60 * (((b - r) / delta) + 2);
    }
    else {
        h = 60 * (((r - g) / delta) + 4);
    }

    // Keep Hue between 0 and 360
    if (h < 0) {
        h += 360;
    }

    // Calculate Saturation
    const s = max === 0 ? 0 : (delta / max) * 100;

    // Calculate Value
    const v = max * 100;

    return { h, s, v };
}

function hsvToNdvi(h, s, v) {

    // Filter out grey pixels (ocean/no data)
    // Low saturation = no meaningful colour = skip
    if (s < 15) {
        return null; // no data
    }

    // Vegetation hue range: ~40° (bare) to ~120° (dense)
    const HUE_MIN = 40;
    const HUE_MAX = 140;

    // Clamp hue to expected range
    const hueClamped = Math.max(HUE_MIN, Math.min(HUE_MAX, h));

    // Normalize hue to 0→1
    const normalized = (hueClamped - HUE_MIN) / (HUE_MAX - HUE_MIN);

    // Map to NDVI range -0.1 to 0.9
    const NDVI_MIN = -0.1;
    const NDVI_MAX = 0.9;

    const ndvi = NDVI_MIN + normalized * (NDVI_MAX - NDVI_MIN);

    return Math.round(ndvi * 100) / 100; // 2 decimal places
}

input.addEventListener("change", function(event) {

    const file = event.target.files[0];
    if (!file) return;

    const image = new Image();

    image.onload = function() {

        canvas.width = image.width;
        canvas.height = image.height;

        ctx.drawImage(image, 0, 0);

        // Extract pixel data
        const pixelData = ctx.getImageData(
            0, 0, canvas.width, canvas.height
        );

        const pixels = pixelData.data;

        // Store Hue values of each pixel
        window.hsvPixels = [];

        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {

                const i = (y * canvas.width + x) * 4;

                const red = pixels[i];
                const green = pixels[i+1];
                const blue = pixels[i+2];
                const alpha = pixels[i+3];

                // Skip transparent pixels
                if (alpha < 128) continue;

                // Skip legend area at bottom
                if (y > 630) continue;

                const hsv = rgbToHsv(red, green, blue);
                const ndvi = hsvToNdvi(hsv.h, hsv.s, hsv.v);

                // Skip pixels that don't have a valid NDVI value
                if (ndvi === null) continue;

                window.hsvPixels.push({
                    x: x,
                    y: y,
                    H: hsv.h,
                    S: hsv.s,
                    V: hsv.v,
                    NDVI: ndvi,
                });
            }
        }

        console.log("Image width:", canvas.width);
        console.log("Image height:", canvas.height);
        console.log("Total pixels:", window.hsvPixels.length);

        // Create an empty 2D array
        const scientificData = [];

        for (let y = 0; y < canvas.height; y++) {

            scientificData[y] = [];

            for (let x = 0; x < canvas.width; x++) {
                scientificData[y][x] = null;
            }
        }

        // Place each pixel's NDVI value in its original position
        for (const pixel of window.hsvPixels) {

            scientificData[pixel.y][pixel.x] = pixel.NDVI;

        }

        // Make the array accessible to other scripts
        window.scientificData = scientificData;

        const jsonData = JSON.stringify(scientificData);

        const blob = new Blob([jsonData], {
            type: "application/json"
        });

        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");

        a.href = url;
        a.download = "earth-ndvi-data.json";

        a.click();

        URL.revokeObjectURL(url);

        console.log("2D NDVI array:", window.scientificData);
        console.log("First row:", window.scientificData[66]);
        console.log("Sample pixel:", window.scientificData[66][544]);

        // Display every pixel's HSV values
        console.table(window.hsvPixels);

    };

    image.src = URL.createObjectURL(file);

});