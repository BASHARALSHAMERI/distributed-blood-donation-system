const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const amqp = require("amqplib");
const dgram = require("dgram");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4002;

const DB_CONFIG = {
  host: process.env.DB_HOST || "mysql",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "blood_app",
  password: process.env.DB_PASSWORD || "blood_app_pass",
  database: process.env.DB_NAME || "request_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const DONOR_SERVICE_URL =
  process.env.DONOR_SERVICE_URL || "http://donor-service:4001";

const INVENTORY_SERVICE_URL =
  process.env.INVENTORY_SERVICE_URL || "http://inventory-service:4003";

const RABBITMQ_URL =
  process.env.RABBITMQ_URL || "amqp://blooduser:bloodpass@rabbitmq:5672";

const MULTICAST_GROUP = process.env.MULTICAST_GROUP || "239.10.10.10";
const MULTICAST_PORT = Number(process.env.MULTICAST_PORT || 5005);

const allowedBloodTypes = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const allowedUrgencies = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const allowedStatuses = ["PENDING", "MATCHED", "RESERVED", "DELIVERED", "CANCELLED"];

let pool;
let rabbitConnection = null;
let rabbitChannel = null;

function isValidBloodType(bloodType) {
  return allowedBloodTypes.includes(bloodType);
}

function generateRefCode() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.floor(1000 + Math.random() * 9000);
  return `TAIZ-${date}-${random}`;
}

function mapRequest(row) {
  if (!row) return null;

  return {
    id: row.id,
    refCode: row.ref_code,
    hospitalId: row.hospital_id,
    hospitalName: row.hospital_name,
    patientName: row.patient_name,
    doctorName: row.doctor_name,
    bloodType: row.blood_type,
    quantity: row.quantity,
    city: row.city,
    urgency: row.urgency,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapHospital(row) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    city: row.city,
    address: row.address,
    phone: row.phone,
    contactPerson: row.contact_person,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapMatch(row) {
  return {
    id: row.id,
    requestId: row.request_id,
    donorId: row.donor_id,
    donorName: row.donor_name,
    donorPhone: row.donor_phone,
    bloodType: row.blood_type,
    city: row.city,
    matchStatus: row.match_status,
    createdAt: row.created_at
  };
}

function mapHandover(row) {
  return {
    id: row.id,
    requestId: row.request_id,
    refCode: row.ref_code,
    receiverName: row.receiver_name,
    receiverPhone: row.receiver_phone,
    deliveredQuantity: row.delivered_quantity,
    deliveredBy: row.delivered_by,
    handoverDate: row.handover_date,
    notes: row.notes,
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

      console.log("Request Service connected to MySQL");
      return;
    } catch (error) {
      console.log(`MySQL connection attempt ${attempt}/${maxRetries} failed: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  throw new Error("Request Service failed to connect to MySQL");
}

async function connectRabbit(maxRetries = 20) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      rabbitConnection = await amqp.connect(RABBITMQ_URL);
      rabbitChannel = await rabbitConnection.createChannel();

      await rabbitChannel.assertExchange("blood_events", "topic", {
        durable: true
      });

      console.log("Request Service connected to RabbitMQ");
      return;
    } catch (error) {
      console.log(`RabbitMQ connection attempt ${attempt}/${maxRetries} failed: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  console.log("RabbitMQ not connected. Events will be skipped until service restart.");
}

async function publishEvent(routingKey, payload) {
  if (!rabbitChannel) {
    return {
      published: false,
      reason: "RabbitMQ channel is not available"
    };
  }

  rabbitChannel.publish(
    "blood_events",
    routingKey,
    Buffer.from(JSON.stringify(payload)),
    {
      persistent: true,
      contentType: "application/json"
    }
  );

  return {
    published: true,
    exchange: "blood_events",
    routingKey
  };
}

function sendMulticastAlert(payload) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    const message = Buffer.from(JSON.stringify(payload));

    socket.send(message, 0, message.length, MULTICAST_PORT, MULTICAST_GROUP, (error) => {
      socket.close();

      if (error) {
        return resolve({
          sent: false,
          error: error.message
        });
      }

      resolve({
        sent: true,
        group: MULTICAST_GROUP,
        port: MULTICAST_PORT
      });
    });
  });
}

async function apiGet(url) {
  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || data.success === false) {
    throw new Error(data.message || `GET failed: ${url}`);
  }

  return data;
}

