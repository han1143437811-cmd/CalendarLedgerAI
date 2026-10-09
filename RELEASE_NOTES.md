# CalendarLedgerAI 0.2.3 · 首次公开发布

把日程和收支放在同一张日历里，以文字、截图或普通话语音交互记账和排程。手机月历首屏已放大，每日详细记录下滑查看；保留节日名称、假期与补班、聊天平滑滚动、离线语音和可编辑截图识别卡片。

## 衷心感谢原作者与开源社区

向 [Fossify Calendar](https://github.com/FossifyOrg/Calendar) 的原作者、维护者、翻译者和每一位贡献者，致以最热烈、最诚挚的感谢。你们的公开源码、文档与长期维护，为本项目的最初研究和日历功能规划提供了宝贵参照。请大家了解并支持原项目。

本版本是独立实现，未导入 Fossify Calendar 源码或提交历史。也感谢 holiday-cn、lunar-javascript、Vosk 和 JNA 的作者及贡献者，完整关系和许可证见仓库的 ACKNOWLEDGEMENTS 与 THIRD_PARTY_NOTICES。

## 下载与升级

- Android 安装包：`CalendarLedgerAI-v0.2.3.apk`，Android 8.0+，无需 Root，约 49.2 MiB。
- 包名 `org.calendarledger.preview`，versionCode 7。已有试用版直接覆盖安装，保留旧数据；不要先卸载或清除数据。
- 语音模型随 APK 提供，首次使用还需约 68 MB 私有存储。
- 自由 AI 对话和截图识别需要自行配置 API；本地演示和日历可以离线使用。
- 完整源码：`CalendarLedgerAI-v0.2.3-public-source.zip`，或本 Release 对应的 Git 标签。
- 安装说明、验证报告、GPL 许可证、第三方许可证与 `SHA256SUMS.txt` 同时随附。

APK SHA256：`cb7e32c66ec8b9e7d1a4bc5d36843e457901c83b61f8a089eddbc519128580ba`。

## 验证与限制

APK 构建和功能验证日期为 2026-10-05；公开发布资料于 2026-10-09 整理，应用运行代码保持原交付版本。已通过 35 项浏览器检查与 30 项 Android 16 模拟器检查，包括原签名覆盖升级、旧记录保留、断网启动和真实触摸滑动。

未在 Samsung S24 Ultra / One UI 8.5 实机上验证，未使用真实 DeepSeek Key。语音实现沿用 0.2.2，本次未重新进行音频解码或系统通知检查。系统日历同步、桌面小组件、自动支付流水采集、账户余额和跨设备同步尚未实现。
