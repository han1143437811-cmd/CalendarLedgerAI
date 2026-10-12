# AI 记忆、上下文与思考控制：调研及 v0.3.5 实现

核验日期：2026-10-13。以下依据项目官方文档及公开源码，不推测商业产品未公开的内部算法。

## 主流产品怎样记住偏好

偏好通常由应用保存，下一次调用时挑选相关条目加入上下文。聊天历史、偏好库、任务状态和模型参数是不同层次。OpenAI 的官方说明区分 ChatGPT web 记忆与本地 Codex 的独立记忆存储；本地 Codex 可以从符合条件的旧对话生成摘要与长期条目。必须一直遵守的项目规则另放在 AGENTS.md 等明确指令中。[官方说明](https://learn.chatgpt.com/docs/customization/memories)

DeepSeek 的 Chat Completions 接口无状态，客户端需要每次重新传入对话。仅填写 Key 不会自动获得跨启动记忆。[DeepSeek 多轮对话](https://api-docs.deepseek.com/guides/multi_round_chat/)

## 开源实现参考

| 项目 | 已核实机制 | 本应用采用的做法 |
| --- | --- | --- |
| [Open WebUI](https://docs.openwebui.com/features/chat-conversations/memory/) | 独立记忆、增改删查工具、用户管理、注入预算 | 已确认偏好与建议分开，支持检索和按预算选取；建议可关闭 |
| [Mem0 源码](https://github.com/mem0ai/mem0/blob/main/mem0/memory/main.py) | 从消息提取事实，搜索相关条目，进行新增、更新、删除；按用户等条件限定范围 | 建议必须逐字引用本轮用户原话；同名称更新，推断不能自行覆盖已确认规则 |
| [Cline Memory Bank](https://github.com/cline/cline/blob/main/docs/best-practices/memory-bank.mdx) | 项目目标、当前进度与长期规则分别组织；跨会话恢复 | 区分偏好、旧聊天摘录、当时工具结果与当前真实业务数据 |
| [Aider](https://aider.chat/docs/config/options.html) | 历史达到预算后摘要，可设置摘要模型并恢复历史 | 采用阈值触发的独立摘要请求，保留近期原始对话 |
| [Operit Android](https://github.com/AAswordman/Operit) | 多模型配置、摘要任务、记忆空间、工具执行；UI 与请求通过能力映射衔接 | 聊天顶部模型按钮、真实档位滑条、手动与自动压缩；不为不支持的服务猜测强度参数 |

重点阅读 Operit 的 [ThinkingQualityMapping.kt](https://github.com/AAswordman/Operit/blob/main/app/src/main/java/com/ai/assistance/operit/api/chat/llmprovider/ThinkingQualityMapping.kt)、[滑条映射契约](https://github.com/AAswordman/Operit/blob/main/docs/TODO/thinking_quality_slider_ui/01_mapping_contract.md) 与 [结构化摘要设计记录](https://github.com/AAswordman/Operit/blob/main/docs/TODO/summary-section-overrides/01-structured-summary-prompt.md)。后两者是项目设计记录；参考其思路，不据此声称所有功能均已稳定发布。本应用独立实现，没有复制上述项目源代码或引入其运行时。

## 记忆如何生效

- 明确要求“记住……”继续直接保存；最多40条已确认偏好。
- 自然表达习惯时，模型可调用 `propose_preference`。必须引用本轮文字，拒绝凭空或从截图、助手回答提取的来源。最多20条建议。
- 建议显示原话，用户点击采纳后才进入偏好库。模型未获得“采纳建议”工具。同名称替换旧偏好，保留来源，支持撤销。不同名称是否属于同一偏好仍依赖模型判断，本轮明确要求始终优先。
- 中文双字片段与英文关键词进行本地相关度排序。偏好注入预算4000字符，遗漏条目仍可通过 `search_ai_memory` 或 `get_ai_memory` 获取。这不是向量语义搜索，可能漏掉仅使用同义词的表达。
- 显示历史最多200条；移出窗口前保留最多80条精简原话或成功操作结果。不将助手口头“已完成”变成业务事实。清空聊天会删除摘要、摘录及待核对建议，保留确认偏好与实际账目。

## API 摘要与压缩

默认启用自动摘要，可在模型设置中关闭；未连接 API 或本地演示模式不会自动请求摘要。较早未压缩内容达到24条消息或18000字符时，在下一次发送前额外调用一次当前模型；也可手动触发。保留最近三轮完整对话，原聊天仍可查看。

摘要请求不带业务工具，关闭思考，JSON 输出最多1600 tokens。内容聚焦目标、纠正、未解决问题、日期金额与真实记录 ID。新旧摘要合并，每批输入最多约60000字符；只推进实际发送且完成的对话边界。网络失败、格式无效、过长或疑似含密钥时，不替换旧摘要、不删原文、不推进位置；自动失败后至少60秒再尝试。

摘要为模型生成的历史资料，可能遗漏或不准确，不能据此认为付款或日程已执行。修改、删除、分析仍查询当前本地状态。摘要不自动生成长期偏好，也不修改账目。它会发送历史资料到当前 API 并产生用量。

## DeepSeek 强度与模型选择

截至核验日期，[DeepSeek 官方说明](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode/) 给出真实档位 `none / low / high / max`，而 `medium` 等兼容别名会映射到这些档位。界面使用四个位置：关闭、轻度、深度、最大。请求同时设置 `thinking.type` 和 `reasoning_effort`；不使用温度模拟强度。

预设使用官方文档中的 `deepseek-flash`、`deepseek-v4-pro`，同时保留自定义模型 ID，并可按需获取当前服务 `/models` 返回的 ID。实际可用性以你的 Key 和服务返回为准。升级保留原模型，不自动换模型。自定义兼容服务尚未配置强度映射，滑条显示不支持，不发送 DeepSeek 特有参数。

本应用限制普通/轻度/深度/最大输出为2048/8192/16384/32768 tokens，这是应用额度上限，不是 DeepSeek 官方最大能力值。较强思考请求超时延长到约5分钟；达到输出上限会说明回复未完整，保留已经执行的操作。

带工具的思考请求必须完整回传 `reasoning_content`，否则官方说明可能返回400。应用保留当前循环内完整内容；最近三轮保存完整成组调用/结果与思考内容，每组上限120000字符，超限整组退回历史文字资料，不从中间截断工具对。切换模型或服务不复用旧模型工具思考块。界面只显示最终回答。

## 这些改进怎样“优化模型”

本次改进应用的记忆、提示、上下文和工具执行，不训练 DeepSeek 的权重。模型微调需要专门数据、训练接口与评测；效果优化应先建立任务评测，再改提示、工具和检索，必要时才考虑训练。[OpenAI 模型优化说明](https://developers.openai.com/api/docs/guides/model-optimization)

本应用的回归场景包括订阅分摊、偏好来源、同名更新、冷启动、思考工具连续调用、压缩后继续查询、失败摘要不丢数据、图片核对与撤销。模拟服务验证应用链路；真实 DeepSeek 对自由表达的理解质量与用户 S24 Ultra 仍需实机检验。
