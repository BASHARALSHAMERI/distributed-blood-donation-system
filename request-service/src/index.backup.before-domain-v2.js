const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const amqp = require("amqplib");
const dgram = require("dgram");
const mysql = require("mysql2/promise");

const app = express();
const PORT = process.env.PORT || 4002;

const DONOR_SERVICE_URL =
  process.env.DONOR_SERVICE_URL || "http://donor-service:4001";

const RABBITMQ_URL =
  process.env.RABBITMQ_URL || "amqp://blooduser:bloodpass@rabbitmq:5672";

const MULTICAST_GROUP = process.env.MULTICAST_GROUP || "239.10.10.10";
const MULTICAST_PORT = Number(process.env.MULTICAST_PORT || 5005);

const EXCHANGE_NAME = "blood_events";
const REQUEST_CREATED_ROUTING_KEY = "blood_request.created";

const dbConfig = {
  host: process.env.DB_HOST || "mysql",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "blood_app",
  password: process.env.DB_PASSWORD || "blood_app_pass",
  database: process.env.DB_NAME || "request_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

const allowedBloodTypes = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const allowedUrgencyLevels = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const allowedStatuses = ["PENDING", "MATCHED", "COMPLETED", "CANCELLED"];

let pool;
let dbConnected = false;

let rabbitChannel = null;
let rabbitConnected = false;

function mapRequest(row) {
  return {
    id: row.id,
    patientName: row.patient_name,
    hospitalName: row.hospital_name,
    bloodType: row.blood_type,
    city: row.city,
    urgency: row.urgency,
    status: row.status,
    createdAt: row.created_at
  };
}

async function connectDatabase(retries = 20) {
  pool = mysql.createPool(dbConfig);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const [rows] = await pool.query("SELECT 1 AS ok");

      if (rows[0].ok === 1) {
        dbConnected = true;
        console.log("Request Service connected to MySQL");
        return;
      }
    } catch (error) {
      dbConnected = false;
      console.error(
        `MySQL connection attempt ${attempt}/${retries} failed: ${error.message}`
      );

      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  console.error("Request Service could not connect to MySQL");
}

async function connectRabbitMQ(retries = 20) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const connection = await amqp.connect(RABBITMQ_URL);
      rabbitChannel = await connection.createChannel();

      await rabbitChannel.assertExchange(EXCHANGE_NAME, "topic", {
        durable: true
      });

      rabbitConnected = true;
      console.log("Request Service connected to RabbitMQ");

      connection.on("close", () => {
        rabbitConnected = false;
        rabbitChannel = null;
        console.error("RabbitMQ connection closed in Request Service");
        setTimeout(() => connectRabbitMQ(), 5000);
      });

      connection.on("error", (error) => {
        rabbitConnected = false;
        console.error("RabbitMQ error in Request Service:", error.message);
      });

      return;
    } catch (error) {
      console.error(
        `RabbitMQ connection attempt ${attempt}/${retries} failed: ${error.message}`
      );

      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  console.error("Request Service could not connect to RabbitMQ");
}

async function publishEvent(routingKey, payload) {
  if (!rabbitChannel || !rabbitConnected) {
    return {
      published: false,
      reason: "RabbitMQ is not connected"
    };
  }

  const eventPayload = {
    ...payload,
    eventId: `${routingKey}-${Date.now()}`,
    routingKey,
    publishedAt: new Date().toISOString(),
    source: "request-service"
  };

  rabbitChannel.publish(
    EXCHANGE_NAME,
    routingKey,
    Buffer.from(JSON.stringify(eventPayload)),
    {
      persistent: true,
      contentType: "application/json"
    }
  );

  return {
    published: true,
    exchange: EXCHANGE_NAME,
    routingKey,
    event: eventPayload
  };
}

function sendCriticalMulticastAlert(request) {
  return new Promise((resolve) => {
    if (request.urgency !== "CRITICAL") {
      return resolve({
        sent: false,
        reason: "Request urgency is not CRITICAL"
      });
    }

    const socket = dgram.createSocket("udp4");

    const alert = {
      type: "CRITICAL_BLOOD_REQUEST",
      requestId: request.id,
      patientName: request.patientName,
      hospitalName: request.hospitalName,
      bloodType: request.bloodType,
      city: request.city,
      urgency: request.urgency,
      sentAt: new Date().toISOString(),
      source: "request-service"
    };

    const message = Buffer.from(JSON.stringify(alert));

    socket.on("error", (error) => {
      socket.close();

      resolve({
        sent: false,
        error: error.message
      });
    });

    socket.send(
      message,
      0,
      message.length,
      MULTICAST_PORT,
      MULTICAST_GROUP,
      (error) => {
        socket.close();

        if (error) {
          return resolve({
            sent: false,
            error: error.message
          });
        }

        console.log(
          `UDP multicast alert sent to ${MULTICAST_GROUP}:${MULTICAST_PORT}`
        );

        resolve({
          sent: true,
          group: MULTICAST_GROUP,
          port: MULTICAST_PORT,
          type: alert.type
        });
      }
    );
  });
}

