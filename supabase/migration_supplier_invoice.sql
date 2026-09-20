-- Add a separate invoice/PO value to purchase movements.
-- Run this once in Supabase SQL Editor on an existing installation.
-- Existing movement notes remain unchanged; old rows have a null invoice.

alter table public.movements
  add column if not exists supplier_invoice text
  check (length(supplier_invoice) <= 200);

-- Keep the existing 10-argument function working, and add an overload for the
-- new client call. The wrapper runs the old atomic stock operation first, then
-- annotates the movement it just created while the item lock is still held.
create or replace function public.apply_movement(
  p_item_id          text,
  p_type             text,
  p_quantity         numeric,
  p_reason           text,
  p_note             text,
  p_supplier_invoice text default null,
  p_job_id           uuid default null,
  p_unit_ids         text[] default '{}',
  p_unit_cost        numeric default null,
  p_manufacturer     text default null,
  p_year             int default null
) returns public.items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rec public.items;
  movement_id uuid;
begin
  select * into rec
    from public.apply_movement(
      p_item_id,
      p_type,
      p_quantity,
      p_reason,
      p_note,
      p_job_id,
      p_unit_ids,
      p_unit_cost,
      p_manufacturer,
      p_year
    );

  if p_reason = 'Purchase Restock' and nullif(trim(p_supplier_invoice), '') is not null then
    select id into movement_id
      from public.movements
     where item_id = p_item_id
       and actor_id = auth.uid()
     order by created_at desc
     limit 1;

    update public.movements
       set supplier_invoice = nullif(trim(p_supplier_invoice), '')
     where id = movement_id;
  end if;

  return rec;
end;
$$;

grant execute on function public.apply_movement(text, text, numeric, text, text, text, uuid, text[], numeric, text, int)
to authenticated;

-- Make the new RPC signature visible to PostgREST immediately.
notify pgrst, 'reload schema';
