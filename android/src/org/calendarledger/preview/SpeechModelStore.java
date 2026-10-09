package org.calendarledger.preview;

import android.content.Context;
import java.io.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/** Installs only the signed, bundled model into the app's private no-backup area. */
final class SpeechModelStore {
    private static final String MODEL="vosk-model-small-cn-0.22";
    private static boolean ready(File directory){return new File(directory,".complete").isFile()&&new File(directory,"am/final.mdl").isFile()&&new File(directory,"conf/model.conf").isFile();}
    static synchronized File ensure(Context context)throws IOException{
        File parent=new File(context.getNoBackupFilesDir(),"speech"),target=new File(parent,MODEL);
        if(ready(target))return target;
        if(!parent.isDirectory()&&!parent.mkdirs())throw new IOException("无法准备中文语音文件。");
        if(parent.getUsableSpace()<100L*1024*1024)throw new IOException("手机可用空间不足，请至少留出 100 MB 后重试。");
        File staging=new File(parent,MODEL+".preparing-"+System.nanoTime());
        if(!staging.mkdirs())throw new IOException("无法准备中文语音文件。");
        long unpacked=0;int entries=0;
        try(ZipInputStream zip=new ZipInputStream(new BufferedInputStream(context.getAssets().open("speech/"+MODEL+".zip")))){
            ZipEntry entry;byte[] buffer=new byte[32768];String prefix=MODEL+"/",base=staging.getCanonicalPath()+File.separator;
            while((entry=zip.getNextEntry())!=null){
                if(++entries>80||!entry.getName().startsWith(prefix))throw new IOException("中文语音文件格式不正确。");
                String relative=entry.getName().substring(prefix.length());if(relative.isEmpty()){zip.closeEntry();continue;}
                File destination=new File(staging,relative);
                if(!destination.getCanonicalPath().startsWith(base))throw new IOException("中文语音文件路径不正确。");
                if(entry.isDirectory()){if(!destination.isDirectory()&&!destination.mkdirs())throw new IOException("无法准备中文语音目录。");}
                else{
                    File folder=destination.getParentFile();if(!folder.isDirectory()&&!folder.mkdirs())throw new IOException("无法准备中文语音目录。");
                    try(OutputStream out=new BufferedOutputStream(new FileOutputStream(destination))){int count;while((count=zip.read(buffer))!=-1){unpacked+=count;if(unpacked>128L*1024*1024)throw new IOException("中文语音文件过大。");out.write(buffer,0,count);}}
                }
                zip.closeEntry();
            }
        }
        if(!new File(staging,"am/final.mdl").isFile()||!new File(staging,"conf/model.conf").isFile())throw new IOException("中文语音文件不完整，请覆盖安装完整版本。");
        try(OutputStream marker=new FileOutputStream(new File(staging,".complete"))){marker.write(MODEL.getBytes("UTF-8"));}
        if(target.exists()&&!target.renameTo(new File(parent,MODEL+".previous-"+System.nanoTime())))throw new IOException("无法更新中文语音文件。");
        if(!staging.renameTo(target))throw new IOException("无法完成中文语音准备，请重试。");
        return target;
    }
}
