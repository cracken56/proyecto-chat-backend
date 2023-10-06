const express = require('express');
const cors = require('cors');
const { Firestore } = require('@google-cloud/firestore');
const bodyParser = require('body-parser'); // Add this line

// Initialize Firestore client
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

app.use(cors(), bodyParser.json());

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

app.post('/api/message', async (req, res) => {
  try {
    const { conversationId, participants, message } = req.body;

    // TODO: this implies that the frontend gets a valid conversationId from the database
    const conversationDoc = firestore
      .collection('conversations')
      .doc(conversationId);
    await conversationDoc.set({ conversationId, participants, message });

    res.status(200).json({
      success: true,
      message: 'Message sent successfully',
      conversation: { conversationId, participants, message },
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ success: false, error: 'Error sending message' });
  }
});

// Endpoint used to create a brand new conversation with somebody
app.post('/api/conversation', async (req, res) => {
  try {
    const { participants } = req.body;

    // Query Firestore to check for existing conversations with the same participants
    const existingConversationQuery = firestore
      .collection('conversations')
      .where('participants', 'array-contains', ...participants)
      .get();

    // Check if any matching conversations exist
    const existingConversations = (await existingConversationQuery).docs;

    if (existingConversations.length > 0) {
      // Conversation with the same participants already exists
      const existingConversation = existingConversations[0].data();

      res.status(200).json({
        success: true,
        message: 'Conversation already exists',
        conversation: existingConversation,
      });
    } else {
      // Create a new conversation if none exists
      const conversationDoc = firestore.collection('conversations').doc();
      await conversationDoc.set({
        conversationId: conversationDoc.id,
        participants,
      });

      res.status(201).json({
        success: true,
        message: 'Conversation created successfully',
        conversation: { conversationId: conversationDoc.id, participants },
      });
    }
  } catch (error) {
    console.error('Error creating or checking conversation:', error);
    res.status(500).json({
      success: false,
      error: 'Error creating or checking conversation',
    });
  }
});
