package app.financetracker.listener

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import app.financetracker.listener.sync.SyncScheduler

/**
 * HANYA build debug: konfigurasi lewat adb untuk pengujian otomatis di emulator, mis.
 *   adb shell am broadcast -a app.financetracker.listener.DEBUG_CONFIG \
 *     -n app.financetracker.listener.debug/app.financetracker.listener.DebugConfigReceiver \
 *     --es url http://10.0.2.2:8000 --es api_key KEY --es packages com.android.shell
 */
class DebugConfigReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext as FinanceApp
        intent.getStringExtra("url")?.let { url ->
            app.settings.saveServer(url, intent.getStringExtra("api_key"), intent.getStringExtra("cf_id"), intent.getStringExtra("cf_secret"))
        }
        intent.getStringExtra("packages")?.let { pkgs ->
            app.settings.setMonitoredPackages(pkgs.split(',').map { it.trim() }.filter { it.isNotEmpty() }.toSet())
        }
        SyncScheduler.enqueueNow(context)
        Log.i("FinanceListener", "debug config applied")
    }
}
