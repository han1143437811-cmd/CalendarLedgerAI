# S24 Ultra 大号单月组件设计依据

检索日期：2026-10-10。目标设备：Samsung S24 Ultra，One UI 8.5，无 Root。用户指定以三星最大的大号单月组件为参考，同时显示 AI 入口、日程、记账与节日。

## 尺寸与证据边界

- 本项目请求 **4×5 桌面占格**，用户可拉到桌面全宽。三星社区的真实使用反馈将大号月历称为 4×5，但这不是三星发布的 S24 Ultra / One UI 8.5 像素规格表。[三星社区大号月历反馈](https://us.community.samsung.com/t5/Galaxy-S25/Always-On-Display-no-longer-customizable-on-S25-Ultra/m-p/3176063)、[2026 年三星社区月历讨论](https://eu.community.samsung.com/t5/aplikacje-i-us%C5%82ugi/bd-p/mobile-apps-pl/page/16)。
- 三星官方说明允许拖动组件边框调整大小；可用空间由桌面网格、显示缩放和启动器决定。[三星官方组件使用说明](https://www.samsung.com/us/support/answer/ANS10000945/)。没有找到该手机上最大单月组件唯一固定的 dp 或像素宽高，不能将网上截图尺寸直接当成设备尺寸。
- Android 的 `targetCellWidth` / `targetCellHeight` 是占格请求；组件内容通过启动器回传的实际尺寸选择布局。[Android 官方组件尺寸适配说明](https://developer.android.com/develop/ui/views/appwidgets/layouts)。本项目的大号主要验证矩形为 **370×540 dp**，并验证 5 行与 6 行月份。这个验证矩形是工程用尺寸，不是三星实机测量值。

## 参考的界面与功能

| 来源 | 可核实内容 | 本项目采用的设计判断 |
| --- | --- | --- |
| [Samsung Calendar 官方介绍](https://www.samsung.com/uk/mobile-phone-buying-guide/what-are-widgets/) | 月历与当日日程组合、快捷查看信息 | 月历为主体，AI 为小入口，避免工具栏占用日期格 |
| [Month: Calendar Widget & Theme 开发者商店页](https://play.google.com/store/apps/details?id=com.candl.chronos&hl=en) | 主题、农历、日程与日历选择；有官方界面截图 | 用统一的浅色卡片与少量强调色，减少装饰 |
| [Business Calendar 2 开发者介绍](https://www.appgenix-software.com/?page_id=463) | 月/周/日/日程组件与可定制主题 | 采用明确的周行、稳定的日期格，避免零散漂浮的文字 |
| [Business Calendar 字体与组件说明](https://appgenix.uservoice.com/knowledgebase/articles/881022-widget-pro-functions-overview) | 日期、标题和时间字体可分开设置 | 月份、日期、日程与金额独立控制字号与占用空间 |
| [Your Calendar Widget 官方网站](https://www.yourcalendarwidget.com/) | 桌面日程、主题与任务显示 | 保持信息层次清楚，长内容提供摘要与进入详情的入口 |

上表最后一列是本项目根据来源作出的设计选择，并非这些应用原样包含本项目的记账功能。未复制其他应用图标、截图素材或源码。

## v0.3.1 落地布局（历史）

1. 顶部为一行月份、年份、翻月箭头与小号 AI 按钮，取消大标题和大胶囊按钮。
2. 星期为浅灰小字。各周用很淡的横线分隔，日期靠左，与格内内容对齐。
3. 日期格上部为日期与放假/补班标记，节日有独立的小字行。
4. 中部为最多两条日程摘要，每条最多两行；超出的日程数量在日期旁用 `+N` 表示，数量不占用日程正文。
5. 格子底部为独立的支出和收入行，与日程中部互不覆盖。退款抵减支出，内部转账不计收支。
6. 今天同时使用小号日期底色与淡灰绿日期格底色。莫兰迪颜色用于强调和日程背景，正文使用更深的低饱和色。

两行中文的实际高度会受后备字体影响。本项目根据实际标题与字体测量两行排版，并在运行检查中验证文字行底部没有超出日程区域；不是只检查 TextView 的外框。[Android StaticLayout 官方字体行距说明](https://developer.android.com/reference/android/text/StaticLayout.Builder#setUseLineSpacingFromFallbacks(boolean))。

## 验证范围

使用 Android 16 / API 36 模拟器中的真实 `AppWidgetHost` 检查尺寸、边界、中文两行、日程/账目同步、深色和系统字体 1.3 倍。测试宿主不进入安装包。尚未取得 S24 Ultra / One UI Home 的实机测量，桌面实际占格与后台刷新以手机验收为准。

## 2026-10-12：少量日程下的浅色框格

用户进一步明确：每一天之间有浅浅的底色框格，用边界区分改善空旷感；继续使用莫兰迪配色。本次保留全宽单月，不新增下方摘要区。此前“中部日程、底部金额”的布局改为同一日期框格内连续排列，并在普通日期显示农历小字。

| 检索来源 | 界面依据 | 本次设计选择 |
| --- | --- | --- |
| [三星官方组件说明](https://www.samsung.com/uk/mobile-phone-buying-guide/what-are-widgets/) | 提供月历与当日日程等快速概览组合 | 保留清楚的月份、星期、日期和简洁入口；未把示例截图当成实机尺寸 |
| [streak_calendar 开发者示例](https://github.com/habit-rewards/streak_calendar) | 日期边界、圆角、背景、边框及跨月日期可分别设置 | 每天都有独立的浅框格，跨月日期整体淡化；仅参考结构，没有引入源码或依赖 |
| [Daniel 的 Calendar UI 设计](https://dribbble.com/shots/26715484-Borderless-Calendar-UI-Dashboard) | 作品采用轻淡分区、网格和有节制的强调 | 选用低对比底色和细边界，避免深粗网格；配色仍来自本项目 |
| [React DayPicker 官方样式说明](https://daypicker.dev/docs/styling) | 日期尺寸、圆角、边框、强调背景及跨月样式分开配置 | 框格、文字与日期状态分别设计，不通过缩小全部文字来腾出空间 |

上表最后一列是本项目对参考的判断，浅框格方案由用户明确提出。普通格子采用灰绿 `#F1F3ED`，周末为暖灰 `#F5F0ED`；0.5 dp 细边框、5 dp 小圆角，正常大号日期格之间约 4 dp 横向间隙、2 dp 纵向间隙。深色模式对应使用暗灰绿与暗暖灰。今天通过稍深底色和日期圆形强调区分。没有复制三星颜色、图标或其他项目源码。

新增 0 / 1 / 3 条日程的六行月份验收，检查每个日期框格、细间隙、日程/金额同格排列及最小尺寸下的内容边界。完整 84 项 Android 16 运行结果见 `dist/验证结果-v0.3.2.json`。截图为合成测试账目与日程，不是用户数据；S24 Ultra 实机仍待用户体验确认。


## v0.3.3 · 日期旁的天气（2026-10-12）

按用户要求在日期数字后的空白放天气小图标，正常/紧凑分别 10/8 dp，采用原创的莫兰迪线图并沿用浅色框格；不扩展日期行高度，不挤占日程或金额，空间紧张时优先保留原信息。城市与来源利用原有顶部高度。新天气设置的温度与七天概览留在应用中，桌面仅展示图标。

[Open-Meteo 日预报文档](https://open-meteo.com/en/docs) 支持最多 16 天及每日 WMO 天气码；[城市搜索](https://open-meteo.com/en/docs/geocoding-api) 以用户明确选择为准；[许可](https://open-meteo.com/en/licence) 与 [非商业免费条款](https://open-meteo.com/en/terms) 在本日核对。日图标表示当天预报；更远或过去日期不填天气。联网仅由可见 Activity 发起，组件使用本地缓存。此处不将天气接口或图标当作三星 UI 素材来源。

实际检查为 Android 16 AppWidgetHost 的 370×540 / 250×460 / 230×460 dp，含字体 1.3 倍、放假/补班与更多日程计数碰撞；三星实机尺寸仍未测量。完整更新与验证规则见 [WEATHER.md](WEATHER.md)。
