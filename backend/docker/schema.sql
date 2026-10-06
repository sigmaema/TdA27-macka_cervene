CREATE TABLE IF NOT EXISTS product (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  cost INT NOT NULL
);

CREATE TABLE IF NOT EXISTS team (
  id INT PRIMARY KEY,
  name VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS team_member (
  id INT AUTO_INCREMENT PRIMARY KEY,
  team_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  FOREIGN KEY (team_id) REFERENCES team(id)
);

CREATE TABLE IF NOT EXISTS stops (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  `lines` VARCHAR(255) NOT NULL DEFAULT '',
  transfer_lines VARCHAR(255) NOT NULL DEFAULT '',
  image_url VARCHAR(255),
  is_transfer BOOLEAN NOT NULL DEFAULT FALSE,
  x DECIMAL(10, 6),
  y DECIMAL(10, 6),
  wheelchair_accessible BOOLEAN NOT NULL DEFAULT FALSE,
  has_shelter BOOLEAN NOT NULL DEFAULT FALSE,
  has_bench BOOLEAN NOT NULL DEFAULT FALSE,
  has_ticket_machine BOOLEAN NOT NULL DEFAULT FALSE,
  has_display BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS transit_lines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  number VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL,
  color VARCHAR(7) NOT NULL
);

CREATE TABLE IF NOT EXISTS line_trips (
  id INT AUTO_INCREMENT PRIMARY KEY,
  line_id INT NOT NULL,
  direction ENUM('outbound', 'inbound') NOT NULL,
  FOREIGN KEY (line_id) REFERENCES transit_lines(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS line_directions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  line_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  FOREIGN KEY (line_id) REFERENCES transit_lines(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS line_direction_stops (
  direction_id INT NOT NULL,
  stop_id INT NOT NULL,
  stop_order INT NOT NULL,
  PRIMARY KEY (direction_id, stop_id),
  UNIQUE KEY unique_direction_order (direction_id, stop_order),
  FOREIGN KEY (direction_id) REFERENCES line_directions(id) ON DELETE CASCADE,
  FOREIGN KEY (stop_id) REFERENCES stops(id) ON DELETE CASCADE
);

INSERT INTO team (id, name) VALUES (1, 'Macka Cervene')
  ON DUPLICATE KEY UPDATE name = VALUES(name);

DELETE FROM team_member WHERE team_id = 1;
INSERT INTO team_member (team_id, name) VALUES (1, 'Ema'), (1, 'Amálie');
