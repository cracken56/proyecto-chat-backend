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

// Endpoint that is called when the user clicks on a contact on the frontend, causing the main chat window to open
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

app.post('/api/contact', async (req, res) => {
  try {
    const { user, newContact } = req.body;

    // Reference to the user's document in Firestore
    const userDocRef = firestore.collection('users').doc(user);

    // Fetch the user's document
    const userDoc = await userDocRef.get();

    if (!userDoc.exists) {
      // If the user document doesn't exist, create it with the provided ID
      await userDocRef.set({ contacts: [] });
    }

    // Get the existing contacts array from the user's document data
    const existingContacts = userDoc.data().contacts || [];

    // Check if the new contact is already in the contacts array
    if (existingContacts.includes(newContact)) {
      res.status(400).json({ success: false, error: 'Contact already exists' });
      return;
    }

    // Add the new contact to the contacts array
    existingContacts.push(newContact);

    // Update the Firestore document with the modified contacts array
    await userDocRef.update({ contacts: existingContacts });

    res.status(200).json({
      success: true,
      message: 'Contact added successfully',
      updatedContacts: existingContacts,
    });
  } catch (error) {
    console.error('Error adding contact:', error);
    res.status(500).json({ success: false, error: 'Error adding contact' });
  }
});

app.get('/api/:user/contacts', async (req, res) => {
  try {
    const { user } = req.params;

    // Reference to the user's document in Firestore
    const userDocRef = firestore.collection('users').doc(user);

    // Fetch the user's document
    const userDoc = await userDocRef.get();

    if (!userDoc.exists) {
      res
        .status(404)
        .json({ success: false, error: `User doesn't have any contacts` });
      return;
    }

    // Get the contacts array from the user's document data
    const contacts = userDoc.data().contacts || [];

    res.status(200).json({
      success: true,
      contacts,
    });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ success: false, error: 'Error fetching contacts' });
  }
});
