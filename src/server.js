const app = require('./app');
const { mongo } = require('./utils');

const PORT = process.env.PORT || 3001;

const startServer = async () => {
  try {
    await mongo.connect();
    app.listen(PORT, () => {
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
