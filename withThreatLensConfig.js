const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withMainApplication, withDangerousMod } = require('@expo/config-plugins');

function withThreatLensManifest(config) {
  return withAndroidManifest(config, async config => {
    const androidManifest = config.modResults;
    const mainApplication = androidManifest.manifest.application[0];

    // Add NotificationListenerService
    if (!mainApplication.service) {
      mainApplication.service = [];
    }

    const hasService = mainApplication.service.some(
      s => s.$['android:name'] === '.NotificationService'
    );

    if (!hasService) {
      mainApplication.service.push({
        $: {
          'android:name': '.NotificationService',
          'android:label': 'ThreatLens Breach Scanner',
          'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
          'android:exported': 'true'
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.service.notification.NotificationListenerService' } }]
          }
        ]
      });
    }

    const hasHeadlessService = mainApplication.service.some(
      s => s.$['android:name'] === '.HeadlessNotificationTaskService'
    );
    if (!hasHeadlessService) {
      mainApplication.service.push({
        $: {
          'android:name': '.HeadlessNotificationTaskService',
          'android:exported': 'false',
        }
      });
    }

    // Add ACTION_SEND intent filter to MainActivity
    const mainActivity = mainApplication.activity.find(
      a => a.$['android:name'] === '.MainActivity'
    );

    if (mainActivity) {
      if (!mainActivity['intent-filter']) {
        mainActivity['intent-filter'] = [];
      }
      
      const hasActionSend = mainActivity['intent-filter'].some(
        f => f.action && f.action.some(a => a.$['android:name'] === 'android.intent.action.SEND')
      );

      if (!hasActionSend) {
        mainActivity['intent-filter'].push({
          action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
          category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
          data: [{ $: { 'android:mimeType': 'text/plain' } }]
        });
      }
    }

    return config;
  });
}

function withThreatLensMainApp(config) {
  return withMainApplication(config, async config => {
    const source = config.modResults.contents;
    if (source.includes('add(NotificationPackage())')) {
      return config;
    }

    if (source.includes('// add(MyReactNativePackage())')) {
      config.modResults.contents = source.replace(
        '// add(MyReactNativePackage())',
        '// add(MyReactNativePackage())\n              add(NotificationPackage())'
      );
      return config;
    }

    config.modResults.contents = source.replace(
      'PackageList(this).packages.apply {',
      'PackageList(this).packages.apply {\n              add(NotificationPackage())'
    );

    return config;
  });
}

function getAndroidPackage(config) {
  return config?.android?.package || 'com.anonymous.threatlens';
}

function writeFileIfChanged(filePath, content) {
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf8');
    if (existing === content) {
      return;
    }
  }
  fs.writeFileSync(filePath, content, 'utf8');
}

function headlessTaskServiceSource(packageName) {
  return `package ${packageName}

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class HeadlessNotificationTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val extras = intent?.extras ?: return null
    return HeadlessJsTaskConfig(
      "ThreatLensNotificationTask",
      Arguments.fromBundle(extras),
      30_000L,
      true
    )
  }
}
`;
}

