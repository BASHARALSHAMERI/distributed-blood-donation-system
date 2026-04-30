CREATE DATABASE IF NOT EXISTS donor_db;
CREATE DATABASE IF NOT EXISTS request_db;
CREATE DATABASE IF NOT EXISTS inventory_db;
CREATE DATABASE IF NOT EXISTS notification_db;

-- =========================================================
-- DONOR DATABASE
-- =========================================================
USE donor_db;

CREATE TABLE IF NOT EXISTS donors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  blood_type ENUM('A+','A-','B+','B-','AB+','AB-','O+','O-') NOT NULL,
  city VARCHAR(100) NOT NULL DEFAULT 'Taiz',
  district VARCHAR(100) NULL,
  phone VARCHAR(30) NOT NULL UNIQUE,
  email VARCHAR(150) NULL,
  last_donation_date DATE NULL,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_donors_blood_city (blood_type, city),
  INDEX idx_donors_available (is_available, is_active),
  INDEX idx_donors_last_donation (last_donation_date)
);

INSERT INTO donors
(full_name, blood_type, city, district, phone, email, last_donation_date, is_available, is_active)
VALUES
('Ahmed Ali', 'O+', 'Taiz', 'Al-Qahira', '777111222', 'ahmed@example.com', NULL, TRUE, TRUE),
('Mohammed Saleh', 'A+', 'Taiz', 'Al-Mudhaffar', '777333444', 'mohammed@example.com', NULL, TRUE, TRUE),
('Khaled Nasser', 'O-', 'Taiz', 'Salah', '777555666', 'khaled@example.com', NULL, TRUE, TRUE),
('Bashar Al Shameri', 'O+', 'Taiz', 'Al-Qahira', '777000111', 'bashar@example.com', NULL, TRUE, TRUE)
ON DUPLICATE KEY UPDATE
  full_name = VALUES(full_name),
  blood_type = VALUES(blood_type),
  city = VALUES(city),
  district = VALUES(district),
  email = VALUES(email),
  is_available = VALUES(is_available),
  is_active = VALUES(is_active);

-- =========================================================
-- REQUEST DATABASE
-- =========================================================
USE request_db;

CREATE TABLE IF NOT EXISTS hospitals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  city VARCHAR(100) NOT NULL DEFAULT 'Taiz',
  address VARCHAR(255) NULL,
  phone VARCHAR(30) NULL,
  contact_person VARCHAR(150) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_hospitals_city (city),
  INDEX idx_hospitals_active (is_active)
);

INSERT INTO hospitals
(name, code, city, address, phone, contact_person, is_active)
VALUES
('Al-Thawra Hospital', 'THW-TAIZ', 'Taiz', 'Taiz City', '04-000001', 'Emergency Desk', TRUE),
('Al-Jumhori Hospital', 'JUM-TAIZ', 'Taiz', 'Taiz City', '04-000002', 'Blood Unit', TRUE),
('Al-Safwa Hospital', 'SFW-TAIZ', 'Taiz', 'Taiz City', '04-000003', 'Reception', TRUE)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  city = VALUES(city),
  address = VALUES(address),
  phone = VALUES(phone),
  contact_person = VALUES(contact_person),
  is_active = VALUES(is_active);

CREATE TABLE IF NOT EXISTS blood_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ref_code VARCHAR(40) NOT NULL UNIQUE,
  hospital_id INT NULL,
  hospital_name VARCHAR(180) NOT NULL,
  patient_name VARCHAR(150) NOT NULL,
  doctor_name VARCHAR(150) NULL,
  blood_type ENUM('A+','A-','B+','B-','AB+','AB-','O+','O-') NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  city VARCHAR(100) NOT NULL DEFAULT 'Taiz',
  urgency ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'MEDIUM',
  status ENUM('PENDING','MATCHED','RESERVED','DELIVERED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_blood_requests_hospital
    FOREIGN KEY (hospital_id) REFERENCES hospitals(id)
    ON DELETE SET NULL,

  INDEX idx_requests_ref_code (ref_code),
  INDEX idx_requests_blood_city (blood_type, city),
  INDEX idx_requests_urgency_status (urgency, status),
  INDEX idx_requests_created_at (created_at)
);

