> 本文件保存 2026-10-10 首页整理前的 README 原文，供文档变更追溯。

# 日历账本 AI · CalendarLedgerAI

把日程和收支放在同一张日历里，用文字、截图和普通话语音与 AI 交互。Android 手机应用，可自行配置 DeepSeek 或兼容 Chat Completions API；本地演示和日历可以离线使用。

当前版本 **0.2.3**，APK 构建及功能验证日期 **2026-10-05**，开源发布资料整理日期 **2026-10-09**。支持 Android 8.0 及以上，无需 Root。包名：`org.calendarledger.preview`。

下载：[Android APK](https://github.com/han1143437811-cmd/CalendarLedgerAI/releases/download/v0.2.3/CalendarLedgerAI-v0.2.3.apk) · [Release 与完整源码](https://github.com/han1143437811-cmd/CalendarLedgerAI/releases/tag/v0.2.3)

## 致以最热烈、最诚挚的感谢

**向 [Fossify Calendar](https://github.com/FossifyOrg/Calendar) 的原作者、维护者、翻译者和每一位贡献者，致以最热烈、最诚挚的感谢！**

Fossify 社区长期维护开放、重视隐私、可由用户掌握的 Android 工具，为本项目最初的可行性研究、日历功能梳理和产品方向提供了宝贵参照。公开源码、文档和社区协作背后，是作者与贡献者持续投入的时间和心血。我们衷心感谢这份付出，并鼓励使用本项目的朋友去了解原项目、为它点亮 Star、参与贡献，或通过其官方渠道支持维护工作。

本仓库发布的是独立实现的 CalendarLedgerAI。当前版本没有导入 Fossify Calendar 源码或 Git 提交历史；最初考虑的 Fossify 源码扩展方案保留在历史规格中。Fossify Calendar 是本项目的重要研究参照，本项目独立维护自己的功能、联网行为和问题反馈。

- 原项目：[Fossify Calendar](https://github.com/FossifyOrg/Calendar)
- 原项目贡献者：[Contributors](https://github.com/FossifyOrg/Calendar/graphs/contributors)
- Fossify 官方网站：[fossify.org](https://www.fossify.org/)
- 参与或支持 Fossify：[Contribute](https://www.fossify.org/contribute/) · [Fund](https://www.fossify.org/donate/)
- 完整致谢与依赖关系：[ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md)

**Our warmest and most heartfelt thanks to the authors, maintainers, translators, and all contributors of Fossify Calendar.** Your work on open, privacy-conscious Android applications provided valuable references for this project's initial research and feature planning. This release is independently implemented and maintained; it does not import Fossify Calendar source code or its Git history. Please visit and support the original project.

## 界面

<p>
  <img src="dist/手机月历预览-v0.2.3.png" width="260" alt="放大的月历首屏，节日和收支同屏显示">
  <img src="dist/手机每日详情预览-v0.2.3.png" width="260" alt="向下滚动后查看每日详细日程和账目">
  <img src="dist/手机AI对话预览.png" width="260" alt="AI 对话界面，示例账本">
</p>

截图使用示例数据。前两张为 0.2.3 布局，AI 截图展示沿用的聊天界面。

## 功能

- 月、周、日视图；日程、每日收支、节日名称、假期与补班。0.2.3 放大首屏月历，每日详细记录在下方滚动查看。
- 收入、支出、退款、转账；账目新增、修改、删除、分类、账户、多个账本、筛选与撤销。金额在设备上以整数“分”计算。
- 日程提醒、每日/每周/每月重复、待办，以及按工作日空档排程。
- 按日期、分类、账户和账本分析收支，与上月同期比较；模型根据本地计算结果解释。
- AI 通过应用的操作工具执行记账、修改、排程、分析和设置。自由对话需要自行配置实际 API；本地演示支持有限中文指令。
- 最多 3 张截图或照片，生成可编辑的核对卡片后保存；图像理解需配置同时支持图片和工具调用的模型。
- APK 内置 Vosk 普通话离线模型，语音转为可修改草稿，点击发送后处理。
- 中国节假日公开数据镜像联网更新、离线农历节日、浅色/深色、大字、JSON 备份与 CSV 导出。

当前未实现系统日历同步、Fossify 源码合并、桌面小组件、自动微信/支付宝流水采集、账户余额与跨设备同步。

## 安装

从本仓库的 [Releases](https://github.com/han1143437811-cmd/CalendarLedgerAI/releases/tag/v0.2.3) 下载 `CalendarLedgerAI-v0.2.3.apk`。已有试用版时直接覆盖安装，沿用包名和签名；不要先卸载或清除数据。APK 约 49.2 MiB，自带普通话模型，首次准备模型还需约 68 MB 私有存储。

打开后可先使用示例账本。真实记账前按 [手机安装说明](dist/手机安装说明.md) 导出备份，再选择清空示例。AI 设置位于 **更多 → AI 与设置**；填写实际可用的 API 地址、模型及 Key。

APK SHA256：

```text
cb7e32c66ec8b9e7d1a4bc5d36843e457901c83b61f8a089eddbc519128580ba
```

## 数据与联网

账目和日程保存在应用本地。Android API Key 经 Keystore 与 AES/GCM 加密保存，业务备份不包含 Key。远程 AI 请求会发送当前对话、必要的账目/日程上下文，以及主动选择的图片到用户配置的服务。录音在设备上转写，音频不发送给 AI。

节假日更新使用 [NateScarlet/holiday-cn](https://github.com/NateScarlet/holiday-cn) 公开数据镜像，保留政府通知来源；未公布的年份不会推测调休日期。本项目包含联网功能，其数据行为以本说明为准。

## 验证范围

2026-10-05 的 0.2.3 交付通过 **35 项浏览器检查、30 项 Android 16 模拟器检查**，覆盖三种手机宽度、五/六行月份、详情滚动、节日、深色/大字、聊天，以及原签名覆盖升级和旧记录保留。报告：[验证结果-v0.2.3.json](dist/验证结果-v0.2.3.json)。

未在用户的 Samsung S24 Ultra / One UI 8.5 上验证，也未使用真实 DeepSeek Key。0.2.3 沿用此前语音实现，没有重新进行语音音频解码或通知实测。模拟器结果不代表真实设备的麦克风、系统省电和通知表现。历史验证记录位于 `dist`，详细沿革见 [开发历史](docs/DEVELOPMENT_HISTORY.md)。

## 开发与构建

需要 Node.js 20+、Python 3、Windows PowerShell；Android 构建还需 JDK 21 和官方 Android SDK。

浏览器预览无需安装第三方包：

```powershell
cd prototype
node server.mjs
```

在电脑打开 `http://127.0.0.1:8788`，或双击 `prototype/打开预览.cmd`。本机地址不能直接用于手机访问。

运行业务检查：

```powershell
cd prototype
node --test tests/*.test.mjs
```

构建 Android APK：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File build-tools/setup-android.ps1
python build-tools/setup-voice.py
npm.cmd ci --prefix build-tools/js
# 将 android/build.ps1 中的 $buildJavaHome 改为自己的 JDK 21 路径。
powershell -NoProfile -ExecutionPolicy Bypass -File android/build.ps1
```

首次构建会在本机生成新的开发签名。自行构建的签名与已发布 APK 不同，无法直接覆盖已发布版本；先导出需要保留的数据。已发布版本的私钥不进入仓库。

## 开源许可证

本项目独立编写的代码以 **GNU GPL v3.0** 发布，见 [LICENSE](LICENSE)。这是本项目的开源选择；Fossify Calendar 自身的代码遵循其原仓库的 GPL v3.0 许可证。

随附第三方代码、公开节假日数据和语音依赖保留各自许可证、版权与来源。完整条款见 [THIRD_PARTY_NOTICES.txt](prototype/THIRD_PARTY_NOTICES.txt) 及 [依赖与来源](ACKNOWLEDGEMENTS.md)。

欢迎通过 Issue 反馈设备、系统版本和具体操作，也欢迎贡献代码、翻译和界面改进。
