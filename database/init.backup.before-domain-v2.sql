CREATE DATABASE IF NOT EXISTS donor_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS request_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS inventory_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS notification_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'blood_app'@'%' IDENTIFIED BY 'blood_app_pass';

GRANT ALL PRIVILEGES ON donor_db.* TO 'blood_app'@'%';
GRANT ALL PRIVILEGES ON request_db.* TO 'blood_app'@'%';
GRANT ALL PRIVILEGES ON inventory_db.* TO 'blood_app'@'%';
GRANT ALL PRIVILEGES ON notification_db.* TO 'blood_app'@'%';

FLUSH PRIVILEGES;

USE donor_db;

CREATE TABLE IF NOT EXISTS donors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    blood_type VARCHAR(3) NOT NULL,
    city VARCHAR(100) NOT NULL,
    phone VARCHAR(30) NOT NULL UNIQUE,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    last_donation_date DATE NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT IGNORE INTO donors (id, full_name, blood_type, city, phone, is_available)
VALUES
(1, 'Ahmed Ali', 'O+', 'Sanaa', '777111222', TRUE),
(2, 'Mohammed Saleh', 'A+', 'Taiz', '777333444', TRUE),
(3, 'Khaled Nasser', 'O-', 'Sanaa', '777555666', TRUE);

USE request_db;

CREATE TABLE IF NOT EXISTS blood_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    patient_name VARCHAR(150) NOT NULL,
    hospital_name VARCHAR(150) NOT NULL,
    blood_type VARCHAR(3) NOT NULL,
    city VARCHAR(100) NOT NULL,
    urgency VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

USE inventory_db;

CREATE TABLE IF NOT EXISTS blood_inventory (
    id INT AUTO_INCREMENT PRIMARY KEY,
    blood_type VARCHAR(3) NOT NULL,
    units_available INT NOT NULL DEFAULT 0,
    hospital_name VARCHAR(150) NOT NULL,
    city VARCHAR(100) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT IGNORE INTO blood_inventory (id, blood_type, units_available, hospital_name, city)
VALUES
(1, 'O+', 8, 'Al-Thawra Hospital', 'Sanaa'),
(2, 'A+', 5, 'Republic Hospital', 'Sanaa'),
(3, 'O-', 2, 'Al-Thawra Hospital', 'Sanaa');

USE notification_db;

CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type VARCHAR(80) NOT NULL,
    request_id INT NULL,
    blood_type VARCHAR(3) NULL,
    city VARCHAR(100) NULL,
    urgency VARCHAR(20) NULL,
    message TEXT NOT NULL,
    matched_donors_count INT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'SENT',
    source_event_id VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
