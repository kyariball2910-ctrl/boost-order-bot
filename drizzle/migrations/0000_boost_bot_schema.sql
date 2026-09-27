-- Boost Order Bot schema

CREATE TABLE public.packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  campaign_tier_label TEXT NOT NULL,
  price_sol NUMERIC(12, 4) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.packages TO anon;
GRANT SELECT ON public.packages TO authenticated;
GRANT ALL ON public.packages TO service_role;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Packages are publicly readable" ON public.packages FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  telegram_user_id BIGINT NOT NULL,
  telegram_chat_id BIGINT NOT NULL,
  telegram_username TEXT,
  token_symbol TEXT NOT NULL,
  token_name TEXT,
  token_contract TEXT NOT NULL,
  token_mc_usd NUMERIC,
  token_liquidity_usd NUMERIC,
  token_volume_24h_usd NUMERIC,
  package_id UUID REFERENCES public.packages(id),
  package_name TEXT NOT NULL,
  campaign_tier_label TEXT NOT NULL,
  price_sol NUMERIC(12, 4) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'processing', 'completed', 'cancelled')),
  payment_tx_signature TEXT UNIQUE,
  payment_confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.bot_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id BIGINT NOT NULL UNIQUE,
  telegram_username TEXT,
  added_by_telegram_user_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bot_admins TO authenticated;
GRANT ALL ON public.bot_admins TO service_role;
ALTER TABLE public.bot_admins ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.telegram_updates (
  update_id BIGINT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.telegram_updates TO service_role;
ALTER TABLE public.telegram_updates ENABLE ROW LEVEL SECURITY;

-- Seed the 6 boost packages
INSERT INTO public.packages (name, campaign_tier_label, price_sol, sort_order) VALUES
  ('Starter', '$10,000 MC', 1.2, 1),
  ('Basic', '$25,000 MC', 2.5, 2),
  ('Standard', '$50,000 MC', 5.0, 3),
  ('Premium', '$100,000 MC', 10.0, 4),
  ('Pro', '$500,000 MC', 20.0, 5),
  ('Elite', '$1,000,000 MC', 45.0, 6);