function notificationServiceSource(packageName) {
  return `package ${packageName}

import android.app.Notification
import android.content.Intent
import android.os.Bundle
import android.os.Parcelable
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import androidx.work.Data
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager

class NotificationService : NotificationListenerService() {

  companion object {
    const val ACTION_NOTIFICATION_CAPTURED = "${packageName}.NOTIFICATION_CAPTURED"
    const val EXTRA_PACKAGE_NAME = "packageName"
    const val EXTRA_TITLE = "title"
    const val EXTRA_TEXT = "text"
    const val EXTRA_IS_TRUNCATED = "isTruncated"
    const val EXTRA_POSTED_AT = "postedAt"
    const val EXTRA_CATEGORY = "category"
    const val EXTRA_IS_ONGOING = "isOngoing"
    private const val DEBUG_TAG = "ThreatLensNotif"

    private const val DEDUP_WINDOW_MS = 120_000L
    private val recentFingerprints = mutableMapOf<String, Long>()
  }

  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    if (sbn == null) {
      return
    }

    if (sbn.packageName == packageName) {
      return
    }

    val extras = sbn.notification.extras ?: Bundle.EMPTY
    val messageText = extractBestText(extras)
    val title = extractBestTitle(extras)
    val isTruncated = isLikelyTruncated(extras, messageText)
    val category = sbn.notification.category.orEmpty()
    val isOngoing = sbn.isOngoing
    Log.d(DEBUG_TAG, "[DEBUG-notif] posted pkg=\${sbn.packageName} title=\${title.take(40)} textLen=\${messageText.length}")

    val normalizedMessage = messageText.trim().lowercase()
    val fingerprint = if (normalizedMessage.isNotEmpty()) {
      "\${sbn.packageName}::\${normalizedMessage}"
    } else {
      "\${sbn.packageName}::\${sbn.key}::\${sbn.postTime}"
    }
    val now = System.currentTimeMillis()
    synchronized(recentFingerprints) {
      recentFingerprints.entries.removeAll { now - it.value > DEDUP_WINDOW_MS }
      if (recentFingerprints.containsKey(fingerprint)) {
        Log.d(DEBUG_TAG, "[DEBUG-notif] dedup skip pkg=\${sbn.packageName}")
        return
      }
      recentFingerprints[fingerprint] = now
    }

    // Path 1: broadcast to dynamic receiver (works when app is alive)
    val intent = Intent(ACTION_NOTIFICATION_CAPTURED).apply {
      \`package\` = packageName
      putExtra(EXTRA_PACKAGE_NAME, sbn.packageName)
      putExtra(EXTRA_TITLE, title)
      putExtra(EXTRA_TEXT, messageText)
      putExtra(EXTRA_IS_TRUNCATED, isTruncated)
      putExtra(EXTRA_POSTED_AT, sbn.postTime)
      putExtra(EXTRA_CATEGORY, category)
      putExtra(EXTRA_IS_ONGOING, isOngoing)
    }
    sendBroadcast(intent)
    Log.d(DEBUG_TAG, "[DEBUG-notif] broadcast sent pkg=\${sbn.packageName}")

    // Path 2: WorkManager → HeadlessJS (works when app is backgrounded/killed)
    try {
      val inputData = Data.Builder()
        .putString(EXTRA_PACKAGE_NAME, sbn.packageName)
        .putString(EXTRA_TITLE, title)
        .putString(EXTRA_TEXT, messageText)
        .putBoolean(EXTRA_IS_TRUNCATED, isTruncated)
        .putLong(EXTRA_POSTED_AT, sbn.postTime)
        .putString(EXTRA_CATEGORY, category)
        .putBoolean(EXTRA_IS_ONGOING, isOngoing)
        .build()

      val request = OneTimeWorkRequestBuilder<NotificationWorker>()
        .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
        .setInputData(inputData)
        .build()

      WorkManager.getInstance(applicationContext).enqueue(request)
      Log.d(DEBUG_TAG, "[DEBUG-notif] worker enqueued pkg=\${sbn.packageName}")
    } catch (_: Exception) {
      // Broadcast above handles it when app is alive
    }
  }

  override fun onCreate() {
    super.onCreate()
    Log.d(DEBUG_TAG, "[DEBUG-notif] listener service created")
  }

  override fun onListenerConnected() {
    super.onListenerConnected()
    Log.d(DEBUG_TAG, "[DEBUG-notif] listener connected")
  }

  override fun onListenerDisconnected() {
    super.onListenerDisconnected()
    Log.d(DEBUG_TAG, "[DEBUG-notif] listener disconnected")
  }

  private fun extractBestText(extras: Bundle): String {
    val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim().orEmpty()
    val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()?.trim().orEmpty()
    val subText = extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString()?.trim().orEmpty()

    val lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
      ?.mapNotNull { it?.toString()?.trim() }
      ?.filter { it.isNotEmpty() }
      ?.joinToString("\\n")
      .orEmpty()

    val messagingStyleText = extractMessagingStyleText(extras)

    return listOf(messagingStyleText, bigText, lines, text, subText)
      .filter { it.isNotEmpty() }
      .maxByOrNull { it.length }
      .orEmpty()
  }

  private fun extractBestTitle(extras: Bundle): String {
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim().orEmpty()
    val conversationTitle = extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)
      ?.toString()
      ?.trim()
      .orEmpty()

    return listOf(conversationTitle, title)
      .firstOrNull { it.isNotEmpty() }
      .orEmpty()
  }

  private fun extractMessagingStyleText(extras: Bundle): String {
    return try {
      val rawMessages = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
        extras.getParcelableArray(Notification.EXTRA_MESSAGES, Parcelable::class.java)
      } else {
        @Suppress("DEPRECATION")
        extras.getParcelableArray(Notification.EXTRA_MESSAGES)
      }

      val messages = Notification.MessagingStyle.Message.getMessagesFromBundleArray(rawMessages)
      messages
        .mapNotNull { it.text?.toString()?.trim() }
        .filter { it.isNotEmpty() }
        .joinToString("\\n")
    } catch (_: Exception) {
      ""
    }
  }

  private fun isLikelyTruncated(extras: Bundle, extractedText: String): Boolean {
    if (extractedText.isBlank()) {
      return true
    }

    val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim().orEmpty()
    val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()?.trim().orEmpty()

    val hasEllipsis = text.endsWith("...") || text.endsWith("…") ||
      extractedText.endsWith("...") || extractedText.endsWith("…")

    val hasLongCollapsedText = bigText.isBlank() && text.length >= 140

    return hasEllipsis || hasLongCollapsedText
  }
}
`;
}