CREATE TABLE IF NOT EXISTS request_matches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  donor_id INT NOT NULL,
  donor_name VARCHAR(150) NOT NULL,
  donor_phone VARCHAR(30) NOT NULL,
  blood_type VARCHAR(10) NOT NULL,
  city VARCHAR(100) NOT NULL,
  match_status ENUM('SUGGESTED','CONTACTED','ACCEPTED','REJECTED','SELECTED') NOT NULL DEFAULT 'SUGGESTED',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_request_matches_request
    FOREIGN KEY (request_id) REFERENCES blood_requests(id)
    ON DELETE CASCADE,

  INDEX idx_matches_request (request_id),
  INDEX idx_matches_donor (donor_id)
);

CREATE TABLE IF NOT EXISTS request_handovers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  ref_code VARCHAR(40) NOT NULL,
  receiver_name VARCHAR(150) NOT NULL,
  receiver_phone VARCHAR(30) NULL,
  delivered_quantity INT NOT NULL,
  delivered_by VARCHAR(150) NULL,
  handover_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_handovers_request
    FOREIGN KEY (request_id) REFERENCES blood_requests(id)
    ON DELETE CASCADE,

  INDEX idx_handovers_ref_code (ref_code),
  INDEX idx_handovers_request (request_id)
);

-- =========================================================
-- INVENTORY DATABASE
-- =========================================================
USE inventory_db;

CREATE TABLE IF NOT EXISTS blood_inventory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  blood_type ENUM('A+','A-','B+','B-','AB+','AB-','O+','O-') NOT NULL UNIQUE,
  available_quantity INT NOT NULL DEFAULT 0,
  reserved_quantity INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CHECK (available_quantity >= 0),
  CHECK (reserved_quantity >= 0)
);

INSERT INTO blood_inventory
(blood_type, available_quantity, reserved_quantity)
VALUES
('A+', 10, 0),
('A-', 3, 0),
('B+', 8, 0),
('B-', 2, 0),
('AB+', 4, 0),
('AB-', 1, 0),
('O+', 12, 0),
('O-', 5, 0)
ON DUPLICATE KEY UPDATE
  available_quantity = VALUES(available_quantity),
  reserved_quantity = VALUES(reserved_quantity);

CREATE TABLE IF NOT EXISTS donations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  donor_id INT NOT NULL,
  donor_name VARCHAR(150) NOT NULL,
  donor_phone VARCHAR(30) NULL,
  blood_type ENUM('A+','A-','B+','B-','AB+','AB-','O+','O-') NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  donation_date DATE NOT NULL,
  status ENUM('ACCEPTED','REJECTED','PENDING') NOT NULL DEFAULT 'ACCEPTED',
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_donations_donor (donor_id),
  INDEX idx_donations_blood_date (blood_type, donation_date)
);

-- =========================================================
-- NOTIFICATION DATABASE
-- =========================================================
USE notification_db;

CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(80) NOT NULL,
  request_id INT NULL,
  ref_code VARCHAR(40) NULL,
  donor_id INT NULL,
  blood_type VARCHAR(10) NULL,
  city VARCHAR(100) NULL,
  urgency VARCHAR(30) NULL,
  recipient_type ENUM('BANK_STAFF','DONOR','HOSPITAL','SYSTEM') NOT NULL DEFAULT 'SYSTEM',
  recipient_name VARCHAR(150) NULL,
  recipient_contact VARCHAR(150) NULL,
  message TEXT NOT NULL,
  status ENUM('PENDING','SENT','FAILED','READ') NOT NULL DEFAULT 'SENT',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_notifications_type (type),
  INDEX idx_notifications_request (request_id),
  INDEX idx_notifications_ref_code (ref_code),
  INDEX idx_notifications_created_at (created_at)
);

-- =========================================================
-- APPLICATION DATABASE USER
-- =========================================================
CREATE USER IF NOT EXISTS 'blood_app'@'%' IDENTIFIED BY 'blood_app_pass';
ALTER USER 'blood_app'@'%' IDENTIFIED BY 'blood_app_pass';

GRANT ALL PRIVILEGES ON donor_db.* TO 'blood_app'@'%';
GRANT ALL PRIVILEGES ON request_db.* TO 'blood_app'@'%';
GRANT ALL PRIVILEGES ON inventory_db.* TO 'blood_app'@'%';
GRANT ALL PRIVILEGES ON notification_db.* TO 'blood_app'@'%';

FLUSH PRIVILEGES;
