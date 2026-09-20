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

INSERT INTO team (id, name) VALUES (1, 'Macka Cervene')
  ON DUPLICATE KEY UPDATE name = VALUES(name);

DELETE FROM team_member WHERE team_id = 1;
INSERT INTO team_member (team_id, name) VALUES (1, 'Ema'), (1, 'Amálie');
