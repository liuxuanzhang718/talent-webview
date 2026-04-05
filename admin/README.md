# admin-web

自定义网页管理后台前端。

## 设计目标

- 不再把飞书作为主后台界面
- 先用 GitHub Pages 托管静态页面
- 真正的后台能力继续走腾讯云：
  - `cloudfunctions/admin`
  - `cloudfunctions/booking`
  - `cloudfunctions/assessment`
  - 云数据库与云存储

## 页面范围

- 运营总览
- 用户总览
- 预约管理
- 排期管理
- 方案与报告

## 运行方式

当前版本是零构建静态站点：

- 入口：`admin-web/index.html`
- 样式：`admin-web/src/styles.css`
- 主逻辑：`admin-web/src/app.js`

你可以本地直接起一个静态服务器预览，例如：

```bash
python3 -m http.server 4173
```

然后打开：

```text
http://localhost:4173/admin-web/
```

## 接入要求

### 1. 部署云函数

先在微信开发者工具里部署：

- `cloudfunctions/admin`
- `cloudfunctions/booking`
- `cloudfunctions/assessment`

### 2. 初始化管理员

先测试：

```json
{
  "action": "bootstrapStatus"
}
```

如果返回 `needsBootstrap: true`，再执行：

```json
{
  "action": "bootstrapAdmin",
  "username": "admin",
  "password": "你的强密码",
  "displayName": "运营后台"
}
```

### 3. 开启 CloudBase Web 访问

这个前端通过 CloudBase Web SDK 调用 `admin` 云函数，所以要补两项环境配置：

- 开启匿名登录
- 把 GitHub Pages 域名加入 Web 安全域名

建议加入：

- `https://<你的 GitHub 用户名>.github.io`

如果后面改自定义域名，再把你的正式域名也加进去。

### 4. GitHub Pages 托管

仓库里已经带了 workflow：

- `.github/workflows/admin-web-pages.yml`

把代码推到 GitHub 后，启用 Pages 即可。

## 当前实现边界

- 后台登录：`账号密码 + sessionToken`
- 不再使用前端传 `adminOpenid`
- 排期管理直接读写：
  - `slot_templates`
  - `busy_blocks`
  - `time_slots`
- 方案页支持：
  - 编辑草稿
  - 直接发布
  - 保存 HTML 报告链接
  - 上传 HTML / PDF 文件到云存储

## 后续建议

- 如果你后面决定长期维护这个后台，可以把当前页面改成 Vite/React 工程并把 CloudBase SDK打包进产物
- 现在这版已经适合先验证业务闭环，不需要继续依赖飞书 UI
