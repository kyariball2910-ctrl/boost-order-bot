-- Allow awaiting_verification status for manual TX submission flow
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'awaiting_verification', 'paid', 'processing', 'completed', 'cancelled'));
