# 日历账本 AI · CalendarLedgerAI

**把日程、收支和 AI 助手放进同一张日历。**

CalendarLedgerAI 是一款面向 Android 的个人日程与记账应用。在日历中同时查看安排和每日收支，通过文字、普通话语音或消费截图与 AI 交互，完成记账、日程管理、信息查询和收支分析。日历和基础账本无需联网即可使用；自由对话与图片理解需自行配置可用的 AI 接口。

当前公开版本为 **v0.3.4 预览版**（2026-10-13 构建与验证），支持 Android 8.0 及以上，无需 Root。应用独立实现并维护，不包含 Fossify Calendar 的源码。

[**下载 Android APK**](https://github.com/han1143437811-cmd/CalendarLedgerAI/releases/download/v0.3.4/CalendarLedgerAI-v0.3.4.apk) · [版本与源码](https://github.com/han1143437811-cmd/CalendarLedgerAI/releases/tag/v0.3.4) · [安装指南](dist/手机安装说明.md)

## 桌面月历与 AI

0.3.4 加入 **订阅费按天分摊、AI 持久偏好与重开后连续对话**。日期数字旁的莫兰迪天气图标继续仅在打开应用时联网更新。每一天沿用 **浅底色圆角框格**，日程少或没有日程时也能清楚区分日期边界。工作日为浅灰绿，周末为浅暖灰，跨月日期整体淡化，今天稍深强调；沿用莫兰迪配色。日期、农历或节日、日程和每日收支集中在同一格内，短日程标题更易读。保留单行月份与年份、小号 AI 按钮和全宽单月布局。默认请求 **4×5 格**，可横向、纵向调整大小；实际占格由桌面网格决定。

<p>
  <img src="dist/桌面小组件分摊预览-v0.3.4.png" width="300" alt="30元月订阅按天显示，总额不变，实际付款保留">
  <img src="dist/AI记忆设置预览-v0.3.4.png" width="300" alt="AI持久偏好与上下文设置">
</p>

<sub>以上为交付 APK 在 Android 16 模拟器的真实 AppWidgetHost 中的截图，分摊示例为30元月订阅，记忆与账目为测试数据。宿主仅存在于测试 APK，未使用三星 One UI 桌面。</sub>

长按桌面空白处 → **小组件 → 日历账本 AI → 大号月历与账本**，拖到桌面；也可从应用 **更多 → 桌面小组件** 请求添加。点 AI 打开现有聊天并保留未发送草稿；点日期直接进入当天详情。账目与日程新增、修改、删除和节假日缓存更新后刷新组件。红色减号表示支出，绿色加号表示收入；退款抵减支出，退款大于当日消费时显示“退”，内部转账单独显示“转”。大金额使用千/万缩写，点击日期查看精确金额。浅色/深色、大字和周起始日跟随应用设置，多个组件各自记住月份。

天气在 **更多 → 桌面天气** 中搜索并选择城市，选定后立即获取预报，以后打开或返回应用前台时更新；桌面翻月、午夜、尺寸变化和停留桌面都不联网获取天气。缓存、城市与更新时间独立保存在本机，无需定位授权或天气 Key。图标只用既有日期标题行的空白；拥挤时优先保留日期、调休标记、日程数和两条金额，省略可选天气图标。天气设置展示高低温、未来七天概览及最近更新时间。

预报最多 16 天，以有效返回日期为准，不补齐整个月。网络失败保留上次成功缓存；超过 24 小时标记较早缓存，超过 72 小时隐藏旧预报。数据来自 [Open-Meteo](https://open-meteo.com/) 与 [GeoNames](https://www.geonames.org/)，来源和许可在应用、小组件中可见。更新规则、接口与验证见 [天气说明](docs/WEATHER.md)。

## 界面预览

<p>
  <img src="dist/手机月历预览-v0.3.4.png" width="260" alt="日历月视图，显示节日、日程与收支">
  <img src="dist/手机账本预览-v0.3.4.png" width="260" alt="账目列表与每日明细">
  <img src="dist/手机AI对话预览-v0.3.4.png" width="260" alt="AI 助手聊天界面">
</p>

<sub>以上均为 v0.3.4 APK 在 Android 16 模拟器中的实际页面，展示莫兰迪浅色界面与示例数据。</sub>

## 主要功能

**📅 日历与日程**

月、周、日视图集中展示日程、每天的收入与支出、中国传统节日及法定节假日。支持日程提醒、待办事项、每日/每周/每月重复，以及按工作日空档安排任务。月视图优先展示整月概览，点选日期后可向下滚动查看详情。

**💰 本地记账与统计**

管理收入、支出、退款、转账、分类、账户和多个账本；可新增、修改、删除、筛选与撤销操作。收支统计在本地按整数“分”计算，支持按日期、类别或账本分析，也可与上月同期比较。新增费用按天分摊：保留原付款，在应用日历和小组件显示每日费用，实际收支统计仍按真实付款；修改源金额后分摊自动更新。支持 CSV 导出和 JSON 备份。

**🤖 AI 助手**

可以通过自然语言要求助手新增或修改账目、管理日程、查找空档、分析收支和调整部分设置。助手通过应用提供的工具执行操作，分析结果基于本地计算数据。使用自由对话需自行配置 DeepSeek 或兼容 Chat Completions 的服务；不配置 API 时可使用有限中文指令的本地演示。现在保存最多40条明确偏好与最近200条聊天；每轮重建近期对话、真实对象ID和操作结果，应用重开后也能继续修改此前账目。聊天顶部或“更多 → AI记忆”可管理记忆。查询不缓存旧结果，分摊/记忆完成声明核对真实工具执行。详情见 [AI操作与记忆](docs/AI_OPERATIONS.md)。

**🖼️ 截图与照片辅助录入**

在 AI 对话中最多选择三张图片，使用支持图像理解及工具调用的模型提取候选账目或日程，并生成可编辑的核对卡片。**识别内容不会直接写入账本**，需要检查并确认保存。识别结果的准确性取决于所配置的模型与图片质量。

**🎙️ 普通话离线语音输入**

APK 内置 Vosk 普通话模型，语音在设备上转为可修改的文字草稿。核对后再发送给助手，不会自动记账，也无需上传录音至 AI 服务。

**🎨 使用体验**

使用暖白、灰绿、雾蓝、淡杏与豆沙等莫兰迪配色，提供浅色与深色界面、大字显示、离线农历节日，以及从公开数据镜像更新中国节假日及调休安排。尚未公布的年份不会自行推测假期。

## 安装与快速开始

1. 下载并安装 [CalendarLedgerAI v0.3.4 APK](https://github.com/han1143437811-cmd/CalendarLedgerAI/releases/download/v0.3.4/CalendarLedgerAI-v0.3.4.apk)。包名为 `org.calendarledger.preview`；已安装同签名试用版时直接覆盖更新，保留原数据；不要先卸载或清除数据，建议先导出备份。
2. 首次打开可使用示例账本体验日历、记账和本地演示指令。开始记录真实数据前，建议导出备份并清空示例内容。
3. 需要自由 AI 对话或截图理解时，进入 **更多 → AI 与设置**，填写实际可用的 API 地址、模型名称和 API Key，测试连接后保存。
4. 使用桌面天气时，进入 **更多 → 桌面天气**，搜索并选择城市，再返回桌面查看小组件。
5. 在 **AI 助手** 页面输入文字、选择图片，或点击麦克风生成普通话文字草稿。保存图片识别卡片前，请仔细核对金额、日期和分类。

APK 约 **49.4 MiB**，内置语音模型首次准备还会占用额外本地存储。详细步骤、权限及问题排查参见 [手机安装说明](dist/手机安装说明.md)。

## 数据、隐私与联网

账目、日程和应用数据默认保存在设备本地。Android 端 API Key 使用 **Android Keystore 与 AES-GCM** 加密保存，不包含在业务备份中。离线语音识别不上传音频。

使用远程 AI 时，当前对话、执行任务所需的账目或日程上下文，以及主动选取的图片会发送至用户配置的 API 服务，可能产生费用。天气仅发送搜索词或所选城市坐标到天气提供方，不携带账目、日程、聊天、录音或 AI Key。节假日联网更新使用 [NateScarlet/holiday-cn](https://github.com/NateScarlet/holiday-cn) 的公开数据镜像；未联网时仍可使用已缓存或内置的数据。

## 当前范围与验证

这是一个**功能预览版本**，不是已完成所有适配的正式产品。当前不支持系统日历同步、自动读取微信或支付宝流水、账户余额和跨设备同步，也没有集成 Fossify Calendar 源码。

v0.3.4 在 **2026-10-13** 完成 **59 项 Node 检查、1,838 项原生分摊算法检查和 169 项 Android 16 运行检查**。浏览器另通过 24 项界面/工具链路检查、15 项模拟 API 的分摊与冷重载上下文检查，以及 10 项聊天滚动检查。从公开 0.3.3 原签名覆盖升级验证旧账目、日程和加密的测试配置保留。

分摊检查覆盖月长/闰年、跨月服务期间、整数分余数、同计划重试、源金额更新、取消/删除/撤销以及旧备份兼容。真实 Android WebView 与 AppWidgetHost 验证按天金额、冷启动跟进修改、记忆管理和169项既有/新增行为。天气的66项前台/缓存专项检查再次通过，语音资源与节日索引保持不变。

本版另通过 17 项浏览器多模态回归检查，覆盖真实图片解码、核对卡片编辑/保存、冷重载和模拟语音回填；语音回填使用测试替身，不代表实际麦克风音频验证。

**尚未验证**：用户 S24 Ultra / One UI 8.5 的真实桌面，以及真实 DeepSeek Key 下每一种自然语言表达。模拟 API 检查验证应用的执行链路，不代表真实服务的理解质量；本次不重新运行真实天气 HTTPS、语音识别或通知投递。详见 [验证报告](dist/验证结果-v0.3.4.json)、[AI操作与记忆](docs/AI_OPERATIONS.md)、[天气说明](docs/WEATHER.md)；旧版证据保留在 [开发历史](docs/DEVELOPMENT_HISTORY.md)。

## 开发与构建

项目包含浏览器预览和 Android WebView 应用，核心界面与业务逻辑位于 `prototype/`，Android 入口及原生桥接位于 `android/`。

浏览器本地预览需要 **Node.js 20+**：

```powershell
cd prototype
node server.mjs
```

启动后在电脑浏览器访问 `http://127.0.0.1:8788`。运行业务测试：

```powershell
cd prototype
node --test tests/*.test.mjs
```

构建 Android APK 还需 **Python 3、JDK 21 和 Android SDK**，Windows PowerShell 下可参考以下步骤：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File build-tools/setup-android.ps1
python build-tools/setup-voice.py
npm.cmd ci --prefix build-tools/js
# 先把 android/build.ps1 中的 JDK 路径改为本机的 JDK 21 路径
powershell -NoProfile -ExecutionPolicy Bypass -File android/build.ps1
```

自行构建使用的开发签名可能与 Release APK 不同，无法直接覆盖已发布安装包；请先备份需要保留的数据。

更多资料：[安装指南](dist/手机安装说明.md) · [版本说明](RELEASE_NOTES.md) · [开发历史](docs/DEVELOPMENT_HISTORY.md) · [参与贡献](CONTRIBUTING.md)

## 开源、参考与致谢

本项目独立实现的代码以 **GNU GPL v3.0** 开源，详见 [LICENSE](LICENSE)。随附的第三方依赖、数据与语音资源遵循各自的许可证，详见 [依赖及致谢](ACKNOWLEDGEMENTS.md) 与 [第三方许可声明](prototype/THIRD_PARTY_NOTICES.txt)。

**向 [Fossify Calendar](https://github.com/FossifyOrg/Calendar) 的原作者、维护者、翻译者和每一位贡献者，致以最热烈、最诚挚的感谢！**其开放、重视隐私的 Android 应用设计为本项目早期探索提供了重要参考。**CalendarLedgerAI 并非 Fossify Calendar 的分支，也未合并其源码或提交历史**；项目的功能实现、版本发布与问题反馈均独立维护。

**Our warmest and most heartfelt thanks to the authors, maintainers, translators, and all contributors of Fossify Calendar.** Please visit and support the original project.

欢迎通过 [GitHub Issues](https://github.com/han1143437811-cmd/CalendarLedgerAI/issues) 反馈问题或改进建议。

---

*CalendarLedgerAI is an independently implemented Android calendar, expense tracker, and optional AI assistant. Local calendar and ledger features work offline; AI services require user configuration. Thanks to the Fossify Calendar community for inspiration and reference.*
