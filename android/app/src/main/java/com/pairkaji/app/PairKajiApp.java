package com.pairkaji.app;

import android.app.Application;

public class PairKajiApp extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        NotificationChannels.ensure(this);
    }
}
