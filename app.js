const express = require('express');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { Firestore } = require('@google-cloud/firestore');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const bodyParser = require('body-parser'); // Add this line
const bcrypt = require('bcrypt');

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

    await userRef.set({
      hashedPassword,
    });

    res.status(200).json({ message: 'User registered successfully' });

    //TODO: temporarily disable auth
    // let token;

    // fetchSecretKey()
    //   .then((secretKey) => {
    //     return jwt.sign({ user, hashedPassword }, secretKey);
    //   })
    //   .then(async (token) => {
    //     await userRef.set({
    //       hashedPassword,
    //     });

    //     res
    //       .status(200)
    //       .json({ message: 'User registered successfully', token: token });
    //   })
    //   .catch((error) => {
    //     console.error('Error fetching secret key:', error);
    //     res.status(500).json({ error: 'Error fetching secret key' });
    //   });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Error registering user' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { user, password } = req.body;

    // Check if the username doesn't exist in Firestore
    const userRef = firestore.collection('users').doc(user);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User does not exist' });
    }

    res.status(200).json({ message: 'User logged in successfully' });

    //TODO: temporarily disabled auth
    //const hashedPassword = userDoc.data().hashedPassword;

    // bcrypt.compare(password, hashedPassword, (err, result) => {
    //   if (err) {
    //     console.error('Error comparing passwords:', err);
    //     res.status(500).json({ error: `Error comparing passwords: ${err}` });
    //   } else if (result) {
    //     fetchSecretKey()
    //       .then((secretKey) => {
    //         return jwt.sign({ user, hashedPassword }, secretKey);
    //       })
    //       .then((token) => {
    //         res
    //           .status(200)
    //           .json({ message: 'User logged in successfully', token: token });
    //       })
    //       .catch((error) => {
    //         console.error('Error fetching secret key:', error);
    //         res.status(500).json({ error: 'Error fetching secret key' });
    //       });
    //   } else {
    //     return res.status(401).json({ error: 'Incorrect password' });
    //   }
    // });
  } catch (error) {
    console.error('Error logging user:', error);
    res.status(500).json({ error: 'Error logging user' });
  }
});

