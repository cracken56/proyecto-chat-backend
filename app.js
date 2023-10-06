const express = require('express');
const cors = require('cors');
const { Firestore } = require('@google-cloud/firestore');

// Initialize Firestore client without project configuration
const firestore = new Firestore();

const app = express();
const port = process.env.PORT || 3001;

const server = app.listen(port, () =>
  console.log(`Chat web server listening on port ${port}!`)
);

server.keepAliveTimeout = 120 * 1000;
server.headersTimeout = 120 * 1000;

const corsOptions = {
  origin: 'https://chat.onrender.com',
  optionsSuccessStatus: 200,
};

app.use(cors());

app.get('/api/sse/health', async (req, res) => {
  res.status(200).send();
});

// Add a document to Firestore
const newDocRef = firestore.collection('conversations').doc();
await newDocRef.set({ name: 'John Doe' });