function notificationModuleSource(packageName) {
  return `package ${packageName}

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import org.json.JSONArray
import org.json.JSONObject

class NotificationModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  private val CHANNEL_ID = "threat-alerts"
  private val PREFS_NAME = "threatlens_prefs"
  private val PENDING_SCANS_FILE = "pending_scans.json"
  private var receiverRegistered = false
  private var lastSharedText: String? = null

  private val activityEventListener = object : BaseActivityEventListener() {
    override fun onNewIntent(intent: Intent) {
      emitSharedTextIfPresent(intent)
    }
  }

  private val notificationReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      if (intent == null || intent.action != NotificationService.ACTION_NOTIFICATION_CAPTURED) {
        return
      }

      val payload = Arguments.createMap().apply {
        putString(
          NotificationService.EXTRA_PACKAGE_NAME,
          intent.getStringExtra(NotificationService.EXTRA_PACKAGE_NAME).orEmpty()
        )
        putString(
          NotificationService.EXTRA_TITLE,
          intent.getStringExtra(NotificationService.EXTRA_TITLE).orEmpty()
        )
        putString(
          NotificationService.EXTRA_TEXT,
          intent.getStringExtra(NotificationService.EXTRA_TEXT).orEmpty()
        )
        putBoolean(
          NotificationService.EXTRA_IS_TRUNCATED,
          intent.getBooleanExtra(NotificationService.EXTRA_IS_TRUNCATED, false)
        )
        putString(
          NotificationService.EXTRA_CATEGORY,
          intent.getStringExtra(NotificationService.EXTRA_CATEGORY).orEmpty()
        )
        putBoolean(
          NotificationService.EXTRA_IS_ONGOING,
          intent.getBooleanExtra(NotificationService.EXTRA_IS_ONGOING, false)
        )
        putDouble(
          NotificationService.EXTRA_POSTED_AT,
          intent.getLongExtra(NotificationService.EXTRA_POSTED_AT, 0L).toDouble()
        )
      }

      emitEvent("NotificationReceived", payload)
    }
  }

  override fun getName(): String = "NotificationModule"

  override fun initialize() {
    super.initialize()
    reactContext.addActivityEventListener(activityEventListener)
    registerReceiverIfNeeded()
    emitSharedTextIfPresent(reactContext.currentActivity?.intent)
  }

  override fun invalidate() {
    reactContext.removeActivityEventListener(activityEventListener)
    unregisterReceiverIfNeeded()
    super.invalidate()
  }

  @ReactMethod
  fun storeNimKey(apiKey: String) {
    reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString("nim_api_key", apiKey)
      .apply()
  }

  @ReactMethod
  fun setAppActive(isActive: Boolean) {
    reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putBoolean("app_active", isActive)
      .apply()
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Required by NativeEventEmitter on newer React Native versions.
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // Required by NativeEventEmitter on newer React Native versions.
  }

  @ReactMethod
  fun openNotificationAccessSettings() {
    val intent = Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS").apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    reactContext.startActivity(intent)
  }

  @ReactMethod
  fun showNotification(title: String, body: String, deepLink: String) {
    ensureChannel()
    val builder = NotificationCompat.Builder(reactContext, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setContentTitle(title)
      .setContentText(body)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setAutoCancel(true)
    if (deepLink.isNotEmpty()) {
      val tapIntent = Intent(Intent.ACTION_VIEW, Uri.parse(deepLink)).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        setPackage(reactContext.packageName)
      }
      val pendingIntent = PendingIntent.getActivity(
        reactContext, deepLink.hashCode(), tapIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
      builder.setContentIntent(pendingIntent)
    }
    NotificationManagerCompat.from(reactContext)
      .notify(System.currentTimeMillis().toInt(), builder.build())
  }

  @ReactMethod
  fun consumePendingScans(promise: Promise) {
    try {
      val file = File(reactContext.filesDir, PENDING_SCANS_FILE)
      if (!file.exists()) {
        promise.resolve("[]")
        return
      }

      val raw = file.readText()
      file.delete()
      promise.resolve(raw)
    } catch (error: Exception) {
      promise.reject("PENDING_SCANS_READ_FAILED", error)
    }
  }

  @ReactMethod
  fun appendPendingScan(scanJson: String, promise: Promise) {
    try {
      appendPendingScanRecord(JSONObject(scanJson))
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("PENDING_SCAN_APPEND_FAILED", error)
    }
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(CHANNEL_ID, "Threat Alerts", NotificationManager.IMPORTANCE_HIGH).apply {
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 250, 250, 250)
      lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
    }
    manager.createNotificationChannel(channel)
  }

  @ReactMethod
  fun isNotificationAccessGranted(promise: Promise) {
    try {
      val enabledListeners = Settings.Secure.getString(
        reactContext.contentResolver,
        "enabled_notification_listeners"
      ).orEmpty()

      val granted = enabledListeners.contains(reactContext.packageName)
      promise.resolve(granted)
    } catch (error: Exception) {
      promise.reject("NOTIFICATION_ACCESS_CHECK_FAILED", error)
    }
  }

  @ReactMethod
  fun getInitialSharedText(promise: Promise) {
    try {
      val text = consumeSharedText(reactContext.currentActivity?.intent)
      promise.resolve(text)
    } catch (error: Exception) {
      promise.reject("SHARE_INTENT_READ_FAILED", error)
    }
  }

  private fun registerReceiverIfNeeded() {
    if (receiverRegistered) {
      return
    }

    val filter = IntentFilter(NotificationService.ACTION_NOTIFICATION_CAPTURED)
    ContextCompat.registerReceiver(
      reactContext,
      notificationReceiver,
      filter,
      ContextCompat.RECEIVER_NOT_EXPORTED
    )
    receiverRegistered = true
  }

  private fun unregisterReceiverIfNeeded() {
    if (!receiverRegistered) {
      return
    }

    try {
      reactContext.unregisterReceiver(notificationReceiver)
    } catch (_: IllegalArgumentException) {
      // Receiver may already be unregistered when React context is recreated.
    } finally {
      receiverRegistered = false
    }
  }

  private fun emitEvent(eventName: String, params: com.facebook.react.bridge.WritableMap) {
    if (!reactContext.hasActiveReactInstance()) {
      return
    }

    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, params)
  }

  private fun emitSharedTextIfPresent(intent: Intent?) {
    val text = consumeSharedText(intent) ?: return

    val payload = Arguments.createMap().apply {
      putString("text", text)
    }
    emitEvent("SharedTextReceived", payload)
  }

  private fun consumeSharedText(intent: Intent?): String? {
    if (intent?.action != Intent.ACTION_SEND) {
      return null
    }

    val type = intent.type.orEmpty()
    if (!type.startsWith("text/")) {
      return null
    }

    val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)?.trim().orEmpty()
    if (sharedText.isBlank()) {
      return null
    }

    if (sharedText == lastSharedText) {
      return null
    }

    lastSharedText = sharedText
    return sharedText
  }

  private fun appendPendingScanRecord(result: JSONObject) {
    val file = File(reactContext.filesDir, PENDING_SCANS_FILE)
    val existing = if (file.exists()) {
      try {
        JSONArray(file.readText())
      } catch (_: Exception) {
        JSONArray()
      }
    } else {
      JSONArray()
    }

    val updated = JSONArray()
    updated.put(result)
    for (index in 0 until existing.length()) {
      updated.put(existing.get(index))
    }
    file.writeText(updated.toString())
  }
}
`;
}

