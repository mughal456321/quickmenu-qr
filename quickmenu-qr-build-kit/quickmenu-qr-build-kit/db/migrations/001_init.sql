-- QuickMenu QR initial schema (from docs/03_DATABASE_API_WIREFRAMES.md, section 2.10)

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive email
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- fuzzy name search

-- Enumerations
CREATE TYPE user_role          AS ENUM ('owner', 'kitchen');
CREATE TYPE order_status       AS ENUM ('new', 'preparing', 'ready', 'served', 'cancelled');
CREATE TYPE translation_entity AS ENUM ('category', 'item', 'variant');
CREATE TYPE translation_field  AS ENUM ('name', 'description');

-- D1: restaurants and users
CREATE TABLE restaurants (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(120) NOT NULL,
  slug             VARCHAR(80)  NOT NULL UNIQUE,
  default_language VARCHAR(8)   NOT NULL DEFAULT 'en',
  currency         CHAR(3)      NOT NULL DEFAULT 'PKR',
  order_counter    INTEGER      NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID         NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  email           CITEXT       NOT NULL UNIQUE,
  name            VARCHAR(100) NOT NULL,
  password_hash   VARCHAR(100) NOT NULL,
  role            user_role    NOT NULL,
  failed_attempts SMALLINT     NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ix_users_restaurant ON users (restaurant_id);

CREATE TABLE password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64)    NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ
);
CREATE INDEX ix_prt_user ON password_reset_tokens (user_id);

-- D2: menu
CREATE TABLE categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name          VARCHAR(80) NOT NULL,
  display_order INTEGER     NOT NULL DEFAULT 0,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ux_categories_restaurant_name UNIQUE (restaurant_id, name)
);
CREATE INDEX ix_categories_order ON categories (restaurant_id, display_order);

CREATE TABLE menu_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID          NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  category_id   UUID          NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  name          VARCHAR(120)  NOT NULL,
  description   TEXT,
  base_price    NUMERIC(10,2) NOT NULL CHECK (base_price >= 0),
  is_available  BOOLEAN       NOT NULL DEFAULT TRUE,
  dietary_tags  TEXT[]        NOT NULL DEFAULT '{}'
                CHECK (dietary_tags <@ ARRAY['vegetarian','vegan','halal','gluten_free']),
  allergens     TEXT[]        NOT NULL DEFAULT '{}'
                CHECK (allergens <@ ARRAY['nuts','dairy','gluten','eggs','seafood','soy']),
  display_order INTEGER       NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX ix_items_restaurant_category ON menu_items (restaurant_id, category_id, display_order);
CREATE INDEX ix_items_available ON menu_items (restaurant_id) WHERE is_available;
CREATE INDEX ix_items_dietary   ON menu_items USING GIN (dietary_tags);
CREATE INDEX ix_items_allergens ON menu_items USING GIN (allergens);
CREATE INDEX ix_items_name_trgm ON menu_items USING GIN (name gin_trgm_ops);

CREATE TABLE item_variants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       UUID          NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name          VARCHAR(60)   NOT NULL,
  price         NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  display_order INTEGER       NOT NULL DEFAULT 0
);
CREATE INDEX ix_variants_item ON item_variants (item_id, display_order);

CREATE TABLE item_images (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       UUID         NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  public_id     VARCHAR(200) NOT NULL,
  url           TEXT         NOT NULL,
  display_order INTEGER      NOT NULL DEFAULT 0
);
CREATE INDEX ix_images_item ON item_images (item_id, display_order);

-- D3: tables and QR
CREATE TABLE restaurant_tables (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  table_number  VARCHAR(20) NOT NULL,
  qr_token      VARCHAR(64) NOT NULL UNIQUE,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ux_tables_restaurant_number UNIQUE (restaurant_id, table_number)
);

-- D4: orders
CREATE TABLE orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id       UUID          NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  table_id            UUID          NOT NULL REFERENCES restaurant_tables(id) ON DELETE RESTRICT,
  order_number        INTEGER       NOT NULL,
  status              order_status  NOT NULL DEFAULT 'new',
  total               NUMERIC(10,2) NOT NULL CHECK (total >= 0),
  notes               TEXT,
  client_request_id   UUID          NOT NULL UNIQUE,
  tracking_token_hash CHAR(64)      NOT NULL,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT ux_orders_restaurant_number UNIQUE (restaurant_id, order_number)
);
CREATE INDEX ix_orders_active  ON orders (restaurant_id, created_at)
  WHERE status IN ('new', 'preparing', 'ready');
CREATE INDEX ix_orders_history ON orders (restaurant_id, created_at DESC);
CREATE INDEX ix_orders_table   ON orders (table_id, created_at DESC);

CREATE TABLE order_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             UUID          NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id              UUID          REFERENCES menu_items(id)    ON DELETE SET NULL,
  variant_id           UUID          REFERENCES item_variants(id) ON DELETE SET NULL,
  item_name            VARCHAR(120)  NOT NULL,
  variant_name         VARCHAR(60),
  quantity             SMALLINT      NOT NULL CHECK (quantity BETWEEN 1 AND 50),
  unit_price           NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
  special_instructions TEXT
);
CREATE INDEX ix_order_items_order ON order_items (order_id);

CREATE TABLE order_status_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID         NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status     order_status NOT NULL,
  changed_by UUID         REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ix_history_order ON order_status_history (order_id, changed_at);

-- D5: translation cache
CREATE TABLE translations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID               NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  entity_type     translation_entity NOT NULL,
  entity_id       UUID               NOT NULL,
  field           translation_field  NOT NULL,
  language        VARCHAR(8)         NOT NULL,
  source_hash     CHAR(64)           NOT NULL,
  translated_text TEXT               NOT NULL,
  CONSTRAINT ux_translations_key UNIQUE (entity_type, entity_id, field, language)
);
CREATE INDEX ix_translations_restaurant ON translations (restaurant_id);

-- Rule: at most 3 images per item
CREATE FUNCTION limit_item_images() RETURNS trigger AS $$
BEGIN
  IF (SELECT count(*) FROM item_images WHERE item_id = NEW.item_id) >= 3 THEN
    RAISE EXCEPTION 'An item can have at most 3 images';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_limit_item_images
  BEFORE INSERT ON item_images
  FOR EACH ROW EXECUTE FUNCTION limit_item_images();
