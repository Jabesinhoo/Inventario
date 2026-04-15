
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'counter',
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE,
    barcode VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    sku VARCHAR(50),
    description TEXT,
    category VARCHAR(100),
    brand VARCHAR(100),
    model VARCHAR(100),
    location VARCHAR(50),
    min_stock INTEGER DEFAULT 0,
    max_stock INTEGER DEFAULT 0,
    unit_price DECIMAL(10,2),
    cost_price DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Counting sessions table
CREATE TABLE IF NOT EXISTS counting_sessions (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE,
    user_id INTEGER REFERENCES users(id),
    session_code VARCHAR(50) UNIQUE NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active',
    total_items INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Scans table
CREATE TABLE IF NOT EXISTS scans (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE,
    session_id INTEGER REFERENCES counting_sessions(id),
    product_id INTEGER REFERENCES products(id),
    user_id INTEGER REFERENCES users(id),
    barcode VARCHAR(100) NOT NULL,
    quantity INTEGER DEFAULT 1,
    scanned_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_products_barcode ON products(barcode);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_sessions_user ON counting_sessions(user_id);
CREATE INDEX idx_sessions_status ON counting_sessions(status);
CREATE INDEX idx_sessions_code ON counting_sessions(session_code);
CREATE INDEX idx_scans_session ON scans(session_id);
CREATE INDEX idx_scans_product ON scans(product_id);
CREATE INDEX idx_scans_barcode ON scans(barcode);
CREATE INDEX idx_scans_date ON scans(scanned_at);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();