# Cloud Mail 全量 Public API 文档与调用手册

更新时间：2026-04-05

## 1. 文档说明

本文档面向通过公共 Token 调用 Cloud Mail 后端能力的开发者。

当前项目已将大部分后台业务接口开放为 `/api/public/*` 路由，调用时使用公共 Token 即可，无需登录态 JWT。

说明：

- 基础前缀：`/api/public`
- 除 `POST /api/public/genToken` 外，其余 `/api/public/*` 接口均需要请求头 `Authorization`
- `/api/public/*` 接口默认以管理员上下文执行
- 已保留 5 个便捷开放接口：
  - `POST /api/public/genToken`
  - `POST /api/public/emailList`
  - `POST /api/public/sendEmail`
  - `POST /api/public/deleteEmail`
  - `POST /api/public/addUser`

## 2. 通用规范

### 2.1 Base URL

```text
https://your-domain.com/api/public
```

### 2.2 认证方式

先调用：

```text
POST /api/public/genToken
```

拿到公共 Token 后，在后续请求中加入：

```text
Authorization: <public_token>
```

### 2.3 请求与响应格式

请求体统一使用 JSON。

通用成功响应：

```json
{
  "code": 200,
  "message": "success",
  "data": {}
}
```

通用失败响应：

```json
{
  "code": 401,
  "message": "Token validation failed"
}
```

### 2.4 常见错误码

| code | 含义 |
| --- | --- |
| `200` | 成功 |
| `400` | 参数错误 |
| `401` | 公共 Token 无效、管理员不存在、登录失效 |
| `403` | 权限不足、角色受限、发送策略不允许 |
| `500` | 服务内部错误 |
| `502` | KV、D1 等基础设施未绑定 |

## 3. 推荐调用流程

### 3.1 推荐顺序

1. `POST /api/public/genToken` 获取公共 Token
2. 将 Token 放到请求头 `Authorization`
3. 按需调用邮件、用户、角色、设置等 `/api/public/*` 接口

### 3.2 curl 示例

```bash
curl -X POST 'https://your-domain.com/api/public/genToken' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "admin@example.com",
    "password": "your-password"
  }'
```

成功后：

```bash
curl -X GET 'https://your-domain.com/api/public/account/list?size=20' \
  -H 'Authorization: <public_token>'
```

## 4. 鉴权接口

### 4.1 获取公共 Token

- 方法：`POST`
- 路径：`/api/public/genToken`
- 说明：用管理员邮箱和密码生成开放 API Token

请求体：

```json
{
  "email": "admin@example.com",
  "password": "your-password"
}
```

