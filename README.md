# Twilio Voice Server

一个基于 Node.js 的服务器，用于处理 Twilio 语音通话和 WebSocket 流式传输。

## 功能

- 处理 Twilio 语音通话
- WebSocket 流式传输语音数据
- TypeScript 支持
- 环境配置

## 前置条件

- Node.js (v14 或更高版本)
- pnpm
- Twilio 账户（支持语音功能）

## 安装

1. 克隆仓库：
```bash
git clone <仓库地址>
cd twilio-voice-server
```

2. 安装依赖：
```bash
pnpm install
```

3. 创建环境文件：
```bash
cp .env.example .env
```

4. 更新 `.env` 文件，填入你的 Twilio 凭证和配置。

## 必需的环境变量

- `TWILIO_ACCOUNT_SID`: Twilio 账户 SID
- `TWILIO_AUTH_TOKEN`: Twilio 认证令牌
- `TWILIO_PHONE_NUMBER`: Twilio 电话号码
- `PORT`: 服务器端口（默认：3000）

## 开发

启动开发服务器：
```bash
pnpm dev
```

## 生产

构建项目：
```bash
pnpm build
```

启动生产服务器：
```bash
pnpm start
```

## API 端点

### 语音端点
- `POST /voice`: 处理 Twilio 语音通话

### WebSocket
- `ws://localhost:3000/stream`: WebSocket 端点，用于语音流式传输

## WebSocket 连接示例

```javascript
const ws = new WebSocket('ws://localhost:3000/stream');

ws.onopen = () => {
  console.log('已连接到 WebSocket 服务器');
};

ws.onmessage = (event) => {
  console.log('收到数据:', event.data);
};

ws.onclose = () => {
  console.log('已断开与 WebSocket 服务器的连接');
};
```

## 许可证

MIT 