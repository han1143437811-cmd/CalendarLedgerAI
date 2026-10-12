# 致谢 · Acknowledgements

## Fossify Calendar 社区

**向 Fossify Calendar 的原作者、维护者、翻译者、测试者和每一位贡献者，致以最热烈、最诚挚的感谢。**

感谢你们持续维护面向日常使用的开源 Android 日历，公开源码、功能文档和协作过程，并坚持让用户能够理解、使用和改进自己手机上的工具。本项目最初的可行性研究、日历功能梳理与开发方向，得到了这些公开成果的宝贵帮助。我们珍惜这份投入，也希望本项目的使用者去了解并支持原作者与社区。

- 项目：https://github.com/FossifyOrg/Calendar
- 贡献者：https://github.com/FossifyOrg/Calendar/graphs/contributors
- 官方网站：https://www.fossify.org/
- 参与贡献：https://www.fossify.org/contribute/
- 官方支持渠道：https://www.fossify.org/donate/
- 原项目许可证：https://github.com/FossifyOrg/Calendar/blob/master/LICENSE

**Our warmest and most heartfelt thanks to everyone who creates and maintains Fossify Calendar.** Its open development, documentation, and focus on users' control of their everyday tools provided valuable references for this project's initial research and planning. We appreciate the time, care, and effort behind those contributions, and encourage our users to visit, contribute to, and support the original project.

## 项目关系

CalendarLedgerAI 0.2.3 是独立的 Android WebView 应用，包名 `org.calendarledger.preview`，采用本项目的 JavaScript 业务层与 Java 原生接口。本版本没有导入 Fossify Calendar 源码、图标、APK 或 Git 提交历史，也没有合并进其官方项目。Fossify 是研究参照；本项目独立负责自己的 API 联网、账本逻辑、发布包与问题反馈。

历史规格曾提出基于 Fossify 源码扩展的方案，现存于 [ORIGINAL_SPEC.md](docs/ORIGINAL_SPEC.md)。历史意向不作为当前代码来源的声明。若未来导入或改编上游源码，应按实际文件保留原始版权、许可证和可追溯的提交记录，并更新这里的关系说明。

## 实际使用的开源项目

| 项目 | 本项目中的用途 | 许可证与来源 |
| --- | --- | --- |
| [NateScarlet/holiday-cn](https://github.com/NateScarlet/holiday-cn) | 内置及联网更新的中国放假/补班数据，保留政府通知链接 | MIT；版权通知保留在 THIRD_PARTY_NOTICES |
| [6tail/lunar-javascript](https://github.com/6tail/lunar-javascript) 1.7.7 | 农历节日与清明计算；原代码主体以本地 ESM 包装使用 | MIT；原许可证及适配说明位于 prototype/vendor |
| [Alpha Cephei / Vosk](https://github.com/alphacep/vosk-api) 0.3.75 | Android 设备上的普通话离线识别 | Apache-2.0；原二进制由构建脚本获取 |
| [Vosk small Chinese model](https://alphacephei.com/vosk/models) small-cn-0.22 | APK 内置普通话识别模型 | 发布方列明为 Apache-2.0；下载地址与 SHA256 已固定 |
| [Java Native Access](https://github.com/java-native-access/jna) 5.18.1 | Java 调用 Vosk 原生库 | 采用上游提供的 Apache-2.0 许可选项 |
| [Open-Meteo](https://open-meteo.com/) / [GeoNames](https://www.geonames.org/) | 可选城市搜索与最多 16 天日预报；仅打开应用时更新 | 数据为 CC BY 4.0；应用和小组件显示来源，使用本项目原创天气图标 |
| [esbuild](https://github.com/evanw/esbuild) | 构建时打包手机页面 | MIT；版本由 package-lock.json 固定 |

向这些项目的作者、维护者和贡献者一并致以衷心感谢。其原创工作和许可证保留原有归属。

完整许可证正文见 [prototype/THIRD_PARTY_NOTICES.txt](prototype/THIRD_PARTY_NOTICES.txt)。农历依赖的原许可证见 [lunar-LICENSE.txt](prototype/vendor/lunar-LICENSE.txt)，来源见 [lunar-provenance.json](prototype/vendor/lunar-provenance.json)。语音构建依赖的地址和 SHA256 见 [voice-dependencies.json](build-tools/voice/voice-dependencies.json)。
