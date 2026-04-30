const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const app = express();
const PORT = process.env.PORT || 4003;

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get("/", (req, res) => {
  res.json({
    service: "inventory-service",
    message: "Inventory Service is running"
  });
});

app.get("/health", (req, res) => {
  res.json({
    service: "inventory-service",
    status: "UP",
    port: PORT
  });
});

app.listen(PORT, () => {
  console.log(`Inventory Service running on port ${PORT}`);
});
