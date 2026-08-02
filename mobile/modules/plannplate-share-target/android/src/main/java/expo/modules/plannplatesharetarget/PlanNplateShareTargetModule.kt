package expo.modules.plannplatesharetarget

import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.ArrayDeque
import java.util.UUID

/**
 * Reads recipe links handed to PlanNplate through the Android share sheet.
 *
 * On Android the app process is itself the share target: `MainActivity` is
 * declared with an ACTION_SEND / text/plain intent filter (added in
 * app.config.js) and `launchMode="singleTask"`, so a share either launches the
 * app or arrives at `onNewIntent` on an app that's already running. Both paths
 * land here.
 *
 * The one rule that matters: **an intent is read exactly once**. An Activity
 * keeps its launch intent for its whole life, so without clearing the extras a
 * rotation, a theme change, a return from the background or a process
 * recreation would each look like a brand-new share and import the recipe
 * again. Clearing at the point of read is the cheapest place to be certain of
 * that; the JavaScript layer then has two further idempotency guards behind it
 * (see lib/share/import-orchestrator.ts).
 */
class PlanNplateShareTargetModule : Module() {
  /** Shares that arrived via onNewIntent before JavaScript came asking. */
  private val queue = ArrayDeque<Map<String, Any?>>()

  /** Whether THIS launch was caused by a share. Reported as `cold_start`. */
  private var launchedFromShare = false

  override fun definition() = ModuleDefinition {
    Name("PlanNplateShareTarget")

    Events("onShareReceived")

    OnCreate {
      // The activity may already hold a share intent by the time the JS bundle
      // finishes loading — that's the cold-start case, and it's the common one.
      val intent = appContext.currentActivity?.intent
      val payload = intent?.let { consumeShareIntent(it) }
      if (payload != null) {
        launchedFromShare = true
        queue.addLast(payload)
      }
    }

    OnNewIntent { intent ->
      // Warm start, or the app was already open. `singleTask` routes the share
      // here rather than starting a second activity.
      val payload = consumeShareIntent(intent)
      if (payload != null) {
        queue.addLast(payload)
        sendEvent("onShareReceived", payload)
      }
    }

    AsyncFunction("getPendingShares") {
      // Re-check the current intent as well: OnCreate can run before the
      // activity is attached on a cold start, in which case the queue is empty
      // and the intent is still sitting there unread.
      appContext.currentActivity?.intent?.let { intent ->
        consumeShareIntent(intent)?.let { queue.addLast(it) }
      }
      val drained = queue.toList()
      queue.clear()
      drained
    }

    AsyncFunction("consumePendingShare") { id: String ->
      // The payload is already out of the intent; this only clears a copy still
      // sitting in the queue because JavaScript dropped it without importing.
      val remaining = queue.filterNot { it["id"] == id }
      queue.clear()
      queue.addAll(remaining)
    }

    Function("wasLaunchedFromShare") {
      launchedFromShare
    }

    // Exists for parity with iOS, where an unreachable App Group container is a
    // real and silent failure mode. Android reads the intent directly, so there
    // is no container to be unable to reach.
    Function("isContainerReachable") {
      true
    }
  }

  /**
   * Pull a share payload out of an intent and strip it, so the same intent can
   * never yield a second payload.
   *
   * Returns null for anything that isn't a text share carrying actual text —
   * including the plain launcher intent, which is what this sees on every
   * ordinary app open.
   */
  private fun consumeShareIntent(intent: Intent): Map<String, Any?>? {
    if (intent.action != Intent.ACTION_SEND) return null

    val type = intent.type
    // The manifest filter only advertises text/plain, but an intent can still
    // arrive with a null type from a poorly-behaved sender.
    if (type != null && !type.startsWith("text/")) return null

    val text = readText(intent)
    val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)?.takeIf { it.isNotBlank() }
    if (text == null && subject == null) return null

    // Strip before returning. Anything left on the intent is a redelivery
    // waiting to happen.
    intent.removeExtra(Intent.EXTRA_TEXT)
    intent.removeExtra(Intent.EXTRA_SUBJECT)
    intent.clipData = null

    return mapOf(
      "id" to UUID.randomUUID().toString(),
      // Android never distinguishes "a URL" from "text that contains one", so
      // everything goes in `text` and lib/share/url-ingest.ts does the work.
      "text" to text,
      "subject" to subject,
      "capturedAt" to System.currentTimeMillis().toDouble(),
    )
  }

  /**
   * The shared text, from either place Android puts it.
   *
   * `EXTRA_TEXT` is the documented location and covers Chrome, Instagram,
   * TikTok, YouTube and Pinterest. `ClipData` is checked too because some
   * senders populate only that — reading both costs nothing and avoids a share
   * that silently does nothing.
   */
  private fun readText(intent: Intent): String? {
    val extra = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
    if (!extra.isNullOrBlank()) return extra

    val context = appContext.reactContext ?: return null
    val clip = intent.clipData ?: return null
    for (index in 0 until clip.itemCount) {
      val value = clip.getItemAt(index).coerceToText(context)?.toString()
      if (!value.isNullOrBlank()) return value
    }
    return null
  }
}