function notificationPackageSource(packageName) {
  return `package ${packageName}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class NotificationPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(NotificationModule(reactContext))
  }

  override fun createViewManagers(
    reactContext: ReactApplicationContext
  ): List<ViewManager<*, *>> {
    return emptyList()
  }
}
`;
}

function notificationWorkerSource(packageName) {
  return `package ${packageName}

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import android.util.Base64
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.facebook.react.HeadlessJsTaskService
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class NotificationWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

  companion object {
    private const val CHANNEL_ID = "threat-alerts"
    private const val PREFS_NAME = "threatlens_prefs"
    private const val PREFS_NIM_KEY = "nim_api_key"
    private const val PREFS_APP_ACTIVE = "app_active"
    private const val PENDING_SCANS_FILE = "pending_scans.json"
    private const val NIM_BASE_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
    private const val DEBUG_TAG = "ThreatLensNotif"
    private const val WORKER_DEDUP_WINDOW_MS = 120_000L
    private val NIM_MODELS = listOf(
      "meta/llama-3.3-70b-instruct",
      "nv-mistralai/mistral-nemo-12b-instruct"
    )
    private val recentWorkerFingerprints = mutableMapOf<String, Long>()
    private val LOW_SIGNAL_PATTERNS = listOf(
      Regex("""(?i)\\bis typing\\b"""),
      Regex("""(?i)\\breacted to your (message|story)\\b"""),
      Regex("""(?i)\\bmentioned you in a (story|post)\\b"""),
      Regex("""(?i)\\bstarted a call\\b"""),
      Regex("""(?i)\\bmissed (voice|video) call\\b"""),
      Regex("""(?i)\\bmissed call\\b"""),
      Regex("""(?i)^new message$""")
    )
    private val NOISE_PATTERNS = listOf(
      Regex("""(?i)shared mobile data"""), Regex("""(?i)device connected"""),
      Regex("""(?i)checking for new messages"""), Regex("""(?i)checking for updates"""),
      Regex("""(?i)update available"""), Regex("""(?i)app updates? available"""),
      Regex("""(?i)\\b\\d+\\s+apps?\\s+(updated|installed|ready to update)\\b"""),
      Regex("""(?i)\\b(downloading|installing)\\s+(update|updates|app|apps)\\b"""),
      Regex("""(?i)\\b(update|installation)\\s+(complete|completed|successful)\\b"""),
      Regex("""(?i)\\b(app|apps)\\s+(installed|uninstalled)\\b"""),
      Regex("""(?i)is doing work in the background"""), Regex("""(?i)working in the background"""),
      Regex("""(?i)sync in progress"""), Regex("""(?i)syncing"""),
      Regex("""(?i)backup in progress"""), Regex("""(?i)usb debugging"""),
      Regex("""(?i)charging this device via usb"""), Regex("""(?i)ongoing call"""),
      Regex("""(?i)wi[- ]?fi hotspot on"""), Regex("""(?i)not connected to any device"""),
      Regex("""(?i)tap to view more options"""), Regex("""(?i)^android system$""")
    )
    private val MESSAGING_PACKAGES_WITH_SHORT_FILTER = setOf(
      "com.whatsapp","com.whatsapp.w4b","com.google.android.apps.messaging",
      "com.google.android.apps.googlevoice","com.android.mms","com.samsung.android.messaging",
      "com.sonyericsson.conversations","com.miui.smsextra","com.oneplus.mms",
      "com.oplus.message","com.coloros.message","com.vivo.messaging","com.htc.sense.mms",
      "com.huawei.message","org.telegram.messenger","org.telegram.plus",
      "org.thoughtcrime.securesms","com.facebook.orca","com.instagram.android",
      "com.discord","jp.naver.line.android","com.tencent.mm","com.viber.voip",
      "com.kakao.talk","com.zing.zalo","com.skype.raider","com.microsoft.teams","com.bbm"
    )
    private val ALLOWED_MESSAGING_PACKAGES = setOf(
      "com.whatsapp","com.whatsapp.w4b","com.google.android.apps.messaging",
      "com.google.android.apps.googlevoice","com.android.mms","com.samsung.android.messaging",
      "com.sonyericsson.conversations","com.miui.smsextra","com.oneplus.mms",
      "com.oplus.message","com.coloros.message","com.vivo.messaging","com.htc.sense.mms",
      "com.huawei.message","org.telegram.messenger","org.telegram.plus",
      "org.thoughtcrime.securesms","com.facebook.orca","com.instagram.android",
      "com.discord","jp.naver.line.android","com.tencent.mm","com.viber.voip",
      "com.kakao.talk","com.zing.zalo","com.skype.raider","com.microsoft.teams","com.bbm",
      "com.google.android.gm","com.microsoft.office.outlook",
      "com.yahoo.mobile.client.android.mail","ch.protonmail.android",
      "com.samsung.android.email.provider","com.sonyericsson.email"
    )
    private val THREAT_KW = Regex("""(?i)kyc|otp|cvv|pin|password|lottery|prize|winner|verify|suspend|block|arrest|urgent|click here|tap here|http""")
    private val SHORT_MSG = Regex("""^[^\\d\\n]{0,60}$""")
    private val SYSTEM_PROMPT = """
You are a cybersecurity expert for the Indian market. Classify messages as SAFE, PROMO, SPAM, SCAM, or PHISHING.
DECISION TREE: 1.TRANSACTION ALERT->SAFE 2.DELIVERY->SAFE 3.INSTITUTION->SAFE 4.PHISHING 5.SCAM 6.PROMO 7.SPAM 8.SAFE
RULES: Financial keywords alone do NOT make a transaction alert suspicious. SAFE/PROMO: red_flags and suggested_actions=[]. confidence 0-100.
Respond ONLY with valid JSON: {"classification":"SAFE|PROMO|SPAM|SCAM|PHISHING","confidence":0-100,"explanation":"1-3 sentences","red_flags":[],"suggested_actions":[]}
    """.trimIndent()
  }

  override fun doWork(): Result {
    val pkg = inputData.getString(NotificationService.EXTRA_PACKAGE_NAME) ?: return Result.success()
    val title = inputData.getString(NotificationService.EXTRA_TITLE).orEmpty()
    val text = inputData.getString(NotificationService.EXTRA_TEXT).orEmpty()
    val isTruncated = inputData.getBoolean(NotificationService.EXTRA_IS_TRUNCATED, false)
    Log.d(DEBUG_TAG, "[DEBUG-notif] worker start pkg=\${pkg} textLen=\${text.length} truncated=\${isTruncated}")
    if (!isAllowedPackage(pkg)) {
      return Result.success()
    }

    when (getAppProcessState()) {
      AppProcessState.ACTIVE -> {
        Log.d(DEBUG_TAG, "[DEBUG-notif] worker skip active app pkg=\${pkg}")
        return Result.success()
      }
      AppProcessState.ALIVE_IN_BACKGROUND -> {
        if (tryStartHeadlessTask(pkg, title, text, isTruncated)) {
          Log.d(DEBUG_TAG, "[DEBUG-notif] worker delegated to headless js pkg=\${pkg}")
          return Result.success()
        }
        Log.d(DEBUG_TAG, "[DEBUG-notif] headless start failed, falling back native pkg=\${pkg}")
      }
      AppProcessState.NOT_RUNNING -> {
        Log.d(DEBUG_TAG, "[DEBUG-notif] worker native fallback process dead pkg=\${pkg}")
      }
    }

    return runNativeFallback(pkg, title, text, isTruncated)
  }

  private enum class AppProcessState {
    ACTIVE,
    ALIVE_IN_BACKGROUND,
    NOT_RUNNING
  }

  private fun runNativeFallback(
    pkg: String,
    title: String,
    text: String,
    isTruncated: Boolean
  ): Result {
    val nimKey = applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .getString(PREFS_NIM_KEY, null)
    if (nimKey.isNullOrBlank()) {
      Log.d(DEBUG_TAG, "[DEBUG-notif] worker skip missing key pkg=\${pkg}")
      return Result.success()
    }

    if (isTruncated) {
      val clipped = text.trim().take(120)
      postNotification(
        "Action Needed: Paste Full Message",
        "ThreatLens couldn't read the full message from \${title.ifBlank { pkg }}. Tap to paste it in Scanner.",
        "threatlens://scanner?prefill=\${Uri.encode(clipped)}"
      )
      Log.d(DEBUG_TAG, "[DEBUG-notif] worker prompt truncated pkg=\${pkg}")
      return Result.success()
    }

    if (text.isBlank() || isNoise(title, text) || isLowSignal(pkg, title, text)) {
      Log.d(DEBUG_TAG, "[DEBUG-notif] worker skip filtered pkg=\${pkg} text=\${text.take(60)}")
      return Result.success()
    }

    if (isWorkerDuplicate(pkg, text)) {
      Log.d(DEBUG_TAG, "[DEBUG-notif] worker dedup skip pkg=\${pkg}")
      return Result.success()
    }

    val result = classifyWithNim(text, nimKey) ?: return Result.success()
    Log.d(DEBUG_TAG, "[DEBUG-notif] worker classified pkg=\${pkg} cls=\${result.classification}")
    if (result.classification == "SAFE") return Result.success()
    val scanJson = buildScanJson(text, result)
    appendPendingScan(scanJson)
    Log.d(DEBUG_TAG, "[DEBUG-notif] worker persisted pkg=\${pkg}")
    val encoded = Base64.encodeToString(scanJson.toString().toByteArray(Charsets.UTF_8), Base64.NO_WRAP)
    val deepLink = "threatlens://scan/result?data=\${Uri.encode(encoded)}"
    val (t, b) = if (result.classification == "PROMO")
      Pair("Promotional Message Detected", "A promotional message was received from $pkg.")
    else Pair("Threat Alert: \${result.classification}",
      "Potential \${result.classification.lowercase()} content detected from $pkg. Tap for full analysis.")
    postNotification(t, b, deepLink)
    Log.d(DEBUG_TAG, "[DEBUG-notif] worker alert posted pkg=\${pkg} cls=\${result.classification}")
    return Result.success()
  }

  private fun isAllowedPackage(pkg: String): Boolean {
    return ALLOWED_MESSAGING_PACKAGES.contains(pkg) || pkg.contains(".mms") || pkg.endsWith(".sms")
  }

  private fun getAppProcessState(): AppProcessState {
    val prefs = applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val isAppActive = prefs.getBoolean(PREFS_APP_ACTIVE, false)
    val am = applicationContext.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
    val process = am.runningAppProcesses
      ?.firstOrNull { it.processName == applicationContext.packageName }
      ?: return AppProcessState.NOT_RUNNING

    return if (isAppActive) {
      AppProcessState.ACTIVE
    } else {
      AppProcessState.ALIVE_IN_BACKGROUND
    }
  }

  private fun tryStartHeadlessTask(
    pkg: String,
    title: String,
    text: String,
    isTruncated: Boolean
  ): Boolean {
    return try {
      val intent = Intent(applicationContext, HeadlessNotificationTaskService::class.java).apply {
        putExtra(NotificationService.EXTRA_PACKAGE_NAME, pkg)
        putExtra(NotificationService.EXTRA_TITLE, title)
        putExtra(NotificationService.EXTRA_TEXT, text)
        putExtra(NotificationService.EXTRA_IS_TRUNCATED, isTruncated)
      }
      HeadlessJsTaskService.acquireWakeLockNow(applicationContext)
      applicationContext.startService(intent)
      true
    } catch (_: Exception) {
      false
    }
  }

  private fun isWorkerDuplicate(pkg: String, text: String): Boolean {
    val normalized = text.trim().lowercase()
    if (normalized.isEmpty()) {
      return false
    }

    val fingerprint = "\${pkg}::\${normalized}"
    val now = System.currentTimeMillis()
    synchronized(recentWorkerFingerprints) {
      recentWorkerFingerprints.entries.removeAll { now - it.value > WORKER_DEDUP_WINDOW_MS }
      if (recentWorkerFingerprints.containsKey(fingerprint)) {
        return true
      }
      recentWorkerFingerprints[fingerprint] = now
    }
    return false
  }

  private fun isNoise(title: String, text: String): Boolean {
    val c = "\$title\\n\$text".trim()
    return c.isBlank() || NOISE_PATTERNS.any { it.containsMatchIn(c) }
  }

  private fun isLowSignal(pkg: String, title: String, text: String): Boolean {
    val c = "\$title\\n\$text".trim()
    if (c.isBlank() || LOW_SIGNAL_PATTERNS.any { it.containsMatchIn(c) }) return true
    if (MESSAGING_PACKAGES_WITH_SHORT_FILTER.contains(pkg) && SHORT_MSG.matches(c))
      return !THREAT_KW.containsMatchIn(c)
    return false
  }

  data class NimResult(val classification: String, val confidence: Int,
    val explanation: String, val redFlags: List<String>, val suggestedActions: List<String>)

  private fun classifyWithNim(text: String, apiKey: String): NimResult? {
    for (model in NIM_MODELS) {
      try {
        val body = JSONObject().apply {
          put("model", model); put("temperature", 0.1); put("max_tokens", 400)
          put("messages", JSONArray().apply {
            put(JSONObject().apply { put("role","system"); put("content", SYSTEM_PROMPT) })
            put(JSONObject().apply { put("role","user"); put("content","Message to classify:\\n\$text") })
          })
        }
        val conn = (URL(NIM_BASE_URL).openConnection() as HttpURLConnection).apply {
          requestMethod = "POST"
          setRequestProperty("Content-Type","application/json")
          setRequestProperty("Authorization","Bearer \$apiKey")
          connectTimeout = 15_000; readTimeout = 20_000; doOutput = true
        }
        OutputStreamWriter(conn.outputStream).use { it.write(body.toString()) }
        val code = conn.responseCode
        if (code == 429 || code == 503) continue
        if (code != 200) return null
        val content = JSONObject(conn.inputStream.bufferedReader().readText())
          .getJSONArray("choices").getJSONObject(0).getJSONObject("message").getString("content")
        return parseNimResponse(content)
      } catch (_: Exception) { continue }
    }
    return null
  }

  private fun parseNimResponse(raw: String): NimResult? = try {
    val t = raw.trim()
    val s = if (t.startsWith("{")) t else {
      val i = t.indexOf('{'); val j = t.lastIndexOf('}')
      if (i == -1 || j <= i) return null else t.substring(i, j + 1)
    }
    val o = JSONObject(s)
    val cls = when (o.optString("classification","SAFE").uppercase()) {
      "PROMO","SPAM","SCAM","PHISHING" -> o.getString("classification").uppercase()
      else -> "SAFE"
    }
    fun arr(k: String) = mutableListOf<String>().apply {
      val a = o.optJSONArray(k); if (a != null) for (i in 0 until a.length()) add(a.getString(i))
    }
    NimResult(cls, o.optInt("confidence",75), o.optString("explanation",""),
      if (cls=="SAFE"||cls=="PROMO") emptyList() else arr("red_flags"),
      if (cls=="SAFE"||cls=="PROMO") emptyList() else arr("suggested_actions"))
  } catch (_: Exception) { null }

  private fun buildScanJson(text: String, r: NimResult) = JSONObject().apply {
    put("id", java.util.UUID.randomUUID().toString())
    put("timestamp", System.currentTimeMillis())
    put("classification", r.classification); put("confidence", r.confidence)
    put("messagePreview", text.take(100)); put("explanation", r.explanation)
    put("redFlags", JSONArray(r.redFlags)); put("suggestedActions", JSONArray(r.suggestedActions))
  }

  private fun appendPendingScan(result: JSONObject) {
    try {
      val file = File(applicationContext.filesDir, PENDING_SCANS_FILE)
      val existing = if (file.exists()) try { JSONArray(file.readText()) } catch (_:Exception) { JSONArray() } else JSONArray()
      val updated = JSONArray(); updated.put(result)
      for (i in 0 until existing.length()) updated.put(existing.get(i))
      file.writeText(updated.toString())
    } catch (_: Exception) {}
  }

  private fun postNotification(title: String, body: String, deepLink: String) {
    ensureChannel()
    val pi = PendingIntent.getActivity(applicationContext, deepLink.hashCode(),
      Intent(Intent.ACTION_VIEW, Uri.parse(deepLink)).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        setPackage(applicationContext.packageName)
      }, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    NotificationManagerCompat.from(applicationContext).notify(System.currentTimeMillis().toInt(),
      NotificationCompat.Builder(applicationContext, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.ic_dialog_info)
        .setContentTitle(title).setContentText(body)
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setAutoCancel(true).setContentIntent(pi).build())
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val mgr = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (mgr.getNotificationChannel(CHANNEL_ID) != null) return
    mgr.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Threat Alerts", NotificationManager.IMPORTANCE_HIGH).apply {
      enableVibration(true); vibrationPattern = longArrayOf(0,250,250,250)
      lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
    })
  }
}
`;
}

function withThreatLensNativeFiles(config) {
  return withDangerousMod(config, ['android', async config => {
    const projectRoot = config.modRequest.projectRoot;
    const packageName = getAndroidPackage(config);
    const packagePath = packageName.split('.');
    const javaDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'java', ...packagePath);

    fs.mkdirSync(javaDir, { recursive: true });

    writeFileIfChanged(
      path.join(javaDir, 'NotificationService.kt'),
      notificationServiceSource(packageName)
    );
    writeFileIfChanged(
      path.join(javaDir, 'NotificationModule.kt'),
      notificationModuleSource(packageName)
    );
    writeFileIfChanged(
      path.join(javaDir, 'NotificationPackage.kt'),
      notificationPackageSource(packageName)
    );
    writeFileIfChanged(
      path.join(javaDir, 'HeadlessNotificationTaskService.kt'),
      headlessTaskServiceSource(packageName)
    );
    writeFileIfChanged(
      path.join(javaDir, 'NotificationWorker.kt'),
      notificationWorkerSource(packageName)
    );

    return config;
  }]);
}

module.exports = function withThreatLensConfig(config) {
  config = withThreatLensManifest(config);
  config = withThreatLensMainApp(config);
  config = withThreatLensNativeFiles(config);
  return config;
};
