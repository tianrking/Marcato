# 微信公众号粘贴模式

Marcato 的“公众号可粘贴”不是把浏览器预览区原样复制出去，而是在克隆 DOM 上生成一份确定性的公众号稿。新发布包会分别准备标题、摘要和正文；正文默认移除第一个 H1，避免与公众号标题栏重复。可移植的内嵌图片会随富文本复制，其他媒体即使被公众号过滤，正文信息和手工替换位置也仍然完整。

## 默认转换规则

| Markdown / 预览内容 | 公众号剪贴板结果 |
| --- | --- |
| `[官方文档](https://example.com)` | `官方文档 https://example.com`；普通外链不再依赖隐藏 `href`。 |
| 微信公众号文章链接 | 保留可点击链接，同时显示完整 `https://mp.weixin.qq.com/...`。 |
| 页内锚点 | 移除 `href`，保留文字。 |
| 普通远程图片 | 原位生成 `【图片 N：说明】`、完整原图 URL 和手动上传提示。 |
| `data:image/png/jpeg/gif/webp;base64,...` 图片 | 保留为独立正文图片，优先走浏览器 Selection 富文本复制；纯文本降级不会输出 Base64。 |
| 相对路径、本地图片 | 使用“MD + 图片”导入整个文章目录时，按相对路径或唯一文件名解析并转为内嵌图片；未解析路径原位生成上传提示。 |
| `blob:`、`file:`、SVG/AVIF data 图片 | 原位生成上传提示，不把临时地址或不稳定格式带入公众号正文。 |
| 已经位于微信图片域名的图片 | 保留图片，并规范成适合正文宽度的内联样式。 |
| Mermaid 和其他图表 | 原位生成 PNG 插入提示，并保留带语言围栏的完整源码。 |
| KaTeX 数学 | 行内公式保留 TeX；块公式生成图片插入提示并保留 LaTeX 源码。 |

图表预览工具栏另有 `Copy source` 和 `Copy PNG`。建议先复制整篇公众号稿，再按占位说明插入仍未解析的图片或图表 PNG；需要修改图表时可直接复制原始 Mermaid。

## 微信专属排版风格

选择 `WeChat` 专业模式后，右侧预览上方会出现独立的公众号控制条。这里的风格只作用于微信公众号预览与导出，不会改变 Marcato Standard、GitHub 或其他专业模式：

| 风格 | 适合内容 | 视觉特点 |
| --- | --- | --- |
| 编辑精选 | 长文、报道、深度介绍 | 暖色强调、克制留白、纸本感引用块。 |
| 黑白极简 | 观点、随笔、品牌文字 | 黑白层级、细分隔线、低装饰。 |
| 蓝调科技 | 产品、AI、开发与技术文章 | 蓝色标题、结构化章节卡片、技术感代码块。 |
| 微信清新 | 教程、生活方式、轻量科普 | 柔和绿色、居中标题、圆角章节卡片。 |

选择会保存在本机，并同时影响右侧预览、富文本剪贴板和下载的 `.wechat.html`。样式由实际计算后的 CSS 内联到正文节点，不依赖复制目标继续加载 Marcato 的样式表。控制条的“一键复制图文”默认移除第一条 H1，并直接复制当前排版与可移植图片；需要单独编辑标题、摘要或保留 H1 时使用“打开发布包”。渲染尚未完成时复制按钮会暂时禁用，避免复制到上一版预览。

## Markdown 与图片一起导入

工具栏的 `MD + images` / `MD + 图片` 会打开目录选择器。推荐文章目录结构：

```text
article/
├─ article.md
└─ images/
   ├─ 01-cover.png
   └─ 02-panel.jpg
```

Markdown 中继续使用普通相对路径：

```md
![封面](./images/01-cover.png)
![操作界面](./images/02-panel.jpg)
```

导入时 Marcato 会利用浏览器提供的目录相对路径进行匹配，也支持 Markdown 位于子目录并使用 `../images/...`；普通文件多选或拖放时还会尝试唯一文件名匹配。已匹配图片进入资源库，Markdown 只保存短的 `marcato-asset:` 引用；预览、复制以及导出 Markdown 时才临时展开为 data URL。这样图片仍可直接复制，编辑区的字数、阅读时间与历史记录不会被 Base64 污染。远程 URL 不会被改写。单张内嵌图片仍受前端存储大小限制，避免把超大原图塞进浏览器存储和剪贴板。

