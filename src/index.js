require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Import routes
const chatRoutes = require('./routes/chatRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const port = process.env.PORT || 3005;

// Debug middleware to log incoming requests
app.use((req, res, next) => {
  console.log('\n=== Incoming Request Details ===');
  console.log('Origin:', req.headers.origin);
  console.log('Method:', req.method);
  console.log('Path:', req.path);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  next();
});

// CORS error logging middleware
app.use((err, req, res, next) => {
  if (err.message.includes('CORS')) {
    console.error('\n=== CORS Error Details ===');
    console.error('Error:', err.message);
    console.error('Origin:', req.headers.origin);
    console.error('Method:', req.method);
    console.error('Headers:', req.headers);
  }
  next(err);
});

app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = ['http://localhost:8081'];
      if (
        !origin ||
        allowedOrigins.some((pattern) =>
          typeof pattern === 'string' ? pattern === origin : pattern.test(origin),
        )
      ) {
        callback(null, true);
      } else {
        console.log(`Blocked by CORS: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  }),
);

// Handle preflight requests explicitly
app.options('*', (req, res) => {
  console.log('\n=== Handling OPTIONS Preflight ===');
  console.log('Setting CORS headers for preflight');

  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, Origin, Accept, X-Requested-With, Workspace, workspace',
  );
  res.header('Access-Control-Max-Age', '86400'); // 24 hours
  res.header('Access-Control-Allow-Credentials', 'false');

  console.log('Response Headers:', res.getHeaders());
  res.status(204).end();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/chat', chatRoutes);

// Error handling middleware
app.use(errorHandler);

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  console.log('CORS is configured to allow all origins in development mode');
});
