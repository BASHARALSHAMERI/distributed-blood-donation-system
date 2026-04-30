const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4003;

const DB_CONFIG = {
  host: process.env.DB_HOST || "mysql",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "blood_app",
  password: process.env.DB_PASSWORD || "blood_app_pass",
  database: process.env.DB_NAME || "inventory_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const DONOR_SERVICE_URL =
  process.env.DONOR_SERVICE_URL || "http://donor-service:4001";

const allowedBloodTypes = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

let pool;

function isValidBloodType(bloodType) {
  return allowedBloodTypes.includes(bloodType);
}

function mapInventory(row) {
  return {
    id: row.id,
    bloodType: row.blood_type,
    availableQuantity: row.available_quantity,
    reservedQuantity: row.reserved_quantity,
    totalQuantity: row.available_quantity + row.reserved_quantity,
    updatedAt: row.updated_at
  };
}

function mapDonation(row) {
  return {
    id: row.id,
    donorId: row.donor_id,
    donorName: row.donor_name,
    donorPhone: row.donor_phone,
    bloodType: row.blood_type,
    quantity: row.quantity,
    donationDate: row.donation_date,
    status: row.status,
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

      console.log("Inventory Service connected to MySQL");
      return;
    } catch (error) {
      console.log(
        `MySQL connection attempt ${attempt}/${maxRetries} failed: ${error.message}`
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  throw new Error("Inventory Service failed to connect to MySQL");
}

async function fetchDonor(donorId) {
  const response = await fetch(`${DONOR_SERVICE_URL}/donors/${donorId}`);
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.message || "Failed to fetch donor");
  }

  return data.data;
}

async function updateDonorLastDonationDate(donorId, donationDate) {
  const response = await fetch(`${DONOR_SERVICE_URL}/donors/${donorId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lastDonationDate: donationDate,
      isAvailable: true
    })
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.message || "Failed to update donor last donation date");
  }

  return data.data;
}

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      service: "inventory-service",
      status: "UP",
      database: "CONNECTED",
      port: Number(PORT),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      service: "inventory-service",
      status: "DOWN",
      database: "DISCONNECTED",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get("/inventory", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT *
       FROM blood_inventory
       ORDER BY FIELD(blood_type, 'O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+')`
    );

    res.json({
      success: true,
      count: rows.length,
      data: rows.map(mapInventory)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch blood inventory",
      error: error.message
    });
  }
});

app.get("/inventory/:bloodType", async (req, res) => {
  const bloodType = req.params.bloodType;

  if (!isValidBloodType(bloodType)) {
    return res.status(400).json({
      success: false,
      message: "Invalid blood type"
    });
  }

  try {
    const [rows] = await pool.execute(
      "SELECT * FROM blood_inventory WHERE blood_type = ?",
      [bloodType]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Blood inventory record not found"
      });
    }

    res.json({
      success: true,
      data: mapInventory(rows[0])
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch inventory item",
      error: error.message
    });
  }
});

app.get("/donations", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT *
       FROM donations
       ORDER BY created_at DESC`
    );

    res.json({
      success: true,
      count: rows.length,
      data: rows.map(mapDonation)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch donations",
      error: error.message
    });
  }
});

app.post("/donations", async (req, res) => {
  const {
    donorId,
    quantity = 1,
    donationDate = new Date().toISOString().slice(0, 10),
    notes = null
  } = req.body;

  if (!donorId) {
    return res.status(400).json({
      success: false,
      message: "donorId is required"
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
    const donor = await fetchDonor(donorId);

    if (!donor.isEligible) {
      return res.status(409).json({
        success: false,
        message: "Donor is not eligible to donate now",
        reason: donor.eligibilityReason,
        donor
      });
    }

    await connection.beginTransaction();

    const [donationResult] = await connection.execute(
      `INSERT INTO donations
       (donor_id, donor_name, donor_phone, blood_type, quantity, donation_date, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, 'ACCEPTED', ?)`,
      [
        donor.id,
        donor.fullName,
        donor.phone,
        donor.bloodType,
        Number(quantity),
        donationDate,
        notes
      ]
    );

    await connection.execute(
      `UPDATE blood_inventory
       SET available_quantity = available_quantity + ?
       WHERE blood_type = ?`,
      [Number(quantity), donor.bloodType]
    );

    const [donationRows] = await connection.execute(
      "SELECT * FROM donations WHERE id = ?",
      [donationResult.insertId]
    );

    const [inventoryRows] = await connection.execute(
      "SELECT * FROM blood_inventory WHERE blood_type = ?",
      [donor.bloodType]
    );

    await connection.commit();

    const updatedDonor = await updateDonorLastDonationDate(
      donor.id,
      donationDate
    );

    res.status(201).json({
      success: true,
      message: "Donation recorded successfully",
      data: {
        donation: mapDonation(donationRows[0]),
        inventory: mapInventory(inventoryRows[0]),
        donor: updatedDonor
      }
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_) {}

    res.status(500).json({
      success: false,
      message: "Failed to record donation",
      error: error.message
    });
  } finally {
    connection.release();
  }
});

app.patch("/inventory/:bloodType/decrease", async (req, res) => {
  const bloodType = req.params.bloodType;
  const { quantity } = req.body;

  if (!isValidBloodType(bloodType)) {
    return res.status(400).json({
      success: false,
      message: "Invalid blood type"
    });
  }

  if (!Number.isInteger(Number(quantity)) || Number(quantity) <= 0) {
    return res.status(400).json({
      success: false,
      message: "quantity must be a positive integer"
    });
  }

  try {
    const [rows] = await pool.execute(
      "SELECT * FROM blood_inventory WHERE blood_type = ?",
      [bloodType]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Inventory item not found"
      });
    }

    const item = rows[0];

    if (item.available_quantity < Number(quantity)) {
      return res.status(409).json({
        success: false,
        message: "Not enough blood quantity available",
        availableQuantity: item.available_quantity,
        requestedQuantity: Number(quantity)
      });
    }

    await pool.execute(
      `UPDATE blood_inventory
       SET available_quantity = available_quantity - ?
       WHERE blood_type = ?`,
      [Number(quantity), bloodType]
    );

    const [updatedRows] = await pool.execute(
      "SELECT * FROM blood_inventory WHERE blood_type = ?",
      [bloodType]
    );

    res.json({
      success: true,
      message: "Inventory decreased successfully",
      data: mapInventory(updatedRows[0])
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to decrease inventory",
      error: error.message
    });
  }
});

app.listen(PORT, async () => {
  console.log(`Inventory Service running on port ${PORT}`);

  try {
    await waitForDatabase();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
});
