# Mindset Server

Mindset Server is an Express.js API that powers chat and user-management flows for the Mindset application. It includes MongoDB connection setup, chat endpoints, voice-message transcription support, user CRUD routes, JWT-protected data endpoints, and OpenAI-backed chat responses.

## Features

- Express API server
- MongoDB connection through Mongoose
- Chat message endpoints
- Voice message upload and transcription flow
- OpenAI chat completion integration
- User registration and user CRUD routes
- JWT authentication middleware for protected chat data endpoints
- Centralized error handling
- CORS configuration for local app development

## Tech stack

- Node.js
- Express
- MongoDB / Mongoose
- OpenAI SDK
- Multer
- JSON Web Tokens
- bcryptjs
- dotenv
- nodemon

## Getting started

Install dependencies:

```bash
npm install
```

Create a `.env` file in the project root:

```bash
PORT=3005
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
OPENAI_API_KEY=your_openai_api_key
```

Run the development server:

```bash
npm run dev
```

Run in production mode:

```bash
npm start
```

## Available scripts

```bash
npm run dev   # Start with nodemon
npm start     # Start with Node
npm test      # Placeholder test script
```

## API overview

The server mounts these route groups:

```text
/api/chat
/api/users
```

### Chat routes

```text
POST /api/chat/message
POST /api/chat/voice
GET  /api/chat/initial-state
POST /api/chat/user-response
POST /api/chat/set-collected-information   # protected
POST /api/chat/store-chat-history          # protected
```

### User routes

```text
POST   /api/users
GET    /api/users
GET    /api/users/:id
PUT    /api/users/:id
DELETE /api/users/:id
```

## Project structure

```text
src/
  config/          # Database connection setup
  controllers/     # Route handlers for chat and users
  middleware/      # Auth and error middleware
  routes/          # Express route definitions
  services/        # OpenAI chat/transcription service
  utils/           # Upload helpers and shared utilities
  index.js         # Server entry point
```

## Notes

The voice route expects an uploaded audio file and uses OpenAI transcription before returning chat output. Local uploads, generated files, `.env`, and credentials should not be committed.
