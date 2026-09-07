package com.pairkaji.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;

final class NotificationChannels {
    static final String ALERT_CHANNEL_ID = "pairkaji_alerts_v3";
    private static final String[] LEGACY_CHANNEL_IDS = {
        "pairkaji_reminders",
        "pairkaji_alerts_v2"
    };

    private NotificationChannels() {}

    static void ensure(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }

        for (String legacyId : LEGACY_CHANNEL_IDS) {
            try {
                manager.deleteNotificationChannel(legacyId);
            } catch (Exception ignored) {
                // noop
            }
        }

        NotificationChannel existing = manager.getNotificationChannel(ALERT_CHANNEL_ID);
        if (existing != null) {
            boolean lockOk = existing.getLockscreenVisibility() == NotificationCompat.VISIBILITY_PUBLIC;
            boolean importanceOk = existing.getImportance() >= NotificationManager.IMPORTANCE_HIGH;
            boolean soundOk = existing.getSound() != null;
            if (lockOk && importanceOk && soundOk) {
                return;
            }
            manager.deleteNotificationChannel(ALERT_CHANNEL_ID);
        }

        NotificationChannel channel = new NotificationChannel(
            ALERT_CHANNEL_ID,
            "家事リマインド",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("家事の時間前やフラグのお知らせ");
        channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        channel.enableVibration(true);
        channel.setShowBadge(true);
        Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        AudioAttributes attrs = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        channel.setSound(sound, attrs);
        manager.createNotificationChannel(channel);
    }
}
