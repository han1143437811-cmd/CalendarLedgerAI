package org.calendarledger.preview;

import android.content.Context;
import android.util.AtomicFile;
import android.util.Log;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;

/** The app and widgets share the same durable file and the same read/write lock. */
final class SnapshotStore {
    private static final Object LOCK = new Object();
    private static AtomicFile file(Context context) {
        return new AtomicFile(new File(context.getFilesDir(), "ledger-state-v1.json"));
    }
    static String read(Context context) {
        synchronized (LOCK) {
            try (InputStream input = file(context).openRead()) {
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                byte[] buffer = new byte[8192]; int count;
                while ((count = input.read(buffer)) != -1) bytes.write(buffer, 0, count);
                return new String(bytes.toByteArray(), StandardCharsets.UTF_8);
            } catch (FileNotFoundException missing) {
                return "";
            } catch (IOException error) {
                Log.e("CalendarLedger", "Cannot read saved app data", error);
                return "";
            }
        }
    }
    static JSONObject save(Context context, String json) {
        synchronized (LOCK) {
            AtomicFile file = file(context); FileOutputStream output = null;
            try {
                JSONObject snapshot = new JSONObject(json);
                JSONObject state = snapshot.getJSONObject("state");
                if (snapshot.optInt("version") != 1 || state.optInt("version") != 1
                        || snapshot.getJSONObject("aiConfig").has("apiKey")) return null;
                output = file.startWrite();
                output.write(json.getBytes(StandardCharsets.UTF_8));
                file.finishWrite(output);
                return state;
            } catch (Exception error) {
                if (output != null) file.failWrite(output);
                Log.e("CalendarLedger", "Cannot save app data", error);
                return null;
            }
        }
    }
}
