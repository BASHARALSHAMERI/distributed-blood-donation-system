const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const amqp = require("amqplib");

const app = express();
const PORT = process.env.PORT || 4004;

const RABBITMQ_URL =
  process.env.RABBITMQ_URL || "amqp://blooduser:bloodpass@rabbitmq:5672";

const EXCHANGE_NAME = "blood_events";
const QUEUE_NAME = "notification_service_blood_requests";
const REQUEST_CREATED_ROUTING_KEY = "blood_request.created";

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

let notifications = [];
let rabbitConnected = false;

function buildNotificationMessage(event) {
  const request = event.request;
  const matchedCount = event.matchedDonors ? event.matchedDonors.length : 0;

  return `New ${request.urgency} blood request: ${request.bloodType} needed at ${request.hospitalName} in ${request.city}. Matched donors: ${matchedCount}.`;
}

async function connectRabbitMQ(retries = 10) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const connection = await amqp.connect(RABBITMQ_URL);
      const channel = await connection.createChannel();

      await channel.assertExchange(EXCHANGE_NAME, "topic", {
        durable: true
      });

      await channel.assertQueue(QUEUE_NAME, {
        durable: true
      });

      await channel.bindQueue(
        QUEUE_NAME,
        EXCHANGE_NAME,
        REQUEST_CREATED_ROUTING_KEY
      );

      rabbitConnected = true;
      console.log("Notification Service connected to RabbitMQ");
      console.log(
        `Waiting for events on exchange=${EXCHANGE_NAME}, queue=${QUEUE_NAME}`
      );

      channel.consume(
        QUEUE_NAME,
        (message) => {
          if (!message) return;

          try {
            const event = JSON.parse(message.content.toString());

            const notification = {
              id: notifications.length + 1,
              type: "BLOOD_REQUEST_CREATED",
              requestId: event.request.id,
              bloodType: event.request.bloodType,
              city: event.request.city,
              urgency: event.request.urgency,
              message: buildNotificationMessage(event),
              matchedDonorsCount: event.matchedDonors
                ? event.matchedDonors.length
                : 0,
              status: "SENT",
              receivedAt: new Date().toISOString(),
              sourceEventId: event.eventId
            };

            notifications.push(notification);

            console.log("Notification created:", notification.message);

            channel.ack(message);
          } catch (error) {
            console.error("Failed to process RabbitMQ message:", error.message);
            channel.nack(message, false, false);
          }
        },
        {
          noAck: false
        }
      );

      connection.on("close", () => {
        rabbitConnected = false;
        console.error("RabbitMQ connection closed in Notification Service");
        setTimeout(() => connectRabbitMQ(), 5000);
      });

      connection.on("error", (error) => {
        rabbitConnected = false;
        console.error("RabbitMQ error in Notification Service:", error.message);
      });

      return;
    } catch (error) {
      console.error(
        `RabbitMQ connection attempt ${attempt}/${retries} failed: ${error.message}`
      );

      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  console.error("Notification Service could not connect to RabbitMQ");
}

app.get("/", (req, res) => {
  res.json({
    service: "notification-service",
    message: "Notification Service is running",
    endpoints: {
      health: "/health",
      listNotifications: "/notifications"
    },
    rabbitmq: rabbitConnected ? "CONNECTED" : "DISCONNECTED"
  });
});

app.get("/health", (req, res) => {
  res.json({
    service: "notification-service",
    status: "UP",
    port: Number(PORT),
    rabbitmq: rabbitConnected ? "CONNECTED" : "DISCONNECTED"
  });
});

app.get("/notifications", (req, res) => {
  res.json({
    success: true,
    count: notifications.length,
    data: notifications
  });
});

app.post("/notifications", (req, res) => {
  const { message, recipient = "system" } = req.body;

  if (!message) {
    return res.status(400).json({
      success: false,
      message: "message is required"
    });
  }

  const notification = {
    id: notifications.length + 1,
    type: "MANUAL",
    recipient,
    message,
    status: "SENT",
    receivedAt: new Date().toISOString()
  };

  notifications.push(notification);

  res.status(201).json({
    success: true,
    message: "Notification created manually",
    data: notification
  });
});

app.listen(PORT, async () => {
  console.log(`Notification Service running on port ${PORT}`);
  await connectRabbitMQ();
});
