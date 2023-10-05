const express = require('express');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3001;

const server = app.listen(port, () =>
  console.log(`Chat web server listening on port ${port}!`)
);

server.keepAliveTimeout = 120 * 1000;
server.headersTimeout = 120 * 1000;

// Configure CORS to allow requests from a specific domain
const corsOptions = {
  origin: 'https://chat.onrender.com',
  optionsSuccessStatus: 200,
};

//TODO: add corsOptions as an arg after we are done testing.
app.use(cors());

app.get('/api/sse/health', async (req, res) => {
  res.status(200).send();
});
