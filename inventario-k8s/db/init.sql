CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    sku VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(120) NOT NULL,
    category VARCHAR(80) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    min_stock INTEGER NOT NULL DEFAULT 5,
    unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_events (
    id SERIAL PRIMARY KEY,
    product_sku VARCHAR(50) NOT NULL,
    event_type VARCHAR(30) NOT NULL, -- 'IN', 'OUT', 'CREATE', 'LOW_STOCK'
    delta INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO products (sku, name, category, quantity, min_stock, unit_price)
VALUES 
    ('SKU-001', 'Servidor Rack 1U', 'Infraestructura', 12, 3, 1250.00),
    ('SKU-002', 'Switch Gigabit 24P', 'Redes', 4, 5, 320.00),
    ('SKU-003', 'Patch Cord Cat6 2m', 'Cableado', 85, 20, 4.50)
ON CONFLICT (sku) DO NOTHING;
