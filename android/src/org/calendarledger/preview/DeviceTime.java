package org.calendarledger.preview;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import org.json.JSONObject;

/** Local, permission-free clock snapshot. No polling or network service. */
final class DeviceTime {
    static JSONObject now()throws Exception{return at(Instant.now(),ZoneId.systemDefault());}
    static JSONObject at(Instant instant,ZoneId zone)throws Exception{
        ZonedDateTime local=instant.atZone(zone);
        String date=local.toLocalDate().toString(),time=local.format(DateTimeFormatter.ofPattern("HH:mm:ss",Locale.ROOT));
        String offset=local.getOffset().getId();if("Z".equals(offset))offset="+00:00";
        String[] weekdays={"星期一","星期二","星期三","星期四","星期五","星期六","星期日"};
        return new JSONObject().put("epochMillis",instant.toEpochMilli()).put("date",date).put("time",time).put("weekday",weekdays[local.getDayOfWeek().getValue()-1])
            .put("timeZone",zone.getId()).put("utcOffset",offset).put("localDateTime",date+"T"+time+offset).put("utc",instant.toString()).put("source","android-system");
    }
}
