const express = require('express');
const cors = require('cors');
const { Firestore } = require('@google-cloud/firestore');

// Initialize Firestore client
async function initializeFirestore() {
  try {
    const firestore = new Firestore();
    return firestore;
  } catch (error) {
    console.error('Firestore initialization error:', error);
    throw error;
  }
}

// Call the initialization function and handle any potential errors
const firestore = await initializeFirestore();

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

app.get('/api/health', async (req, res) => {
  res.status(200).send();
});

// Route to add a document to Firestore
app.get('/api/add-document', async (req, res) => {
  try {
    // Add a document to Firestore
    const newDocRef = firestore.collection('conversations').doc();
    await newDocRef.set({ name: 'John Doe' });

    res.status(200).json({ message: 'Document added to Firestore' });
  } catch (error) {
    console.error('Error adding document to Firestore:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
