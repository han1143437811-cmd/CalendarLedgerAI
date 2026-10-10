# 原生桌面月历实现与验证

`CalendarWidgetProvider` 提供 Android AppWidget/RemoteViews；默认请求 4×5 格，尺寸选项由桌面提供，Android 12+ 使用响应尺寸或缺省布局。原生 XML 使用可用于 RemoteViews 的标准控件，日期、标题与事件按尺寸显示。

`SnapshotStore` 保持原 `ledger-state-v1.json` 的格式、路径及 AtomicFile 持久化，并让应用与组件读写共用一把锁。保存成功后，对日程、日历颜色、设置和节假日数据计算指纹；业务投影变化时刷新组件，聊天和账目更新不会反复重绘月历。每个组件的显示月份单独保存，刷新不会重置已翻阅月份。

常见节日由 `android/build-widget-festivals.mjs` 使用应用已有的 lunar-javascript 1.7.7 与 `festivals.mjs` 生成 2020—2100 年稀疏索引，不使用 Android WebView 的 ICU 农历计算。放假/补班读取应用保存的年度缓存；已缓存年度整体替换内置年度数据。没有年度缓存时读取 APK 内置 holiday-cn 数据，未公布安排不推测。

AI 和日期按钮直接使用明确指向 MainActivity 的不可变 PendingIntent；日期与组件 ID 在 URI 中分别区分，避免按钮互相覆盖。MainActivity 保存待跳转目标，等待 JavaScript 的 widgetReady 回调后交付；已运行的 Activity 通过 onNewIntent 跳转。日期入口只导航，AI 入口打开现有聊天，均不自动提交消息或调用麦克风。

组件在系统更新、尺寸变化、日期/时区变化、升级及开机后刷新。下一日日期高亮使用非精确午夜调度，并保留平台定期更新。系统日历读写仍未接入；组件共享的是本应用自己的日程。

## 验证

- `node --test prototype/tests/*.test.mjs`：35 项业务、桥接、节日、识图卡片及入口参数测试。
- `CalendarMonthTest`：6 项边界检查和 2020—2100 年 1,944 组月份/周起始日组合；`ReminderDatesTest`：6 项重复日期检查。GitHub Actions 执行这些日期检查。
- `WidgetRuntimeTest`：单独签名测试 APK，使用真实 AppWidgetHost 绑定发布 APK 的组件，把平台 RemoteViews 放在仅测试存在的原生宿主层中，以实际触摸事件检查按钮。交付 APK 不包含这个宿主层。
- `run-widget-runtime-test.py`：只接受隔离的 `emulator-5580`，检查 `ro.kernel.qemu=1`，从已安装的发布版 0.2.3 开始原签名覆盖升级，不清除数据、不降级。中断修复后可 `--resume` 重装当前升级包并沿用原升级基线证据。

运行原生检查前，按 `build-tools/setup-runtime-test.py` 准备隔离模拟器、构建交付 APK，再运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File android/build-runtime-test.ps1
python android/tests/run-widget-runtime-test.py
```

报告与截图先输出到 `prototype/qa`，审阅后的发布结果放到 `dist`。51 项运行检查通过，使用 Android 16 / API 36；宿主尺寸为 370×540 dp 与 250×400 dp，并检查系统字体 1.3 倍。尚未使用 Samsung One UI Home 或真实用户 API Key，模拟器结果不等同于三星桌面的占格、留白或后台调度实测。
