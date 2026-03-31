const http = require('http');
const app = require('./app');
const { mongo } = require('./utils');
const { initSocket } = require('./sockets');

const PORT = process.env.PORT || 3001;

const startServer = async () => {
  try {
    await mongo.connect();
    const httpServer = http.createServer(app);
    const io = initSocket(httpServer);
    app.set('io', io);
    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`API Documentation: http://localhost:${PORT}/v1`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