成功响应示例：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "token": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  }
}
```

## 5. 便捷开放接口

这组接口是面向第三方调用做过适配的快捷入口。

### 5.1 查询邮件

- 方法：`POST`
- 路径：`/api/public/emailList`

请求体字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `toEmail` | `string` | 收件邮箱条件，支持 SQL LIKE 写法 |
| `sendEmail` | `string` | 发件邮箱条件，支持 SQL LIKE 写法 |
| `sendName` | `string` | 发件人条件，支持 SQL LIKE 写法 |
| `subject` | `string` | 主题条件，支持 SQL LIKE 写法 |
| `content` | `string` | 正文条件，支持 SQL LIKE 写法 |
| `type` | `number` | 邮件类型，`0=收件`，`1=发件` |
| `isDel` | `number` | 删除状态，`0=正常`，`1=已删` |
| `timeSort` | `string` | 排序，`asc` 或 `desc` |
| `num` | `number` | 页码，从 1 开始 |
| `size` | `number` | 每页数量，默认 20 |

示例：

```json
{
  "sendEmail": "%@example.com%",
  "type": 1,
  "timeSort": "desc",
  "num": 1,
  "size": 20
}
```

### 5.2 发送邮件

- 方法：`POST`
- 路径：`/api/public/sendEmail`

请求体字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `sendEmail` | `string` | 否 | 发件邮箱，不传默认管理员主邮箱 |
| `sendName` | `string` | 否 | 发件人名称 |
| `receiveEmail` | `string` / `string[]` | 是 | 收件人，支持数组，或逗号/中文逗号/分号分隔 |
| `subject` | `string` | 否 | 主题 |
| `content` | `string` | 否 | HTML 正文 |
| `text` | `string` | 否 | 纯文本，不传则从 HTML 自动提取 |
| `attachments` | `array` | 否 | 普通附件 |
| `sendType` | `string` | 否 | 回复时传 `reply` |
| `emailId` | `number` | 否 | 回复目标邮件 ID |

附件元素格式：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `filename` | `string` | 文件名 |
| `content` | `string` | Base64 内容，不带 data URL 前缀 |
| `contentType` | `string` | MIME 类型 |
| `type` | `string` | MIME 类型兼容字段 |
| `mimeType` | `string` | MIME 类型兼容字段 |

示例：

```json
{
  "sendEmail": "sender@example.com",
  "sendName": "Cloud Mail",
  "receiveEmail": [
    "user1@example.com",
    "user2@example.com"
  ],
  "subject": "测试邮件",
  "content": "<p>Hello Cloud Mail</p>",
  "attachments": [
    {
      "filename": "hello.txt",
      "content": "SGVsbG8=",
      "contentType": "text/plain"
    }
  ]
}
```

### 5.3 删除邮件

- 方法：`POST`
- 路径：`/api/public/deleteEmail`
- 说明：支持单个删除、批量删除、条件删除

#### 单个删除

```json
{
  "emailId": 101
}
```

#### 批量删除

```json
{
  "emailIds": "101,102,103"
}
```

或：

```json
{
  "emailIds": [101, 102, 103]
}
```

#### 条件删除

可使用以下字段组合：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `toEmail` | `string` | 收件邮箱条件 |
| `sendEmail` | `string` | 发件邮箱条件 |
| `sendName` | `string` | 发件人条件 |
| `subject` | `string` | 主题条件 |
| `content` | `string` | 正文条件 |
| `type` | `number` | `0=收件`，`1=发件` |
| `isDel` | `number` | `0=正常`，`1=已删` |
| `startTime` | `string` | 开始时间，例如 `2026-01-01 00:00:00` |
| `endTime` | `string` | 结束时间，例如 `2026-01-31 23:59:59` |

示例：

```json
{
  "sendEmail": "%@example.com%",
  "type": 1,
  "startTime": "2026-01-01 00:00:00",
  "endTime": "2026-01-31 23:59:59"
}
```

返回示例：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "mode": "condition",
    "deletedCount": 3,
    "emailIds": [101, 102, 103]
  }
}
```

### 5.4 批量添加用户

- 方法：`POST`
- 路径：`/api/public/addUser`

请求体：

```json
{
  "list": [
    {
      "email": "user1@example.com",
      "password": "123456",
      "roleName": "default"
    },
    {
      "email": "user2@example.com"
    }
  ]
}
```

说明：

- `password` 可选，不传则自动生成随机密码
- `roleName` 可选，不传则使用默认角色

## 6. 全量业务接口清单

以下接口均可通过公共 Token 调用。

### 6.1 Account 模块

| 方法 | 路径 | 说明 | 主要参数 |
| --- | --- | --- | --- |
| `GET` | `/api/public/account/list` | 获取当前管理员名下邮箱列表 | `accountId` `size` `lastSort` |
| `DELETE` | `/api/public/account/delete` | 逻辑删除邮箱 | `accountId` |
| `POST` | `/api/public/account/add` | 新增邮箱 | `email` `token` |
| `PUT` | `/api/public/account/setName` | 修改邮箱昵称 | `accountId` `name` |
| `PUT` | `/api/public/account/setAllReceive` | 切换全局接收账号 | `accountId` |
| `PUT` | `/api/public/account/setAsTop` | 置顶邮箱 | `accountId` |

#### 示例：新增邮箱

```json
{
  "email": "team@example.com"
}
```

### 6.2 Email 模块

| 方法 | 路径 | 说明 | 主要参数 |
| --- | --- | --- | --- |
| `GET` | `/api/public/email/list` | 获取收件箱/发件箱分页 | `accountId` `allReceive` `emailId` `timeSort` `size` `type` |
| `GET` | `/api/public/email/latest` | 获取最新邮件增量 | `emailId` `accountId` `allReceive` |
| `DELETE` | `/api/public/email/delete` | 当前用户逻辑删除邮件 | `emailIds` |
| `GET` | `/api/public/email/attList` | 获取邮件附件列表 | `emailId` |
| `POST` | `/api/public/email/send` | 发送邮件 | 与后台发信一致 |
| `PUT` | `/api/public/email/read` | 标记已读 | `emailIds` |

说明：

- `type`：`0=收件`，`1=发件`
- `emailIds` 在删除、已读接口中通常是数组

### 6.3 All Email 管理模块

适合管理员全库查看和删除邮件。