async function apiPatch(url, payload) {
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok || data.success === false) {
    const error = new Error(data.message || `PATCH failed: ${url}`);
    error.payload = data;
    throw error;
  }

  return data;
}

async function fetchInventory(bloodType) {
  const encodedBloodType = encodeURIComponent(bloodType);
  const data = await apiGet(`${INVENTORY_SERVICE_URL}/inventory/${encodedBloodType}`);
  return data.data;
}

async function findMatchingDonors(bloodType, city) {
  const params = new URLSearchParams({
    bloodType,
    city,
    eligibleOnly: "true"
  });

  const data = await apiGet(`${DONOR_SERVICE_URL}/donors/search?${params.toString()}`);
  return data.data || [];
}

async function getHospitalById(hospitalId) {
  if (!hospitalId) return null;

  const [rows] = await pool.execute(
    "SELECT * FROM hospitals WHERE id = ? AND is_active = TRUE",
    [hospitalId]
  );

  return rows.length ? rows[0] : null;
}

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      service: "request-service",
      status: "UP",
      database: "CONNECTED",
      rabbitmq: rabbitChannel ? "CONNECTED" : "DISCONNECTED",
      port: Number(PORT),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      service: "request-service",
      status: "DOWN",
      database: "DISCONNECTED",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get("/hospitals", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT * FROM hospitals ORDER BY name ASC"
    );

    res.json({
      success: true,
      count: rows.length,
      data: rows.map(mapHospital)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch hospitals",
      error: error.message
    });
  }
});

app.post("/hospitals", async (req, res) => {
  const {
    name,
    code,
    city = "Taiz",
    address = null,
    phone = null,
    contactPerson = null
  } = req.body;

  if (!name || !code) {
    return res.status(400).json({
      success: false,
      message: "name and code are required"
    });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO hospitals
       (name, code, city, address, phone, contact_person, is_active)
       VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
      [name, code, city, address, phone, contactPerson]
    );

    const [rows] = await pool.execute(
      "SELECT * FROM hospitals WHERE id = ?",
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: "Hospital created successfully",
      data: mapHospital(rows[0])
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Hospital code already exists"
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create hospital",
      error: error.message
    });
  }
});

app.get("/requests", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT * FROM blood_requests ORDER BY created_at DESC"
    );

    res.json({
      success: true,
      count: rows.length,
      data: rows.map(mapRequest)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch blood requests",
      error: error.message
    });
  }
});

