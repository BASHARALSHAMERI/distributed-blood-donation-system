const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const amqp = require("amqplib");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4004;

const DB_CONFIG = {
  host: process.env.DB_HOST || "mysql",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "blood_app",
  password: process.env.DB_PASSWORD || "blood_app_pass",
  database: process.env.DB_NAME || "notification_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const RABBITMQ_URL =
  process.env.RABBITMQ_URL || "amqp://blooduser:bloodpass@rabbitmq:5672";

const EXCHANGE_NAME = "blood_events";
const QUEUE_NAME = "notification_service_blood_events";

let pool;
let rabbitChannel = null;

function mapNotification(row) {
  return {
    id: row.id,
    type: row.type,
    requestId: row.request_id,
    refCode: row.ref_code,
    donorId: row.donor_id,
    bloodType: row.blood_type,
    city: row.city,
    urgency: row.urgency,
    recipientType: row.recipient_type,
    recipientName: row.recipient_name,
    recipientContact: row.recipient_contact,
    message: row.message,
    status: row.status,
    createdAt: row.created_at
  };
}

async function waitForDatabase(maxRetries = 30) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      pool = mysql.createPool(DB_CONFIG);
      const connection = await pool.getConnection();
      await connection.ping();
      connection.release();

      console.log("Notification Service connected to MySQL");
      return;
    } catch (error) {
      console.log(
        `MySQL connection attempt ${attempt}/${maxRetries} failed: ${error.message}`
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  throw new Error("Notification Service failed to connect to MySQL");
}

function buildMessage(payload) {
  if (payload.type === "BLOOD_REQUEST_CRITICAL") {
    return `Critical blood request: ${payload.bloodType}, quantity ${payload.quantity}, hospital ${payload.hospitalName}, reference ${payload.refCode}. Matched donors: ${payload.matchedDonorsCount}.`;
  }

  if (payload.type === "BLOOD_REQUEST_DELIVERED") {
    return `Blood request delivered: reference ${payload.refCode}, blood type ${payload.bloodType}, delivered quantity ${payload.deliveredQuantity}, receiver ${payload.receiverName}.`;
  }

  return payload.message || `Blood system event received: ${payload.type || "UNKNOWN_EVENT"}`;
}

function getRecipientType(payload) {
  if (payload.type === "BLOOD_REQUEST_CRITICAL") return "BANK_STAFF";
  if (payload.type === "BLOOD_REQUEST_DELIVERED") return "HOSPITAL";
  return "SYSTEM";
}

async function saveNotification(payload) {
  const [result] = await pool.execute(
    `INSERT INTO notifications
     (type, request_id, ref_code, donor_id, blood_type, city, urgency,
      recipient_type, recipient_name, recipient_contact, message, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SENT')`,
    [
      payload.type || "UNKNOWN_EVENT",
      payload.requestId || null,
      payload.refCode || null,
      payload.donorId || null,
      payload.bloodType || null,
      payload.city || null,
      payload.urgency || null,
      getRecipientType(payload),
      payload.recipientName || null,
      payload.recipientContact || null,
      buildMessage(payload)
    ]
  );

  const [rows] = await pool.execute(
    "SELECT * FROM notifications WHERE id = ?",
    [result.insertId]
  );

  return mapNotification(rows[0]);
}

async function connectRabbit(maxRetries = 30) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const connection = await amqp.connect(RABBITMQ_URL);
      rabbitChannel = await connection.createChannel();

      await rabbitChannel.assertExchange(EXCHANGE_NAME, "topic", {
        durable: true
      });

      await rabbitChannel.assertQueue(QUEUE_NAME, {
        durable: true
      });

      await rabbitChannel.bindQueue(
        QUEUE_NAME,
        EXCHANGE_NAME,
        "blood.request.#"
      );

      await rabbitChannel.prefetch(10);

      await rabbitChannel.consume(QUEUE_NAME, async (message) => {
        if (!message) return;

        try {
          const payload = JSON.parse(message.content.toString());
          const notification = await saveNotification(payload);

          console.log(
            `Notification saved: id=${notification.id}, type=${notification.type}, ref=${notification.refCode || "-"}`
          );

          rabbitChannel.ack(message);
        } catch (error) {
          console.error(`Failed to process event: ${error.message}`);
          rabbitChannel.nack(message, false, false);
        }
      });

      console.log(
        `Notification Service connected to RabbitMQ. Waiting on queue=${QUEUE_NAME}`
      );

      return;
    } catch (error) {
      console.log(
        `RabbitMQ connection attempt ${attempt}/${maxRetries} failed: ${error.message}`
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  throw new Error("Notification Service failed to connect to RabbitMQ");
}

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      service: "notification-service",
      status: "UP",
      database: "CONNECTED",
      rabbitmq: rabbitChannel ? "CONNECTED" : "DISCONNECTED",
      exchange: EXCHANGE_NAME,
      queue: QUEUE_NAME,
      port: Number(PORT),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      service: "notification-service",
      status: "DOWN",
      database: "DISCONNECTED",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get("/notifications", async (req, res) => {
  const { type, status, refCode } = req.query;

  try {
    const conditions = [];
    const values = [];

    if (type) {
      conditions.push("type = ?");
      values.push(type);
    }

    if (status) {
      conditions.push("status = ?");
      values.push(status);
    }

    if (refCode) {
      conditions.push("ref_code = ?");
      values.push(refCode);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const [rows] = await pool.execute(
      `SELECT *
       FROM notifications
       ${whereClause}
       ORDER BY created_at DESC`,
      values
    );

    res.json({
      success: true,
      count: rows.length,
      data: rows.map(mapNotification)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
      error: error.message
    });
  }
});

app.patch("/notifications/:id/read", async (req, res) => {
  const notificationId = Number(req.params.id);

  if (!notificationId || Number.isNaN(notificationId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid notification id"
    });
  }

  try {
    const [result] = await pool.execute(
      "UPDATE notifications SET status = 'READ' WHERE id = ?",
      [notificationId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Notification not found"
      });
    }

    const [rows] = await pool.execute(
      "SELECT * FROM notifications WHERE id = ?",
      [notificationId]
    );

    res.json({
      success: true,
      message: "Notification marked as read",
      data: mapNotification(rows[0])
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to mark notification as read",
      error: error.message
    });
  }
});

app.listen(PORT, async () => {
  console.log(`Notification Service running on port ${PORT}`);

  try {
    await waitForDatabase();
    await connectRabbit();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
});