| 方法 | 路径 | 说明 | 主要参数 |
| --- | --- | --- | --- |
| `GET` | `/api/public/allEmail/list` | 全站邮件管理列表 | `emailId` `size` `name` `subject` `accountEmail` `userEmail` `type` `timeSort` |
| `DELETE` | `/api/public/allEmail/delete` | 按 ID 物理删除邮件 | `emailIds` |
| `DELETE` | `/api/public/allEmail/batchDelete` | 按条件物理删除邮件 | `sendName` `sendEmail` `toEmail` `subject` `startTime` `endTime` `type` |
| `GET` | `/api/public/allEmail/latest` | 管理侧最新邮件增量 | `emailId` |

说明：

- `type=send` 仅发件
- `type=receive` 仅收件
- `type=delete` 已删除邮件
- `type=noone` 无人接收邮件
- `batchDelete` 中的 `type` 表示匹配方式：
  - `left`
  - `include`
  - 其他值默认右匹配

### 6.4 User 模块

| 方法 | 路径 | 说明 | 主要参数 |
| --- | --- | --- | --- |
| `GET` | `/api/public/user/list` | 用户列表 | `num` `size` `email` `timeSort` `status` `isDel` |
| `POST` | `/api/public/user/add` | 新增用户 | `email` `type` `password` |
| `DELETE` | `/api/public/user/delete` | 物理删除用户 | `userIds` |
| `PUT` | `/api/public/user/setPwd` | 重置指定用户密码 | `userId` `password` |
| `PUT` | `/api/public/user/setStatus` | 修改用户状态 | `userId` `status` |
| `PUT` | `/api/public/user/setType` | 修改用户角色 | `userId` `type` |
| `PUT` | `/api/public/user/resetSendCount` | 重置用户发信计数 | `userId` |
| `PUT` | `/api/public/user/restore` | 恢复用户 | `userId` `type` |
| `GET` | `/api/public/user/allAccount` | 查询指定用户的全部邮箱 | `userId` `num` `size` |
| `DELETE` | `/api/public/user/deleteAccount` | 物理删除邮箱 | `accountId` |

说明：

- `status`：`0=正常`，`1=禁用`

### 6.5 My 模块

| 方法 | 路径 | 说明 | 主要参数 |
| --- | --- | --- | --- |
| `GET` | `/api/public/my/loginUserInfo` | 获取当前管理员信息 | 无 |
| `PUT` | `/api/public/my/resetPassword` | 修改当前管理员密码 | `password` |
| `DELETE` | `/api/public/my/delete` | 注销当前管理员用户 | 无 |

### 6.6 Role 模块

| 方法 | 路径 | 说明 | 主要参数 |
| --- | --- | --- | --- |
| `POST` | `/api/public/role/add` | 新增角色 | `name` `permIds` `banEmail` `availDomain` 等 |
| `PUT` | `/api/public/role/setDefault` | 设置默认角色 | `roleId` |
| `PUT` | `/api/public/role/set` | 更新角色 | `roleId` `name` `permIds` `banEmail` `availDomain` 等 |
| `GET` | `/api/public/role/permTree` | 获取权限树 | 无 |
| `DELETE` | `/api/public/role/delete` | 删除角色 | `roleId` |
| `GET` | `/api/public/role/list` | 获取角色列表 | 无 |
| `GET` | `/api/public/role/selectUse` | 获取可选角色列表 | 无 |

#### 角色参数说明

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `name` | `string` | 角色名 |
| `permIds` | `number[]` | 角色权限按钮 ID 列表 |
| `banEmail` | `string[]` | 禁止收信邮箱或域名，支持 `*` |
| `availDomain` | `string[]` | 允许使用的域名列表 |
| `sendType` | `string` | 发信限制，如 `count`、`day`、`internal`、`ban` |
| `sendCount` | `number` | 发信次数上限 |
| `accountCount` | `number` | 邮箱数量上限 |

### 6.7 RegKey 模块

| 方法 | 路径 | 说明 | 主要参数 |
| --- | --- | --- | --- |
| `POST` | `/api/public/regKey/add` | 新增注册码 | `code` `roleId` `count` `expireTime` |
| `GET` | `/api/public/regKey/list` | 查询注册码列表 | `code` |
| `DELETE` | `/api/public/regKey/delete` | 删除注册码 | `regKeyIds` |
| `DELETE` | `/api/public/regKey/clearNotUse` | 清理失效/用尽注册码 | 无 |
| `GET` | `/api/public/regKey/history` | 查询注册码使用记录 | `regKeyId` |

