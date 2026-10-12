# 原生桌面月历实现与验证

`CalendarWidgetProvider` 提供 Android AppWidget/RemoteViews；默认请求 4×5 格，尺寸选项由桌面提供，Android 12+ 使用响应尺寸或缺省布局。原生 XML 使用可用于 RemoteViews 的标准控件；v0.3.1 统一莫兰迪配色，v0.3.2 为每个日期添加浅底色框格。

`SnapshotStore` 保持原 `ledger-state-v1.json` 的格式、路径及 AtomicFile 持久化，并让应用与组件读写共用一把锁。保存成功后，对账目、日程、日历颜色、设置和节假日数据计算指纹；业务投影变化时刷新组件，聊天与未发送草稿更新不重绘月历。每个组件的显示月份单独保存，刷新不会重置已翻阅月份。

常见节日由 `android/build-widget-festivals.mjs` 使用应用已有的 lunar-javascript 1.7.7 与 `festivals.mjs` 生成 2020—2100 年稀疏索引。v0.3.2 同时生成覆盖 29,585 天的农历短标签；初一显示农历月份，其余日期显示农历日数，月份由库直接给出，避免闰月前缀重复。不使用 Android WebView 的 ICU 农历计算。放假/补班读取应用保存的年度缓存；已缓存年度整体替换内置年度数据。没有年度缓存时读取 APK 内置 holiday-cn 数据，未公布安排不推测。

AI 和日期按钮直接使用明确指向 MainActivity 的不可变 PendingIntent；日期与组件 ID 在 URI 中分别区分，避免按钮互相覆盖。MainActivity 保存待跳转目标，等待 JavaScript 的 widgetReady 回调后交付；已运行的 Activity 通过 onNewIntent 跳转。日期入口只导航，AI 入口打开现有聊天，均不自动提交消息或调用麦克风。

组件在系统更新、尺寸变化、日期/时区变化、升级及开机后刷新。下一日日期高亮使用非精确午夜调度，并保留平台定期更新。系统日历读写仍未接入；组件共享的是本应用自己的日程。

`CalendarMoney` 与 JavaScript `cashflow` 采用一致口径：读取所有已记录账本的整数分金额，收入单独累计、退款抵减支出，内部转账不进入收入或支出。完全退款的日期仍显示零金额，退款超过支出时显示“退”，纯转账日期显示“转”。大金额使用千/万缩写，完整精确金额放入日期的无障碍描述，点日期进入应用详情。

大号设计将月份和年份压成一行，保留小号 AI 按钮；每个日期使用内嵌的 `widget_day_surface` 作为浅底色细框格，外层仍承载该日期的点击入口。正常格子留 4 dp 横向、2 dp 纵向间隙，紧凑格保留 2 dp 间隙；背景分别处理工作日、周末、跨月日期和今天，深色模式有对应 drawable。日期靠左，节日或农历另占一行，日程与收入/支出随后连续排列，取消中间扩张留白。日程与两条记账的空间一起计算，更多日程数量在日期旁显示，不占用标题行。短标题直接测量实际文字；长标题通过 StaticLayout 的真实字体与后备字体行距测量，运行检查同时验证最后一行在控件内。渲染按列宽与各侧 padding 的像素舍入选择字号，避免 RemoteViews 重用控件时保留旧字号导致金额裁切。

`tools/generate-widget-preview.py` 从实时使用的根、周、日期 XML 生成组件选择器的静态预览。输入为用项目农历库计算的日期标签 JSON（日期键映射 `{label, badge, festival}`），预览固定使用 2026 年 10 月及示例数据，不访问用户记录。

## 验证

- `node --test prototype/tests/*.test.mjs`：35 项业务、桥接、节日、识图卡片及入口参数测试。
- `CalendarMonthTest`：6 项边界检查和 2020—2100 年 1,944 组月份/周起始日组合；`ReminderDatesTest`：6 项重复日期检查；`CalendarMoneyTest`：13 项记账、退款、转账、有效日期和大金额检查。GitHub Actions 执行这些日期检查。
- `WidgetRuntimeTest`：单独签名测试 APK，使用真实 AppWidgetHost 绑定发布 APK 的组件，把平台 RemoteViews 放在仅测试存在的原生宿主层中，以实际触摸事件检查按钮。交付 APK 不包含这个宿主层。
- `run-widget-runtime-test.py`：只接受隔离的 `emulator-5580`，检查 `ro.kernel.qemu=1`，从已安装的发布版 0.3.1 开始原签名覆盖升级，不清除数据、不降级。中断修复后可 `--resume` 重装当前升级包并沿用原升级基线证据。仅修复页面截图检查时，可 `--resume-appearance`，要求包括 sparse-grid 在内的原生阶段均通过，并验证手机中当前 APK 的字节散列与交付 APK 相同，才复用已通过的阶段。

运行原生检查前，按 `build-tools/setup-runtime-test.py` 准备隔离模拟器、构建交付 APK，再运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File android/build-runtime-test.ps1
python android/tests/run-widget-runtime-test.py
```

报告与截图先输出到 `prototype/qa`，审阅后的发布结果放到 `dist`。84 项运行检查通过，使用 Android 16 / API 36；宿主尺寸为 370×540 dp、250×460 dp 与最小 230×460 dp，并检查系统字体 1.3 倍。新增 sparse-grid 阶段会暂存并恢复测试快照，分别检查零、一、三条日程下的所有框格、横向间隙、农历、节日及日程/金额边界。尚未使用 Samsung One UI Home 或真实用户 API Key，模拟器结果不等同于三星桌面的占格、留白或后台调度实测。
