const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const client = require('prom-client');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres-service',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'inv_user',
  password: process.env.DB_PASSWORD || 'inv_pass_2026',
  database: process.env.DB_NAME || 'inventory_db',
});

// --- Métricas Prometheus / Grafana ---
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const inventoryEventsCounter = new client.Counter({
  name: 'inventory_events_total',
  help: 'Total de eventos de inventario registrados por tipo',
  labelNames: ['event_type', 'sku'],
  registers: [register],
});

const lowStockGauge = new client.Gauge({
  name: 'inventory_low_stock_items',
  help: 'Cantidad de productos por debajo del stock mínimo',
  registers: [register],
});

const httpDurationHistogram = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Latencia de peticiones HTTP en segundos',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

app.use((req, res, next) => {
  const end = httpDurationHistogram.startTimer();
  res.on('finish', () => {
    end({ method: req.method, route: req.path, status: res.statusCode });
  });
  next();
});

async function refreshLowStockMetric() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM products WHERE quantity <= min_stock');
  lowStockGauge.set(rows[0].count);
}

// --- Endpoints ---
app.get('/health', (req, res) => res.status(200).json({ status: 'OK' }));

app.get('/metrics', async (req, res) => {
  await refreshLowStockMetric();
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.get('/api/products', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products ORDER BY id ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/events', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM inventory_events ORDER BY created_at DESC LIMIT 15');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', async (req, res) => {
  const { sku, name, category, quantity, min_stock, unit_price } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO products (sku, name, category, quantity, min_stock, unit_price)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [sku.toUpperCase(), name, category, Number(quantity), Number(min_stock), Number(unit_price || 0)]
    );
    await pool.query(
      'INSERT INTO inventory_events (product_sku, event_type, delta) VALUES ($1, $2, $3)',
      [sku.toUpperCase(), 'CREATE', Number(quantity)]
    );
    inventoryEventsCounter.inc({ event_type: 'CREATE', sku: sku.toUpperCase() });
    await refreshLowStockMetric();
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/products/:id/stock', async (req, res) => {
  const { id } = req.params;
  const { delta } = req.body; // +N para entrada, -N para salida
  try {
    const { rows } = await pool.query(
      `UPDATE products 
       SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 AND (quantity + $1) >= 0 
       RETURNING *`,
      [Number(delta), id]
    );
    if (!rows.length) return res.status(400).json({ error: 'Stock insuficiente o producto no existe' });

    const product = rows[0];
    const eventType = Number(delta) >= 0 ? 'IN' : 'OUT';
    await pool.query(
      'INSERT INTO inventory_events (product_sku, event_type, delta) VALUES ($1, $2, $3)',
      [product.sku, eventType, Number(delta)]
    );
    inventoryEventsCounter.inc({ event_type: eventType, sku: product.sku });

    if (product.quantity <= product.min_stock) {
      inventoryEventsCounter.inc({ event_type: 'LOW_STOCK', sku: product.sku });
    }
    await refreshLowStockMetric();
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    await refreshLowStockMetric();
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Inventory API running on port ${PORT}`));