// Define a function to create the middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({ error: 'Token is missing' });
  }

  // Verify the token with your secret key
  fetchSecretKey()
    .then((secretKey) => {
      jwt.verify(token, secretKey, (err, decoded) => {
        if (err) {
          return res.status(401).json({ error: 'Token is invalid' });
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

//TODO: temporarily disabled auth
//app.use(verifyToken);

app.put('/api/message', async (req, res) => {
  try {
    const { conversationId, message, updateRead } = req.body;

    //TODO: temporarily disabled auth
    // const userToken = req.user;
    // if (message.sender !== userToken) {
    //   return res.status(401).json({ success: false, error: 'Unauthorized.' });
    // }

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
    // const participants = conversationData.participants || {};
    // if (!participants.hasOwnProperty(reqUser)) {
    //   res.status(401).json({ success: false, error: 'Unauthorized' });
    //   return;
    // }

    if (!conversationData.messages) {
      conversationData.messages = [];
    }

    if (updateRead) {
      const updatedMessages = conversationData.messages.map(
        (message, index) => {
          if (message.readBy) {
            message.readBy = {
              ...message.readBy,
              [updateRead.reader]: true,
            };
          } else {
            message.readBy = { [updateRead.reader]: true };
          }
          return message;
        }
      );

      await conversationDocRef.update({ messages: updatedMessages });

      return res.status(200).json({
        success: true,
        message: 'Messages readBy updated successfully',
      });
    }

    if (message) {
      message.timestamp = new Date().getTime();
      conversationData.messages.push(message);

      await conversationDocRef.update(conversationData);

      res.status(200).json({
        success: true,
        message: 'Message sent successfully',
      });
    }
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ success: false, error: 'Error sending message' });
  }
});

app.put('/api/typing', async (req, res) => {
  try {
    const { conversationId, user, typing } = req.body;

    //TODO: temporarily disabled auth
    // const userToken = req.user;
    // if (user !== userToken) {
    //   return res.status(401).json({ success: false, error: 'Unauthorized.' });
    // }

    const conversationDocRef = firestore
      .collection('conversations')
      .doc(conversationId);

    const conversationDoc = await conversationDocRef.get();
    const conversationData = conversationDoc.data();

    if (!conversationData) {
      res.status(404).json({ success: false, error: 'Conversation not found' });
      return;
    }

    // Check if the user sending the typing status is a participant in the conversation
    // const participants = conversationData.participants || {};
    // if (!participants.hasOwnProperty(reqUser)) {
    //   res.status(401).json({ success: false, error: 'Unauthorized' });
    //   return;
    // }

    if (!conversationData.typing) {
      conversationData.typing = {};
    }

    conversationData.typing[user] = typing;

    await conversationDocRef.update(conversationData);

    res.status(200).json({
      success: true,
      message: 'Typing status sent successfully',
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

      //TODO: temporarily disabled auth
      // const userToken = req.user;
      // if (user !== userToken) {
      //   return res.status(401).json({ success: false, error: 'Unauthorized.' });
      // }

      if (user === contactToRequest) {
        res
          .status(400)
          .json({ success: false, error: 'Can not add yourself.' });
        return;
      }

      // Requests
      const contactDocRef = firestore.collection('users').doc(contactToRequest);

      const contactDoc = await contactDocRef.get();

      if (!contactDoc.exists) {
        res
          .status(404)
          .json({ success: false, error: 'Contact does not exist' });
        return;
      }

      const contactRequests = contactDoc.data().contactRequests || [];

      if (contactRequests.includes(user)) {
        res
          .status(409)
          .json({ success: false, error: 'Contact request already exists' });
        return;
      }

      contactRequests.push(user);

      await contactDocRef.update({ contactRequests: contactRequests });

      // Pending
      const userDocRef = firestore.collection('users').doc(user);

      const userDoc = await userDocRef.get();
      const sentRequests = userDoc.data().sentRequests || [];

      sentRequests.push(contactToRequest);

      await userDocRef.update({ sentRequests: sentRequests });

      res.status(200).json({
        success: true,
        message: 'Contact requested successfully',
        updatedContactRequests: contactRequests,
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
    .where(`participants.${Object.values(participants)[0]}`, '==', true)
    .where(`participants.${Object.values(participants)[1]}`, '==', true)
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
      participants,
    });

    res.status(201).json({
      success: true,
      message: `${message}, and conversation created successfully`,
      conversation: { participants },
    });
  }
};

// This is called when the user accepts the request
app.post(
  '/api/:user/contacts/requests/accept/:contactToAccept',
  async (req, res) => {
    try {
      const { user, contactToAccept } = req.params;

      //TODO: temporarily disabled auth
      // const userToken = req.user;
      // if (user !== userToken) {
      //   return res.status(401).json({ success: false, error: 'Unauthorized.' });
      // }

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

      const contactSentRequests = contactDoc.data().sentRequests || [];
      const updatedSentRequests = contactSentRequests.filter(
        (request) => request !== user
      );

      await contactDocRef.update({
        sentRequests: updatedSentRequests,
        contacts: contactContacts,
      });

      createConversation(
        { [user]: true, [contactToAccept]: true },
        res,
        'Contact added successfully'
      );
    } catch (error) {
      console.error('Error adding contact:', error);
      res
        .status(500)
        .json({ success: false, error: 'Error accepting contact request' });
    }
  }
);

app.post(
  '/api/:user/contacts/requests/decline/:contactToDecline',
  async (req, res) => {
    try {
      const { user, contactToDecline } = req.params;

      //TODO: temporarily disabled auth
      // const userToken = req.user;
      // if (user !== userToken) {
      //   return res.status(401).json({ success: false, error: 'Unauthorized.' });
      // }

      const userDocRef = firestore.collection('users').doc(user);
      const contactDocRef = firestore.collection('users').doc(contactToDecline);

      let userDoc = await userDocRef.get();
      if (!userDoc.exists) {
        res.status(404).json({
          success: false,
          error: `${user} could not be found`,
        });
      }

      let contactDoc = await contactDocRef.get();
      if (!contactDoc.exists) {
        res.status(404).json({
          success: false,
          error: `${user} could not be found`,
        });
      }

      // Delete from user's contactRequests
      const userRequests = userDoc.data().contactRequests || [];
      const updatedUserRequests = userRequests.filter(
        (contact) => contact !== contactToDecline
      );

      await userDocRef.update({
        contactRequests: updatedUserRequests,
      });

      // Delete from contact's sentRequests
      const contactSentRequests = contactDoc.data().sentRequests || [];
      const updatedSentRequests = contactSentRequests.filter(
        (request) => request !== user
      );

      await contactDocRef.update({
        sentRequests: updatedSentRequests,
      });

      res.status(200).json({
        success: true,
        message: `${user} declined ${contactToDecline}'s contact request.`,
      });
    } catch (error) {
      console.error('Error declining contact request:', error);
      res
        .status(500)
        .json({ success: false, error: 'Error declining contact request' });
    }
  }
);

app.get('/api/:user/contacts', async (req, res) => {
  try {
    const { user } = req.params;

    //TODO: temporarily disabled auth
    // const userToken = req.user;
    // if (user !== userToken) {
    //   return res.status(401).json({ success: false, error: 'Unauthorized.' });
    // }

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

app.get('/api/:user/contacts/pending-requests', async (req, res) => {
  try {
    const { user } = req.params;

    //TODO: temporarily disabled auth
    // const userToken = req.user;
    // if (user !== userToken) {
    //   return res.status(401).json({ success: false, error: 'Unauthorized.' });
    // }

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
    console.error('Error fetching pending requests:', error);
    res
      .status(500)
      .json({ success: false, error: 'Error fetching pending requests' });
  }
});

app.get('/api/:user/contacts/sent-requests', async (req, res) => {
  try {
    const { user } = req.params;

    //TODO: temporarily disabled auth
    // const userToken = req.user;
    // if (user !== userToken) {
    //   return res.status(401).json({ success: false, error: 'Unauthorized.' });
    // }

    const userDocRef = firestore.collection('users').doc(user);

    const userDoc = await userDocRef.get();

    if (!userDoc.exists) {
      res.status(404).json({ success: false, error: `User not found` });
      return;
    }

    const sentRequests = userDoc.data().sentRequests || [];

    res.status(200).json({
      success: true,
      sentRequests,
    });
  } catch (error) {
    console.error('Error fetching sent requests:', error);
    res
      .status(500)
      .json({ success: false, error: 'Error fetching sent requests' });
  }
});
