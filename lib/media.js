const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

function runFfmpeg(inputBuffer, ffmpegArgs, inputExt, outputExt) {
  return new Promise((resolve, reject) => {
    const tempDir = os.tmpdir();
    const tempInput = path.join(tempDir, `hans_in_${Date.now()}_${Math.random().toString(36).substring(7)}.${inputExt}`);
    const tempOutput = path.join(tempDir, `hans_out_${Date.now()}_${Math.random().toString(36).substring(7)}.${outputExt}`);

    fs.writeFileSync(tempInput, inputBuffer);

    const cmdStr = `ffmpeg -y -i "${tempInput}" ${ffmpegArgs} "${tempOutput}"`;
    
    exec(cmdStr, (error, stdout, stderr) => {
      try {
        if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
      } catch (err) {
        console.error("Failed to delete temp input file:", err);
      }

      if (error) {
        try {
          if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
        } catch (err) {}
        console.error("FFmpeg execution error:", stderr);
        return reject(new Error(`FFmpeg failed: ${error.message}`));
      }

      try {
        if (!fs.existsSync(tempOutput)) {
          return reject(new Error("FFmpeg output file not found"));
        }
        const outputBuffer = fs.readFileSync(tempOutput);
        if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
        resolve(outputBuffer);
      } catch (readErr) {
        reject(readErr);
      }
    });
  });
}

/**
 * Convert any image buffer to WebP sticker format (512x512 WebP)
 */
async function imageToWebp(buffer) {
  return runFfmpeg(
    buffer,
    `-vcodec libwebp -vf "scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:(512-iw)/2:(512-ih)/2:color=white@0" -lossless 0 -q:v 75`,
    "png",
    "webp"
  );
}

/**
 * Convert video/gif buffer to animated WebP sticker format (512x512 WebP, looping, max 6s)
 */
async function videoToWebp(buffer) {
  return runFfmpeg(
    buffer,
    `-vcodec libwebp -vf "scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:(512-iw)/2:(512-ih)/2:color=white@0" -loop 0 -preset default -an -vsync 0 -t 6`,
    "mp4",
    "webp"
  );
}

/**
 * Convert WebP sticker to PNG image
 */
async function webpToPng(buffer) {
  return runFfmpeg(
    buffer,
    `-vframes 1 -f image2`,
    "webp",
    "png"
  );
}

/**
 * Convert WebP sticker or video to high quality GIF
 */
async function toGif(buffer, inputExt = "webp") {
  return runFfmpeg(
    buffer,
    `-vf "scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:(512-iw)/2:(512-ih)/2:color=white@0,split[a][b];[a]palettegen=reserve_transparent=1[p];[b][p]paletteuse" -loop 0`,
    inputExt,
    "gif"
  );
}

module.exports = {
  imageToWebp,
  videoToWebp,
  webpToPng,
  toGif
};
