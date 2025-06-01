# Twilio Voice Server

A Node.js server that handles Twilio voice calls and WebSocket streaming.

## Features

- Handle incoming Twilio voice calls
- WebSocket streaming for voice data
- TypeScript support
- Environment configuration

## Prerequisites

- Node.js (v14 or higher)
- pnpm
- Twilio account with voice capabilities

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd twilio-voice-server
```

2. Install dependencies:
```bash
pnpm install
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Update `.env` with your Twilio credentials and configuration.

## Required Environment Variables

- `TWILIO_ACCOUNT_SID`: Your Twilio Account SID
- `TWILIO_AUTH_TOKEN`: Your Twilio Auth Token
- `TWILIO_PHONE_NUMBER`: Your Twilio phone number
- `PORT`: Server port (default: 3000)

## Development

Start the development server:
```bash
pnpm dev
```

## Production

Build the project:
```bash
pnpm build
```

Start the production server:
```bash
pnpm start
```

## API Endpoints

### Voice Endpoint
- `POST /voice`: Handle incoming Twilio voice calls

### WebSocket
- `ws://localhost:3000/stream`: WebSocket endpoint for voice streaming

## WebSocket Connection Example

```javascript
const ws = new WebSocket('ws://localhost:3000/stream');

ws.onopen = () => {
  console.log('Connected to WebSocket server');
};

ws.onmessage = (event) => {
  console.log('Received:', event.data);
};

ws.onclose = () => {
  console.log('Disconnected from WebSocket server');
};
```

## License

MIT 