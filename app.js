require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const passport = require("./src/config/passport");
const routes = require("./src/routes");
const responseHandler = require("./src/middleware/responseHandle");
const { mongo } = require("./src/utils");

const app = express();

// CORS configuration
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Accept-Language'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize Passport
app.use(passport.initialize());

app.use(responseHandler);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "src/views"));

// v1 api routes
app.use("/", routes);

app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: err.message,
  });
});

const PORT = process.env.PORT || 3001;

const startServer = async () => {
  await mongo.connect();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API Documentation: http://localhost:${PORT}/v1`);
  });
};

startServer();

module.exports = app;
