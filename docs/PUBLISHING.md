# GitHub 发布方式

本仓库以独立项目 `CalendarLedgerAI` 发布，默认公开。README、ACKNOWLEDGEMENTS 和 RELEASE_NOTES 保留对 Fossify Calendar 的显著致谢与实际代码关系。

GitHub 插件的连接与本机 GitHub CLI 登录分别检查；插件已启用不保证本机 `gh` 已取得创建仓库、推送或上传 Release 的凭据。

本机登录可使用 GitHub 官方设备授权流程：

```powershell
gh auth login --hostname github.com --git-protocol https --web
```

然后运行准备好的发布脚本：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/publish-github.ps1
```

脚本默认使用当前登录者的个人账号创建公开仓库 `CalendarLedgerAI`。需要其他仓库名或组织时，通过 `-RepositoryName` 和 `-RepositoryOwner` 指定；私有仓库可传 `-Private`。脚本不会写入或覆盖不属于此发布目录的既有仓库。

发布脚本读取 AndroidManifest 和 `dist/apk-info.json` 中的当前版本，校验对应 `dist/验证结果-v<版本>.json` 与安装包哈希一致。先审阅并提交源码、安装说明、截图和验证报告，再运行脚本。已有公开版本不会被改写；当前版本是 0.3.1，旧版 v0.2.3 与 v0.3.0 保留。

发布流程为：校验可公开文件和 APK、准备提交、创建或使用已关联的仓库、推送 main 与当前版本标签、从同一提交生成源码归档、创建预发布草稿、上传所有附件、核对附件清单，再公开预发布 Release。若尚无提交，脚本以登录账号的 GitHub noreply 地址创建初始提交；已整理的本地提交保留其原作者记录。不会将密钥、密码、浏览器资料、模型下载缓存或 APK 放入 Git 历史。

APK、完整源码归档、安装说明、验证结果、GPL 许可证、第三方许可证和 SHA256SUMS 作为 Release 附件。源码归档与 Git 标签来自同一提交，APK 使用已验证的构建及原发布签名。
