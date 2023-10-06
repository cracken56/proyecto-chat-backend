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

app.post('/api/message', async (req, res) => {
  try {
    const { conversationId, message } = req.body;

    // Retrieve the conversation document from Firestore
    const conversationDoc = firestore
      .collection('conversations')
      .doc(conversationId);

    // Get the existing "messages" array from the conversation document
    const conversationSnapshot = await conversationDoc.get();
    const conversationData = conversationSnapshot.data();

    if (!conversationData) {
      res.status(404).json({ success: false, error: 'Conversation not found' });
      return;
    }

    // Append the new message to the "messages" array
    if (!conversationData.messages) {
      conversationData.messages = [];
    }
    conversationData.messages.push(message);

    // Update the conversation document in Firestore with the updated "messages" array
    await conversationDoc.set(conversationData);

    res.status(200).json({
      success: true,
      message: 'Message sent successfully',
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
