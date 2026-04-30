const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4001;

const DB_CONFIG = {
  host: process.env.DB_HOST || "mysql",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "blood_app",
  password: process.env.DB_PASSWORD || "blood_app_pass",
  database: process.env.DB_NAME || "donor_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const MIN_DONATION_INTERVAL_DAYS = Number(
  process.env.MIN_DONATION_INTERVAL_DAYS || 90
);

const allowedBloodTypes = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

let pool;

function isValidBloodType(bloodType) {
  return allowedBloodTypes.includes(bloodType);
}

function calculateDaysSinceLastDonation(lastDonationDate) {
  if (!lastDonationDate) return null;

  const last = new Date(lastDonationDate);
  const now = new Date();

  const diffMs = now.getTime() - last.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function calculateEligibility(lastDonationDate, isAvailable, isActive) {
  if (!isActive) {
    return {
      isEligible: false,
      reason: "Donor account is inactive",
      daysSinceLastDonation: calculateDaysSinceLastDonation(lastDonationDate)
    };
  }

  if (!isAvailable) {
    return {
      isEligible: false,
      reason: "Donor is marked unavailable",
      daysSinceLastDonation: calculateDaysSinceLastDonation(lastDonationDate)
    };
  }

  if (!lastDonationDate) {
    return {
      isEligible: true,
      reason: "No previous donation recorded",
      daysSinceLastDonation: null
    };
  }

  const daysSinceLastDonation = calculateDaysSinceLastDonation(lastDonationDate);

  if (daysSinceLastDonation >= MIN_DONATION_INTERVAL_DAYS) {
    return {
      isEligible: true,
      reason: "Minimum donation interval passed",
      daysSinceLastDonation
    };
  }

  return {
    isEligible: false,
    reason: `Minimum donation interval not passed. Required ${MIN_DONATION_INTERVAL_DAYS} days.`,
    daysSinceLastDonation
  };
}

function mapDonor(row) {
  if (!row) return null;

  const eligibility = calculateEligibility(
    row.last_donation_date,
    Boolean(row.is_available),
    Boolean(row.is_active)
  );

  return {
    id: row.id,
    fullName: row.full_name,
    bloodType: row.blood_type,
    city: row.city,
    district: row.district,
    phone: row.phone,
    email: row.email,
    lastDonationDate: row.last_donation_date,
    isAvailable: Boolean(row.is_available),
    isActive: Boolean(row.is_active),
    isEligible: eligibility.isEligible,
    eligibilityReason: eligibility.reason,
    daysSinceLastDonation: eligibility.daysSinceLastDonation,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function waitForDatabase(maxRetries = 30) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      pool = mysql.createPool(DB_CONFIG);
      const connection = await pool.getConnection();
      await connection.ping();
      connection.release();

      console.log("Donor Service connected to MySQL");
      return;
    } catch (error) {
      console.log(
        `MySQL connection attempt ${attempt}/${maxRetries} failed: ${error.message}`
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  throw new Error("Donor Service failed to connect to MySQL");
}

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      service: "donor-service",
      status: "UP",
      database: "CONNECTED",
      port: Number(PORT),
      minDonationIntervalDays: MIN_DONATION_INTERVAL_DAYS,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      service: "donor-service",
      status: "DOWN",
      database: "DISCONNECTED",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get("/donors", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT *
       FROM donors
       ORDER BY created_at DESC`
    );

    const donors = rows.map(mapDonor);

    res.json({
      success: true,
      count: donors.length,
      data: donors
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch donors",
      error: error.message
    });
  }
});

app.get("/donors/search", async (req, res) => {
  const { bloodType, city, district, eligibleOnly = "true" } = req.query;

  if (bloodType && !isValidBloodType(bloodType)) {
    return res.status(400).json({
      success: false,
      message: "Invalid blood type"
    });
  }

  try {
    const conditions = ["is_active = TRUE"];
    const values = [];

    if (bloodType) {
      conditions.push("blood_type = ?");
      values.push(bloodType);
    }

    if (city) {
      conditions.push("city = ?");
      values.push(city);
    }

    if (district) {
      conditions.push("district = ?");
      values.push(district);
    }

    const [rows] = await pool.execute(
      `SELECT *
       FROM donors
       WHERE ${conditions.join(" AND ")}
       ORDER BY last_donation_date IS NULL DESC, last_donation_date ASC, full_name ASC`,
      values
    );

    let donors = rows.map(mapDonor);

    if (eligibleOnly === "true") {
      donors = donors.filter((donor) => donor.isEligible);
    }

    res.json({
      success: true,
      count: donors.length,
      data: donors
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to search donors",
      error: error.message
    });
  }
});

app.get("/donors/:id", async (req, res) => {
  const donorId = Number(req.params.id);

  if (!donorId || Number.isNaN(donorId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid donor id"
    });
  }

  try {
    const [rows] = await pool.execute(
      "SELECT * FROM donors WHERE id = ?",
      [donorId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Donor not found"
      });
    }

    res.json({
      success: true,
      data: mapDonor(rows[0])
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch donor",
      error: error.message
    });
  }
});

app.post("/donors", async (req, res) => {
  const {
    fullName,
    bloodType,
    city = "Taiz",
    district = null,
    phone,
    email = null,
    lastDonationDate = null,
    isAvailable = true
  } = req.body;

  if (!fullName || !bloodType || !phone) {
    return res.status(400).json({
      success: false,
      message: "fullName, bloodType, and phone are required"
    });
  }

  if (!isValidBloodType(bloodType)) {
    return res.status(400).json({
      success: false,
      message: "Invalid blood type"
    });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO donors
       (full_name, blood_type, city, district, phone, email, last_donation_date, is_available, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [
        fullName,
        bloodType,
        city,
        district,
        phone,
        email,
        lastDonationDate,
        Boolean(isAvailable)
      ]
    );

    const [rows] = await pool.execute(
      "SELECT * FROM donors WHERE id = ?",
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: "Donor created successfully",
      data: mapDonor(rows[0])
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Phone number already exists"
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create donor",
      error: error.message
    });
  }
});

app.patch("/donors/:id", async (req, res) => {
  const donorId = Number(req.params.id);

  if (!donorId || Number.isNaN(donorId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid donor id"
    });
  }

  const {
    fullName,
    bloodType,
    city,
    district,
    phone,
    email,
    lastDonationDate,
    isAvailable,
    isActive
  } = req.body;

  if (bloodType !== undefined && !isValidBloodType(bloodType)) {
    return res.status(400).json({
      success: false,
      message: "Invalid blood type"
    });
  }

  const fields = [];
  const values = [];

  if (fullName !== undefined) {
    fields.push("full_name = ?");
    values.push(fullName);
  }

  if (bloodType !== undefined) {
    fields.push("blood_type = ?");
    values.push(bloodType);
  }

  if (city !== undefined) {
    fields.push("city = ?");
    values.push(city);
  }

  if (district !== undefined) {
    fields.push("district = ?");
    values.push(district);
  }

  if (phone !== undefined) {
    fields.push("phone = ?");
    values.push(phone);
  }

  if (email !== undefined) {
    fields.push("email = ?");
    values.push(email);
  }

  if (lastDonationDate !== undefined) {
    fields.push("last_donation_date = ?");
    values.push(lastDonationDate);
  }

  if (isAvailable !== undefined) {
    fields.push("is_available = ?");
    values.push(Boolean(isAvailable));
  }

  if (isActive !== undefined) {
    fields.push("is_active = ?");
    values.push(Boolean(isActive));
  }

  if (!fields.length) {
    return res.status(400).json({
      success: false,
      message: "No fields provided for update"
    });
  }

  values.push(donorId);

  try {
    const [result] = await pool.execute(
      `UPDATE donors SET ${fields.join(", ")} WHERE id = ?`,
      values
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Donor not found"
      });
    }

    const [rows] = await pool.execute(
      "SELECT * FROM donors WHERE id = ?",
      [donorId]
    );

    res.json({
      success: true,
      message: "Donor updated successfully",
      data: mapDonor(rows[0])
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Phone number already exists"
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to update donor",
      error: error.message
    });
  }
});

app.patch("/donors/:id/availability", async (req, res) => {
  const donorId = Number(req.params.id);
  const { isAvailable } = req.body;

  if (!donorId || Number.isNaN(donorId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid donor id"
    });
  }

  if (typeof isAvailable !== "boolean") {
    return res.status(400).json({
      success: false,
      message: "isAvailable must be boolean"
    });
  }

  try {
    const [result] = await pool.execute(
      "UPDATE donors SET is_available = ? WHERE id = ?",
      [isAvailable, donorId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Donor not found"
      });
    }

    const [rows] = await pool.execute(
      "SELECT * FROM donors WHERE id = ?",
      [donorId]
    );

    res.json({
      success: true,
      message: "Donor availability updated successfully",
      data: mapDonor(rows[0])
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update donor availability",
      error: error.message
    });
  }
});

app.delete("/donors/:id", async (req, res) => {
  const donorId = Number(req.params.id);

  if (!donorId || Number.isNaN(donorId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid donor id"
    });
  }

  try {
    const [result] = await pool.execute(
      "UPDATE donors SET is_active = FALSE, is_available = FALSE WHERE id = ?",
      [donorId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Donor not found"
      });
    }

    res.json({
      success: true,
      message: "Donor deactivated successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to deactivate donor",
      error: error.message
    });
  }
});

app.listen(PORT, async () => {
  console.log(`Donor Service running on port ${PORT}`);

  try {
    await waitForDatabase();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
});