也可以直接把 PNG、JPEG、GIF、WebP 或 AVIF 文件拖到左侧 Markdown 编辑区，或从剪贴板粘贴图片。Marcato 会在当前光标位置插入普通图片语法，自动补齐前后空行，并将图片保存为资源引用。PNG、JPEG、GIF 与 WebP 可以进入直接富文本复制路径；AVIF 可以预览和编辑，但导出公众号时会保留手工插图提示，以避免目标编辑器兼容性差异。

## 为什么只直接复制可移植的位图

公众号正文并不是通用网页运行时。实际测试表明，浏览器 Selection 复制可以把已经渲染的 PNG/JPEG/GIF/WebP data 图片随富文本带入编辑器；但第三方图片、未解析相对路径、浏览器临时 URL 和动态 SVG 的最终保存行为仍不稳定。预览中“看得到”不等于保存草稿、重新打开和手机预览后仍然存在。

微信官方提供的稳定图片路径是服务端上传正文图片并取得微信 URL。该接口要求服务端凭据，不能把 AppSecret 放进 Marcato 这样的纯前端应用：

- [微信官方：上传发表内容中的图片](https://developers.weixin.qq.com/doc/service/api/material/permanent/api_uploadimage)
- [微信官方：新建草稿](https://developers.weixin.qq.com/doc/service/api/draftbox/draftmanage/api_draft_add)

因此当前纯前端模式采用“双路径”：本地可移植位图直接复制；无法保证持久化的资源保留可见占位与来源。将来若增加受信任后端，可扩展为：下载图片 → 转 JPG/PNG → 压缩 → 上传微信 → 替换 `src` → 调用草稿接口。

## 剪贴板兼容策略

复制动作会同时写入：

- `text/html`：内联计算样式后的公众号富文本；
- `text/plain`：带完整 URL、图片位置说明和图表源码的可读稿。

包含内嵌图片时优先使用隐藏 `contenteditable`、Selection 和 `execCommand("copy")`，让浏览器生成可携带图片的原生富文本；没有内嵌图片或 Selection 失败时使用标准 Clipboard API。只有两条富文本路径都不可用时才降级为纯文本，并在界面明确提示。

发布包还能下载自包含的 `.wechat.html`：标题、摘要、正文和图片都在单个文件内，打开后可分别点击复制。这既是备用复制入口，也方便在另一台电脑上继续排版。

参考实现：

- [MDN：Clipboard.write](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/write)
- [doocs/md：微信剪贴板转换](https://github.com/doocs/md/blob/3d16426a0f3d423917d851e077e67695d76024f5/apps/web/src/services/export/clipboard.ts#L12-L115)
- [doocs/md：微信 SVG 兼容处理](https://github.com/doocs/md/blob/3d16426a0f3d423917d851e077e67695d76024f5/apps/web/src/services/export/wechat-svg.ts#L226-L250)
- [baoyu-skills：Mermaid 转 PNG，失败时保留源码](https://github.com/jimliu/baoyu-skills/blob/6b7a2e417500561a5ecdd0b168332f4142584617/packages/baoyu-md/src/mermaid-preprocess.ts#L48-L130)

Marcato 没有直接复制这些项目的实现；这些链接记录了本模式采用“专用导出管线、富文本兜底、图片迁移和源码保留”设计的依据。

## 发布前验收

自动化测试会验证四套样式及其本地持久化、拖图插入、相对路径图片解析、一键图文复制、独立 HTML、链接、三类图片、Mermaid、数学、HTML/纯文本双剪贴板和工具栏源码复制。真实发布仍建议完成一次平台端验收：

1. 粘贴到 Windows Chrome 中的公众号编辑器；
2. 确认内嵌图片已经出现，并按占位说明上传其余图片和图表 PNG；
3. 保存草稿并重新打开；
4. 使用手机预览检查链接、列表、表格、代码缩进和图片顺序；
5. 确认正文没有 `file:`、`blob:`、相对图片地址或破损图片。