async function fetchWithTimeout(url, timeoutMs = 3000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Remote service responded with status ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

async function findMatchedDonors(bloodType, city) {
  const encodedBloodType = encodeURIComponent(bloodType);
  const encodedCity = encodeURIComponent(city);

  const url = `${DONOR_SERVICE_URL}/donors/search?bloodType=${encodedBloodType}&city=${encodedCity}`;

  try {
    const donorResponse = await fetchWithTimeout(url, 3000);

    return {
      success: true,
      donors: donorResponse.data || [],
      count: donorResponse.count || 0,
      source: "donor-service"
    };
  } catch (error) {
    return {
      success: false,
      donors: [],
      count: 0,
      source: "donor-service",
      error: error.message
    };
  }
}

app.get("/", (req, res) => {
  res.json({
    service: "request-service",
    message: "Blood Request Service is running with MySQL persistence",
    endpoints: {
      health: "/health",
      listRequests: "/requests",
      createRequest: "POST /requests",
      getRequestById: "/requests/:id",
      updateStatus: "PATCH /requests/:id/status"
    },
    remoteServices: {
      donorService: DONOR_SERVICE_URL,
      rabbitmq: rabbitConnected ? "CONNECTED" : "DISCONNECTED",
      multicast: `${MULTICAST_GROUP}:${MULTICAST_PORT}`
    },
    database: dbConnected ? "CONNECTED" : "DISCONNECTED"
  });
});

app.get("/health", (req, res) => {
  res.json({
    service: "request-service",
    status: "UP",
    port: Number(PORT),
    database: dbConnected ? "CONNECTED" : "DISCONNECTED",
    rabbitmq: rabbitConnected ? "CONNECTED" : "DISCONNECTED",
    multicast: {
      group: MULTICAST_GROUP,
      port: MULTICAST_PORT
    }
  });
});

app.get("/requests", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM blood_requests ORDER BY id ASC"
    );

    const requests = rows.map(mapRequest);

    res.json({
      success: true,
      count: requests.length,
      data: requests
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch blood requests",
      error: error.message
    });
  }
});

app.get("/requests/:id", async (req, res) => {
  const requestId = Number(req.params.id);

  try {
    const [rows] = await pool.execute(
      "SELECT * FROM blood_requests WHERE id = ?",
      [requestId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Blood request not found"
      });
    }

    res.json({
      success: true,
      data: mapRequest(rows[0])
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch blood request",
      error: error.message
    });
  }
});

app.post("/requests", async (req, res) => {
  const {
    patientName,
    hospitalName,
    bloodType,
    city,
    urgency = "MEDIUM"
  } = req.body;

  if (!patientName || !hospitalName || !bloodType || !city) {
    return res.status(400).json({
      success: false,
      message: "patientName, hospitalName, bloodType, and city are required"
    });
  }

  if (!allowedBloodTypes.includes(bloodType)) {
    return res.status(400).json({
      success: false,
      message: "Invalid blood type"
    });
  }

  if (!allowedUrgencyLevels.includes(urgency)) {
    return res.status(400).json({
      success: false,
      message: "Invalid urgency level"
    });
  }

  try {
    const [insertResult] = await pool.execute(
      `
      INSERT INTO blood_requests
      (patient_name, hospital_name, blood_type, city, urgency, status)
      VALUES (?, ?, ?, ?, ?, 'PENDING')
      `,
      [patientName, hospitalName, bloodType, city, urgency]
    );

    const [rows] = await pool.execute(
      "SELECT * FROM blood_requests WHERE id = ?",
      [insertResult.insertId]
    );

    const request = mapRequest(rows[0]);

    const donorMatchingResult = await findMatchedDonors(bloodType, city);

    const eventResult = await publishEvent(REQUEST_CREATED_ROUTING_KEY, {
      request,
      matchedDonors: donorMatchingResult.donors,
      donorMatching: {
        success: donorMatchingResult.success,
        count: donorMatchingResult.count,
        source: donorMatchingResult.source,
        error: donorMatchingResult.error || null
      }
    });

    const multicastResult = await sendCriticalMulticastAlert(request);

    res.status(201).json({
      success: true,
      message: "Blood request created successfully",
      data: {
        request,
        donorMatching: {
          success: donorMatchingResult.success,
          count: donorMatchingResult.count,
          source: donorMatchingResult.source,
          error: donorMatchingResult.error || null
        },
        matchedDonors: donorMatchingResult.donors,
        event: {
          published: eventResult.published,
          exchange: eventResult.exchange || null,
          routingKey: eventResult.routingKey || null,
          reason: eventResult.reason || null
        },
        multicast: multicastResult
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to create blood request",
      error: error.message
    });
  }
});

app.patch("/requests/:id/status", async (req, res) => {
  const requestId = Number(req.params.id);
  const { status } = req.body;

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid request status"
    });
  }

  try {
    const [updateResult] = await pool.execute(
      "UPDATE blood_requests SET status = ? WHERE id = ?",
      [status, requestId]
    );

    if (updateResult.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Blood request not found"
      });
    }

    const [rows] = await pool.execute(
      "SELECT * FROM blood_requests WHERE id = ?",
      [requestId]
    );

    res.json({
      success: true,
      message: "Request status updated",
      data: mapRequest(rows[0])
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update request status",
      error: error.message
    });
  }
});

app.listen(PORT, async () => {
  console.log(`Request Service running on port ${PORT}`);
  await Promise.all([
    connectDatabase(),
    connectRabbitMQ()
  ]);
});
