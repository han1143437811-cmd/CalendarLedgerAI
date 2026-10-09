package org.calendarledger.preview.test;

import android.content.Intent;
import android.os.*;
import android.speech.*;
import java.util.ArrayList;

/** Test APK only: deterministic transcripts, not an audio recognition engine. */
public class FixtureRecognitionService extends RecognitionService {
    private final Handler handler=new Handler(Looper.getMainLooper());
    private Callback callback;
    private Runnable result;
    @Override protected void onStartListening(Intent intent,Callback listener){
        callback=listener;
        try{listener.readyForSpeech(new Bundle());Bundle partial=new Bundle();ArrayList<String> words=new ArrayList<>();words.add("今天午饭");partial.putStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION,words);listener.partialResults(partial);}catch(RemoteException ignored){}
        result=()->respond();handler.postDelayed(result,1200);
    }
    private void respond(){if(callback==null)return;Callback previous=callback;callback=null;try{Bundle results=new Bundle();ArrayList<String> words=new ArrayList<>();words.add("今天午饭38元，地铁6元");results.putStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION,words);previous.results(results);}catch(RemoteException ignored){}}
    @Override protected void onStopListening(Callback listener){if(result!=null)handler.removeCallbacks(result);respond();}
    @Override protected void onCancel(Callback listener){if(result!=null)handler.removeCallbacks(result);callback=null;}
}
