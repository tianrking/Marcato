# 微信公众号粘贴模式

Marcato 的“公众号可粘贴”不是把浏览器预览区原样复制出去，而是在克隆 DOM 上生成一份确定性的公众号稿。目标是：即使公众号过滤链接、图片或 SVG，正文信息和手工替换位置仍然完整。

## 默认转换规则

| Markdown / 预览内容 | 公众号剪贴板结果 |
| --- | --- |
| `[官方文档](https://example.com)` | `官方文档 https://example.com`；普通外链不再依赖隐藏 `href`。 |
| 微信公众号文章链接 | 保留可点击链接，同时显示完整 `https://mp.weixin.qq.com/...`。 |
| 页内锚点 | 移除 `href`，保留文字。 |
| 普通远程图片 | 原位生成 `【图片 N：说明】`、完整原图 URL 和手动上传提示。 |
| 相对路径、本地、`data:`、`blob:` 图片 | 原位生成上传提示；不会把失效地址或整段 Base64 塞进剪贴板。 |
| 已经位于微信图片域名的图片 | 保留图片，并规范成适合正文宽度的内联样式。 |
| Mermaid 和其他图表 | 原位生成 PNG 插入提示，并保留带语言围栏的完整源码。 |
| KaTeX 数学 | 行内公式保留 TeX；块公式生成图片插入提示并保留 LaTeX 源码。 |

图表预览工具栏另有 `Copy source` 和 `Copy PNG`。建议先复制整篇公众号稿，再按占位说明逐张插入 PNG；需要修改图表时可直接复制原始 Mermaid。

## 为什么不默认复制图片和 SVG

公众号正文并不是通用网页运行时。手工粘贴时，第三方图片、相对路径、浏览器临时 URL、Base64 和动态 SVG 的最终保存行为并不稳定。预览中“看得到”不等于保存草稿、重新打开和手机预览后仍然存在。

微信官方提供的稳定图片路径是服务端上传正文图片并取得微信 URL。该接口要求服务端凭据，不能把 AppSecret 放进 Marcato 这样的纯前端应用：

- [微信官方：上传发表内容中的图片](https://developers.weixin.qq.com/doc/service/api/material/permanent/api_uploadimage)
- [微信官方：新建草稿](https://developers.weixin.qq.com/doc/service/api/draftbox/draftmanage/api_draft_add)

因此当前纯前端模式选择不丢信息的手工工作流。将来若增加受信任后端，可扩展为：下载图片 → 转 JPG/PNG → 压缩 → 上传微信 → 替换 `src` → 调用草稿接口。

## 剪贴板兼容策略

复制动作会同时写入：

- `text/html`：内联计算样式后的公众号富文本；
- `text/plain`：带完整 URL、图片位置说明和图表源码的可读稿。

优先使用标准 Clipboard API；富文本写入失败时，使用隐藏 `contenteditable`、Selection 和 `execCommand("copy")` 再尝试一次；只有两条富文本路径都不可用时才降级为纯文本，并在界面明确提示。

参考实现：

- [MDN：Clipboard.write](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/write)
- [doocs/md：微信剪贴板转换](https://github.com/doocs/md/blob/3d16426a0f3d423917d851e077e67695d76024f5/apps/web/src/services/export/clipboard.ts#L12-L115)
- [doocs/md：微信 SVG 兼容处理](https://github.com/doocs/md/blob/3d16426a0f3d423917d851e077e67695d76024f5/apps/web/src/services/export/wechat-svg.ts#L226-L250)
- [baoyu-skills：Mermaid 转 PNG，失败时保留源码](https://github.com/jimliu/baoyu-skills/blob/6b7a2e417500561a5ecdd0b168332f4142584617/packages/baoyu-md/src/mermaid-preprocess.ts#L48-L130)

Marcato 没有直接复制这些项目的实现；这些链接记录了本模式采用“专用导出管线、富文本兜底、图片迁移和源码保留”设计的依据。

## 发布前验收

自动化测试会验证链接、三类图片、Mermaid、数学、HTML/纯文本双剪贴板和工具栏源码复制。真实发布仍建议完成一次平台端验收：

1. 粘贴到 Windows Chrome 中的公众号编辑器；
2. 按占位说明上传图片和图表 PNG；
3. 保存草稿并重新打开；
4. 使用手机预览检查链接、列表、表格、代码缩进和图片顺序；
5. 确认正文没有 `file:`、`blob:`、相对图片地址或破损图片。