app.get("/requests/ref/:refCode", async (req, res) => {
  const refCode = req.params.refCode;

  try {
    const [requestRows] = await pool.execute(
      "SELECT * FROM blood_requests WHERE ref_code = ?",
      [refCode]
    );

    if (!requestRows.length) {
      return res.status(404).json({
        success: false,
        message: "Blood request not found"
      });
    }

    const request = requestRows[0];

    const [matchRows] = await pool.execute(
      "SELECT * FROM request_matches WHERE request_id = ? ORDER BY created_at DESC",
      [request.id]
    );

    const [handoverRows] = await pool.execute(
      "SELECT * FROM request_handovers WHERE request_id = ? ORDER BY created_at DESC",
      [request.id]
    );

    res.json({
      success: true,
      data: {
        request: mapRequest(request),
        matches: matchRows.map(mapMatch),
        handovers: handoverRows.map(mapHandover)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch request by reference code",
      error: error.message
    });
  }
});

app.post("/requests", async (req, res) => {
  const {
    hospitalId = null,
    hospitalName = null,
    patientName,
    doctorName = null,
    bloodType,
    quantity = 1,
    city = "Taiz",
    urgency = "MEDIUM",
    notes = null
  } = req.body;

  if (!patientName || !bloodType) {
    return res.status(400).json({
      success: false,
      message: "patientName and bloodType are required"
    });
  }

  if (!isValidBloodType(bloodType)) {
    return res.status(400).json({
      success: false,
      message: "Invalid blood type"
    });
  }

  if (!allowedUrgencies.includes(urgency)) {
    return res.status(400).json({
      success: false,
      message: "Invalid urgency"
    });
  }

  if (!Number.isInteger(Number(quantity)) || Number(quantity) <= 0) {
    return res.status(400).json({
      success: false,
      message: "quantity must be a positive integer"
    });
  }

  const connection = await pool.getConnection();

  try {
    const hospital = await getHospitalById(hospitalId);
    const finalHospitalName =
      hospital?.name || hospitalName || "Unknown Hospital";

    const inventory = await fetchInventory(bloodType);
    const matchedDonors = await findMatchingDonors(bloodType, city);

    const refCode = generateRefCode();
    const finalStatus = matchedDonors.length > 0 ? "MATCHED" : "PENDING";

    await connection.beginTransaction();

    const [requestResult] = await connection.execute(
      `INSERT INTO blood_requests
       (ref_code, hospital_id, hospital_name, patient_name, doctor_name, blood_type, quantity, city, urgency, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        refCode,
        hospital?.id || null,
        finalHospitalName,
        patientName,
        doctorName,
        bloodType,
        Number(quantity),
        city,
        urgency,
        finalStatus,
        notes
      ]
    );

    const requestId = requestResult.insertId;

    for (const donor of matchedDonors) {
      await connection.execute(
        `INSERT INTO request_matches
         (request_id, donor_id, donor_name, donor_phone, blood_type, city, match_status)
         VALUES (?, ?, ?, ?, ?, ?, 'SUGGESTED')`,
        [
          requestId,
          donor.id,
          donor.fullName,
          donor.phone,
          donor.bloodType,
          donor.city
        ]
      );
    }

    const [requestRows] = await connection.execute(
      "SELECT * FROM blood_requests WHERE id = ?",
      [requestId]
    );

    await connection.commit();

    let eventResult = { published: false, reason: "Not a critical request" };
    let multicastResult = { sent: false, reason: "Not a critical request" };

    if (urgency === "CRITICAL") {
      const eventPayload = {
        type: "BLOOD_REQUEST_CRITICAL",
        requestId,
        refCode,
        hospitalName: finalHospitalName,
        patientName,
        doctorName,
        bloodType,
        quantity: Number(quantity),
        city,
        urgency,
        matchedDonorsCount: matchedDonors.length,
        inventoryAvailableQuantity: inventory.availableQuantity,
        createdAt: new Date().toISOString()
      };

      eventResult = await publishEvent("blood.request.critical", eventPayload);
      multicastResult = await sendMulticastAlert({
        alertType: "CRITICAL_BLOOD_REQUEST",
        ...eventPayload
      });
    }

    res.status(201).json({
      success: true,
      message: "Blood request created successfully",
      data: {
        request: mapRequest(requestRows[0]),
        inventoryCheck: {
          bloodType,
          requestedQuantity: Number(quantity),
          availableQuantity: inventory.availableQuantity,
          enoughStock: inventory.availableQuantity >= Number(quantity)
        },
        donorMatching: {
          matchedDonorsCount: matchedDonors.length
        },
        matchedDonors,
        event: eventResult,
        multicast: multicastResult
      }
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_) {}

    res.status(500).json({
      success: false,
      message: "Failed to create blood request",
      error: error.message,
      details: error.payload || null
    });
  } finally {
    connection.release();
  }
});

app.patch("/requests/:id/status", async (req, res) => {
  const requestId = Number(req.params.id);
  const { status } = req.body;

  if (!requestId || Number.isNaN(requestId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid request id"
    });
  }

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid request status"
    });
  }

  try {
    const [result] = await pool.execute(
      "UPDATE blood_requests SET status = ? WHERE id = ?",
      [status, requestId]
    );

    if (result.affectedRows === 0) {
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
      message: "Blood request status updated successfully",
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

app.get("/requests/:id/matches", async (req, res) => {
  const requestId = Number(req.params.id);

  if (!requestId || Number.isNaN(requestId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid request id"
    });
  }

  try {
    const [rows] = await pool.execute(
      "SELECT * FROM request_matches WHERE request_id = ? ORDER BY created_at DESC",
      [requestId]
    );

    res.json({
      success: true,
      count: rows.length,
      data: rows.map(mapMatch)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch request matches",
      error: error.message
    });
  }
});

app.get("/handovers", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT * FROM request_handovers ORDER BY created_at DESC"
    );

    res.json({
      success: true,
      count: rows.length,
      data: rows.map(mapHandover)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch handovers",
      error: error.message
    });
  }
});

app.post("/handovers", async (req, res) => {
  const {
    refCode,
    receiverName,
    receiverPhone = null,
    deliveredQuantity,
    deliveredBy = null,
    notes = null
  } = req.body;

  if (!refCode || !receiverName || !deliveredQuantity) {
    return res.status(400).json({
      success: false,
      message: "refCode, receiverName, and deliveredQuantity are required"
    });
  }

  if (!Number.isInteger(Number(deliveredQuantity)) || Number(deliveredQuantity) <= 0) {
    return res.status(400).json({
      success: false,
      message: "deliveredQuantity must be a positive integer"
    });
  }

  const connection = await pool.getConnection();

  try {
    const [requestRows] = await connection.execute(
      "SELECT * FROM blood_requests WHERE ref_code = ?",
      [refCode]
    );

    if (!requestRows.length) {
      return res.status(404).json({
        success: false,
        message: "Blood request not found"
      });
    }

    const request = requestRows[0];

    if (request.status === "DELIVERED") {
      return res.status(409).json({
        success: false,
        message: "Request is already delivered"
      });
    }

    if (request.status === "CANCELLED") {
      return res.status(409).json({
        success: false,
        message: "Cancelled request cannot be delivered"
      });
    }

    if (Number(deliveredQuantity) > request.quantity) {
      return res.status(400).json({
        success: false,
        message: "Delivered quantity cannot exceed requested quantity"
      });
    }

    const decreaseResult = await apiPatch(
      `${INVENTORY_SERVICE_URL}/inventory/${encodeURIComponent(request.blood_type)}/decrease`,
      { quantity: Number(deliveredQuantity) }
    );

    await connection.beginTransaction();

    const [handoverResult] = await connection.execute(
      `INSERT INTO request_handovers
       (request_id, ref_code, receiver_name, receiver_phone, delivered_quantity, delivered_by, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        request.id,
        request.ref_code,
        receiverName,
        receiverPhone,
        Number(deliveredQuantity),
        deliveredBy,
        notes
      ]
    );

    await connection.execute(
      "UPDATE blood_requests SET status = 'DELIVERED' WHERE id = ?",
      [request.id]
    );

    const [handoverRows] = await connection.execute(
      "SELECT * FROM request_handovers WHERE id = ?",
      [handoverResult.insertId]
    );

    const [updatedRequestRows] = await connection.execute(
      "SELECT * FROM blood_requests WHERE id = ?",
      [request.id]
    );

    await connection.commit();

    const eventResult = await publishEvent("blood.request.delivered", {
      type: "BLOOD_REQUEST_DELIVERED",
      requestId: request.id,
      refCode: request.ref_code,
      bloodType: request.blood_type,
      deliveredQuantity: Number(deliveredQuantity),
      receiverName,
      deliveredBy,
      createdAt: new Date().toISOString()
    });

    res.status(201).json({
      success: true,
      message: "Blood request delivered successfully",
      data: {
        request: mapRequest(updatedRequestRows[0]),
        handover: mapHandover(handoverRows[0]),
        inventory: decreaseResult.data,
        event: eventResult
      }
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_) {}

    res.status(500).json({
      success: false,
      message: "Failed to deliver blood request",
      error: error.message,
      details: error.payload || null
    });
  } finally {
    connection.release();
  }
});

app.listen(PORT, async () => {
  console.log(`Request Service running on port ${PORT}`);

  try {
    await waitForDatabase();
    await connectRabbit();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
});
