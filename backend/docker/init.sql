-- init.sql
CREATE DATABASE IF NOT EXISTS product;
CREATE USER IF NOT EXISTS 'tda_user'@'%' IDENTIFIED WITH caching_sha2_password BY 'strongPassword?';
ALTER USER 'tda_user'@'%' IDENTIFIED WITH caching_sha2_password BY 'strongPassword?';
GRANT ALL PRIVILEGES ON product.* TO 'tda_user'@'%';
FLUSH PRIVILEGES;