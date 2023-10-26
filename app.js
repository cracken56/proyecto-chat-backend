const express = require('express');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { Firestore } = require('@google-cloud/firestore');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const bodyParser = require('body-parser'); // Add this line

// Initialize Firestore client
const firestore = new Firestore();

const app = express();
const port = process.env.PORT || 3001;

// Initialize SecretManagerService client
const client = new SecretManagerServiceClient();

const fetchSecretKey = async () => {
  const secretName = 'projects/brave-server-401207/secrets/Key/versions/latest';
  try {
    const [version] = await client.accessSecretVersion({
      name: secretName,
    });

    const secret = version.payload.data.toString('utf8');
    return secret;
  } catch (err) {
    console.error('Error accessing secret:', err);
  }
};

const server = app.listen(port, () =>
  console.log(`Chat web server listening on port ${port}!`)
);

server.keepAliveTimeout = 120 * 1000;
server.headersTimeout = 120 * 1000;

const corsOptions = {
  origin: 'https://proyecto-chat.onrender.com',
  optionsSuccessStatus: 200,
};

app.use(cors(), bodyParser.json());

app.get('/api/health', async (req, res) => {
  res.status(200).send();
});

app.post('/api/register', async (req, res) => {
  try {
    const { user, hashedPassword } = req.body;

    // Check if the username already exists in Firestore
    const userRef = firestore.collection('users').doc(user);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      return res.status(409).json({ error: 'User already exists' });
    }

    let token;

    fetchSecretKey()
      .then((secretKey) => {
        token = jwt.sign({ user, hashedPassword }, secretKey);

        return userRef.set({
          hashedPassword,
        });
      })
      .then(() => {
        res
          .status(200)
          .json({ message: 'User registered successfully', token: token });
      })
      .catch((error) => {
        console.error('Error fetching secret key:', error);
        res.status(500).json({ error: 'Error fetching secret key' });
      });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Error registering user' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { user, hashedPassword } = req.body;

    // Check if the username doesn't exist in Firestore
    const userRef = firestore.collection('users').doc(user);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User does not exist' });
    }

    let token;

    fetchSecretKey()
      .then((secretKey) => {
        token = jwt.sign({ user, hashedPassword }, secretKey);

        return userRef.set({
          hashedPassword,
        });
      })
      .then(() => {
        res
          .status(200)
          .json({ message: 'User logged in successfully', token: token });
      })
      .catch((error) => {
        console.error('Error fetching secret key:', error);
        res.status(500).json({ error: 'Error fetching secret key' });
      });
  } catch (error) {
    console.error('Error logging user:', error);
    res.status(500).json({ error: 'Error logging user' });
  }
});

// Define a function to create the middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({ message: 'Token is missing' });
  }

  // Verify the token with your secret key
  fetchSecretKey()
    .then((secretKey) => {
      jwt.verify(token, secretKey, (err, decoded) => {
        if (err) {
          return res.status(401).json({ message: 'Token is invalid' });
        }

        // If the token is valid, you can attach the decoded payload to the request object
        req.user = decoded.user;
        next(); // Continue to the next middleware or route handler
      });
    })
    .catch((error) => {
      console.error('Error fetching secret key:', error);
      res.status(500).json({ error: 'Error fetching secret key' });
    });
};

app.use(verifyToken);

app.put('/api/message', async (req, res) => {
  try {
    const { conversationId, message } = req.body;

    const user = req.user;
    if (message.sender !== user) {
      return res.status(403).json({ success: false, error: 'Unauthorized.' });
    }

    const conversationDocRef = firestore
      .collection('conversations')
      .doc(conversationId);

    const conversationDoc = await conversationDocRef.get();
    const conversationData = conversationDoc.data();

    if (!conversationData) {
      res.status(404).json({ success: false, error: 'Conversation not found' });
      return;
    }

    // Check if the user sending the message is a participant in the conversation
    const participants = conversationData.participants || [];
    if (!participants.includes(req.user)) {
      res.status(403).json({ success: false, error: 'Unauthorized' });
      return;
    }

    if (!conversationData.messages) {
      conversationData.messages = [];
    }
    message.timestamp = new Date().getTime();
    conversationData.messages.push(message);

    await conversationDocRef.update(conversationData);

    res.status(200).json({
      success: true,
      message: 'Message sent successfully',
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ success: false, error: 'Error sending message' });
  }
});

app.post(
  '/api/:user/contacts/requests/send/:contactToRequest',
  async (req, res) => {
    try {
      const { user, contactToRequest } = req.params;

      const userToken = req.user;
      if (user !== userToken) {
        return res.status(403).json({ success: false, error: 'Unauthorized.' });
      }

      const userDocRef = firestore.collection('users').doc(contactToRequest);

      let userDoc = await userDocRef.get();

      if (!userDoc.exists) {
        await userDocRef.set({ contactRequests: [] });
        userDoc = await userDocRef.get();
      }

      const existingContactRequests = userDoc.data().contactRequests || [];

      if (existingContactRequests.includes(user)) {
        res
          .status(409)
          .json({ success: false, error: 'Contact request already exists' });
        return;
      }

      existingContactRequests.push(user);

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
  }
);

const createConversation = async (participants, res, message) => {
  const existingConversationQuery = firestore
    .collection('conversations')
    .where('participants', 'array-contains', ...participants)
    .get();

  // Check if any matching conversations exist
  const existingConversations = (await existingConversationQuery).docs;

  if (existingConversations.length > 0) {
    const existingConversation = existingConversations[0].data();
    res.status(200).json({
      success: true,
      message: `${message}, but conversation already exists`,
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
      message: `${message}, and conversation created successfully`,
      conversation: { conversationId: conversationDoc.id, participants },
    });
  }
};

// This is called when the user accepts the request
app.post(
  '/api/:user/contacts/requests/accept/:contactToAccept',
  async (req, res) => {
    try {
      const { user, contactToAccept } = req.params;

      const userToken = req.user;
      if (user !== userToken) {
        return res.status(403).json({ success: false, error: 'Unauthorized.' });
      }

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

      const userRequests = userDoc.data().contactRequests || [];
      const updatedUserRequests = userRequests.filter(
        (request) => request !== contactToAccept
      );

      await userDocRef.update({
        contacts: userContacts,
        contactRequests: updatedUserRequests,
      });
      await contactDocRef.update({ contacts: contactContacts });

      createConversation(
        [user, contactToAccept],
        res,
        'Contact added successfully'
      );
    } catch (error) {
      console.error('Error adding contact:', error);
      res.status(500).json({ success: false, error: 'Error adding contact' });
    }
  }
);

//TODO: create endpoint to allow denying contact requests

app.get('/api/:user/contacts', async (req, res) => {
  try {
    const { user } = req.params;

    const userToken = req.user;
    if (user !== userToken) {
      return res.status(403).json({ success: false, error: 'Unauthorized.' });
    }

    const userDocRef = firestore.collection('users').doc(user);

    const userDoc = await userDocRef.get();

    if (!userDoc.exists) {
      res.status(404).json({ success: false, error: `User not found` });
      return;
    }

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

app.get('/api/:user/contacts/requests', async (req, res) => {
  try {
    const { user } = req.params;

    const userToken = req.user;
    if (user !== userToken) {
      return res.status(403).json({ success: false, error: 'Unauthorized.' });
    }

    const userDocRef = firestore.collection('users').doc(user);

    const userDoc = await userDocRef.get();

    if (!userDoc.exists) {
      res.status(404).json({ success: false, error: `User not found` });
      return;
    }

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
