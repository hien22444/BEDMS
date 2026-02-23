const express = require("express");

const cors = require("cors");
const cookieParser = require("cookie-parser");
const routes = require("./routes");
const path = require("path");
const responseHandler = require("./middleware/responseHandle");
const { mongo } = require("./utils");
require("dotenv").config();

const app = express();

app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(responseHandler);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// v1 api routes
app.use("/", routes);

app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

app.use((err, req, res, next) => {
  const statusCode = err.statusCode || err.status || 500;
  if (statusCode >= 500) {
    console.error(err.stack);
  }
  res.status(statusCode).json({
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
