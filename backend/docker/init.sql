-- init.sql
CREATE DATABASE IF NOT EXISTS product;
CREATE USER IF NOT EXISTS 'tda_user'@'%' IDENTIFIED WITH caching_sha2_password BY 'strongPassword?';
ALTER USER 'tda_user'@'%' IDENTIFIED WITH caching_sha2_password BY 'strongPassword?';
GRANT ALL PRIVILEGES ON product.* TO 'tda_user'@'%';
FLUSH PRIVILEGES;

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

INSERT IGNORE INTO team (id, name) VALUES (1, 'Macka Cervene');
INSERT IGNORE INTO team_member (team_id, name) VALUES (1, 'Ema'), (1, 'Amálie');