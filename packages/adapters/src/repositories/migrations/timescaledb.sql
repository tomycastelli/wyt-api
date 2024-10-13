-- Setup completo de la tabla coin_prices
-- Con indice y compresión automática

CREATE TABLE coin_prices (
  time TIMESTAMPTZ NOT NULL,
  coin_symbol TEXT NOT NULL,
  price DOUBLE PRECISION NULL
);

SELECT create_hypertable('coin_prices', by_range('time'));

CREATE INDEX ix_coin_symbol_time ON coin_prices (coin_symbol, time DESC);

-- Compresión
ALTER TABLE coin_prices
SET (
    timescaledb.compress,
    timescaledb.compress_segmentby='coin_symbol',
    timescaledb.compress_orderby='time DESC'
);

SELECT add_compression_policy('coin_prices', INTERVAL '4 days');


-- Cálculo de candelas automático
-- Horaria
CREATE MATERIALIZED VIEW one_hour_candle
WITH (timescaledb.continuous) AS
    SELECT
        time_bucket('1 hour', time) AS bucket,
        coin_symbol,
        FIRST(price, time) AS "open",
        MAX(price) AS high,
        MIN(price) AS low,
        LAST(price, time) AS "close"
    FROM coin_prices
    GROUP BY bucket, coin_symbol;

SELECT add_continuous_aggregate_policy('one_hour_candle',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour');

-- Compresión
ALTER MATERIALIZED VIEW one_hour_candle
SET (
    timescaledb.compress,
    timescaledb.compress_segmentby='coin_symbol',
    timescaledb.compress_orderby='bucket DESC'
);

SELECT add_compression_policy('one_hour_candle', INTERVAL '4 days');

-- Diaria
CREATE MATERIALIZED VIEW one_day_candle
WITH (timescaledb.continuous) AS
    SELECT
        time_bucket('1 day', time) AS bucket,
        coin_symbol,
        FIRST(price, time) AS "open",
        MAX(price) AS high,
        MIN(price) AS low,
        LAST(price, time) AS "close"
    FROM coin_prices
    GROUP BY bucket, coin_symbol;

SELECT add_continuous_aggregate_policy('one_day_candle',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day');

-- Compresión
ALTER MATERIALIZED VIEW one_day_candle
SET (
    timescaledb.compress,
    timescaledb.compress_segmentby='coin_symbol',
    timescaledb.compress_orderby='bucket DESC'
);

SELECT add_compression_policy('one_day_candle', INTERVAL '30 days');
