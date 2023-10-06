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

// Endpoint that is called when the user clicks on a contact for the first time
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

app.post('/api/contact/request', async (req, res) => {
  try {
    const { user, contactToRequest } = req.body;

    // Reference to the user's document in Firestore
    const userDocRef = firestore.collection('users').doc(contactToRequest);

    // Fetch the user's document
    let userDoc = await userDocRef.get();

    if (!userDoc.exists) {
      await userDocRef.set({ contactRequests: [] });
      userDoc = await userDocRef.get();
    }

    // Get the existing contacts array from the user's document data
    const existingContactRequests = userDoc.data().contactRequests || [];

    // Check if the new contact is already in the contacts array
    if (existingContactRequests.includes(user)) {
      res
        .status(400)
        .json({ success: false, error: 'Contact request already exists' });
      return;
    }

    // Add the new contact to the contacts array
    existingContactRequests.push(user);

    // Update the Firestore document with the modified contacts array
    await userDocRef.update({ contactRequests: existingContactRequests });

    res.status(200).json({
      success: true,
      message: 'Contact requested successfully',
      updatedContactRequests: existingContactRequests,
    });
  } catch (error) {
    console.error('Error adding contact:', error);
    res.status(500).json({ success: false, error: 'Error adding contact' });
  }
});

// This is called when the user accepts the request
app.post('/api/contact/accept-request/', async (req, res) => {
  try {
    const { user, contactToAccept } = req.body;

    const userDocRef = firestore.collection('users').doc(user);
    const contactDocRef = firestore.collection('users').doc(contactToAccept);

    let userDoc = await userDocRef.get();
    if (!userDoc.exists) {
      await userDocRef.set({ contacts: [], contactRequests: [] });
      userDoc = await userDocRef.get();
    }

    let contactDoc = await contactDocRef.get();
    if (!contactDoc.exists) {
      await contactDocRef.set({ contacts: [] });
      contactDoc = await contactDocRef.get();
    }

    // Add each other
    const userContacts = userDoc.data().contacts || [];
    userContacts.push(contactToAccept);
    const contactContacts = contactDoc.data().contacts || [];
    contactContacts.push(user);

    // Remove the contact request
    const userRequests = userDoc.data().contactRequests || [];
    const updatedUserRequests = userRequests.filter(
      (request) => request !== contactToAccept
    );

    // Update the Firestore document with the modified contacts and contactRequests arrays
    await userDocRef.update({
      contacts: userContacts,
      contactRequests: updatedUserRequests,
    });
    await contactDocRef.update({ contacts: contactContacts });

    res.status(200).json({
      success: true,
      message: 'Contact added successfully',
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
      res.status(404).json({ success: false, error: `User not found` });
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

app.get('/api/:user/contact-requests', async (req, res) => {
  try {
    const { user } = req.params;

    // Reference to the user's document in Firestore
    const userDocRef = firestore.collection('users').doc(user);

    // Fetch the user's document
    const userDoc = await userDocRef.get();

    if (!userDoc.exists) {
      res.status(404).json({ success: false, error: `User not found` });
      return;
    }

    // Get the contacts array from the user's document data
    const contactRequests = userDoc.data().contactRequests || [];

    res.status(200).json({
      success: true,
      contactRequests,
    });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ success: false, error: 'Error fetching contacts' });
  }
});