### 6.8 Setting 模块

| 方法 | 路径 | 说明 | 主要参数 |
| --- | --- | --- | --- |
| `GET` | `/api/public/setting/query` | 查询完整系统设置 | 无 |
| `PUT` | `/api/public/setting/set` | 修改系统设置 | 设置字段合集 |
| `PUT` | `/api/public/setting/setBackground` | 设置登录背景 | `background` |
| `DELETE` | `/api/public/setting/deleteBackground` | 删除登录背景 | 无 |

说明：

- `set` 支持更新数据库中已有的设置字段
- `resendTokens` 使用对象格式传入，例如：

```json
{
  "resendTokens": {
    "example.com": "re_xxx"
  }
}
```

#### 设置背景

如果传网络地址：

```json
{
  "background": "https://example.com/bg.jpg"
}
```

如果传本地文件：

```json
{
  "background": "data:image/png;base64,xxxx"
}
```

### 6.9 Star 模块

| 方法 | 路径 | 说明 | 主要参数 |
| --- | --- | --- | --- |
| `POST` | `/api/public/star/add` | 添加星标 | `emailId` |
| `GET` | `/api/public/star/list` | 获取星标列表 | `emailId` `size` |
| `DELETE` | `/api/public/star/cancel` | 取消星标 | `emailId` |

### 6.10 Analysis 模块

| 方法 | 路径 | 说明 | 主要参数 |
| --- | --- | --- | --- |
| `GET` | `/api/public/analysis/echarts` | 获取统计分析数据 | `timeZone` |

示例：

```text
GET /api/public/analysis/echarts?timeZone=Asia/Shanghai
```

## 7. 公开但不属于公共 Token 体系的接口

以下接口仍保持原有用途，不建议纳入第三方业务集成主链路：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/login` | 登录 |
| `POST` | `/api/register` | 注册 |
| `GET` | `/api/setting/websiteConfig` | 前台站点配置 |
| `POST` | `/api/webhooks` | Resend Webhook |
| `GET` | `/api/oss/*` | 对象存储访问 |
| `GET` | `/api/init/:secret` | 初始化接口 |
| `GET` | `/api/telegram/getEmail/:token` | Telegram 邮件内容页 |
| `POST` | `/api/oauth/linuxDo/login` | OAuth 登录 |
| `PUT` | `/api/oauth/bindUser` | OAuth 绑定用户 |

## 8. 常用请求示例

### 8.1 查询管理员邮箱列表

```bash
curl -X GET 'https://your-domain.com/api/public/account/list?size=20' \
  -H 'Authorization: <public_token>'
```

### 8.2 查询收件箱

```bash
curl -X GET 'https://your-domain.com/api/public/email/list?accountId=1&allReceive=0&emailId=0&timeSort=0&size=20&type=0' \
  -H 'Authorization: <public_token>'
```

### 8.3 标记已读

```bash
curl -X PUT 'https://your-domain.com/api/public/email/read' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: <public_token>' \
  -d '{
    "emailIds": [101, 102]
  }'
```

### 8.4 创建角色

```bash
curl -X POST 'https://your-domain.com/api/public/role/add' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: <public_token>' \
  -d '{
    "name": "operator",
    "permIds": [1, 2, 3],
    "banEmail": [],
    "availDomain": ["example.com"],
    "sendType": "count",
    "sendCount": 100,
    "accountCount": 10
  }'
```

### 8.5 新增注册码

```bash
curl -X POST 'https://your-domain.com/api/public/regKey/add' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: <public_token>' \
  -d '{
    "code": "INVITE2026",
    "roleId": 2,
    "count": 100,
    "expireTime": "2026-12-31 23:59:59"
  }'
```

## 9. 接入建议

- 优先使用 `/api/public/*` 路由，不要混用后台 JWT 接口
- 第三方系统请统一封装 `Authorization` 头
- 发信、删信、改设置等高风险操作建议在业务侧追加操作日志
- 条件删除、批量删除建议先查询后删除，避免误删
- 如果需要 SDK，建议先按模块拆分：
  - `auth`
  - `account`
  - `email`
  - `user`
  - `role`
  - `setting`
  - `regKey`
  - `analysis`

## 10. 版本说明

本文档对应当前代码中已开放的公共接口实现。

如果后续继续新增 `/api/public/*` 路由，建议同步更新本文件：

```text
doc/API调用手册.md
```
