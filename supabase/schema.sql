-- =============================================================
-- Sai Group Inventory — schema
-- Run once in a NEW Supabase project (SQL Editor -> New query), then data.sql.
--
-- Two roles:
--   viewer — can see stock, search and export, but no costs or stock value.
--            Cannot change anything.
--   admin  — everything a viewer can do, plus costs, adding products,
--            recording stock movements, editing and archiving products, and
--            setting people's roles.
--
-- The first account ever created becomes the admin automatically; everyone
-- after that starts as a viewer and an admin promotes them.
-- =============================================================

-- ---------- Profiles (one row per login, carries the role) ----------
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text check (length(full_name) <= 120),
  role       text not null default 'viewer' check (role in ('viewer', 'admin')),
  created_at timestamptz not null default now()
);

-- ---------- Categories (grouping, and the item ID prefix) ----------
create table public.categories (
  name       text primary key check (length(name) between 1 and 100),
  code       text not null unique check (code ~ '^[A-Z]{3}$'),  -- the SAI-<code>-001 prefix
  created_at timestamptz not null default now()
);

-- ---------- Jobs (the sites equipment goes out to) ----------
create table public.jobs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(name) between 1 and 120),
  site       text check (length(site) <= 120),
  customer   text check (length(customer) <= 120),
  status     text not null default 'active' check (status in ('active','closed')),
  notes      text check (length(notes) <= 2000),
  created_at timestamptz not null default now()
);

create index jobs_status_idx on public.jobs (status, name);

-- ---------- Items (one row per product) ----------
create table public.items (
  id                text primary key,               -- SAI-BRN-001
  name              text not null check (length(name) between 1 and 200),
  category          text not null references public.categories(name),
  unit              text not null default 'pcs' check (length(unit) between 1 and 20),
  -- 'serialized' = every physical unit has its own ID and its own whereabouts
  -- (anything counted in pcs). 'bulk' = tracked by amount only, which is the
  -- only thing that makes sense for cable in metres or coil in kg.
  tracking          text not null default 'bulk' check (tracking in ('serialized','bulk')),
  quantity          numeric not null default 0 check (quantity >= 0),
  reorder_threshold numeric not null default 0 check (reorder_threshold >= 0),
  unit_cost         numeric check (unit_cost >= 0),
  notes             text check (length(notes) <= 2000),
  -- Products are archived, never deleted: the ledger must keep its subject.
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index items_category_idx on public.items (category);
create index items_name_idx     on public.items (lower(name));

-- ---------- Movements (the stock ledger) ----------
create table public.movements (
  id            uuid primary key default gen_random_uuid(),
  item_id       text not null references public.items(id) on delete cascade,
  item_name     text not null,                      -- denormalized for fast display/export
  category      text not null,
  -- in = received, out = sent to a job, adjust = shelf count,
  -- condition = damaged / missing / scrapped / repaired / found
  type          text not null check (type in ('in','out','adjust','condition')),
  quantity      numeric not null,                   -- SIGNED change to the store balance
  reason        text check (length(reason) <= 100),
  note          text check (length(note) <= 500),   -- invoice number, or what happened
  actor         text check (length(actor) <= 160),  -- taken from the session
  actor_id      uuid references auth.users(id) on delete set null,
  job_id        uuid references public.jobs(id),     -- a job with history can't be deleted
  unit_ids      text[] not null default '{}',       -- which physical units this covered
  balance_after numeric not null,
  created_at    timestamptz not null default now()
);

create index movements_item_idx on public.movements (item_id, created_at desc);
create index movements_date_idx on public.movements (created_at desc);

-- ---------- Units (one row per physical thing, for serialized items) ----------
create table public.units (
  id           text primary key,                    -- SAI-BRN-001-01
  item_id      text not null references public.items(id) on delete cascade,
  seq          int  not null check (seq > 0),
  -- The same product can be bought from different makers at different prices,
  -- so what a unit cost belongs to the unit, not to the product.
  unit_cost    numeric check (unit_cost >= 0),
  manufacturer text check (length(manufacturer) <= 120),
  -- The year it was made, off the nameplate. Only pcs products have units, so
  -- this is only ever asked for equipment.
  manufacturing_year int check (manufacturing_year between 1950 and 2100),
  -- in_store, at_job (job_id says which), damaged (repairable), missing,
  -- scrapped (gone for good). Only in_store counts toward the balance.
  status       text not null default 'in_store'
               check (status in ('in_store','at_job','damaged','missing','scrapped')),
  job_id       uuid references public.jobs(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------- Cable and coil out at each job ----------
-- A piece of equipment carries its own job (units.job_id). Measured stock
-- can't, so how much of each product has gone to each job and not come back is
-- kept here. It is what stops more coming back from a job than was sent, and
-- unlike the ledger it is never cleared. A row disappears when it reaches 0.
create table public.job_stock (
  job_id   uuid    not null references public.jobs(id),
  item_id  text    not null references public.items(id),
  quantity numeric not null check (quantity > 0),
  primary key (job_id, item_id)
);

create unique index units_item_seq_idx on public.units (item_id, seq);
create index units_item_idx on public.units (item_id, status);
create index units_job_idx  on public.units (job_id) where job_id is not null;

-- ---------- New logins get a profile automatically ----------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  is_first boolean;
begin
  select not exists (select 1 from public.profiles) into is_first;
  insert into public.profiles (id, email, role)
  values (new.id, new.email, case when is_first then 'admin' else 'viewer' end)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Role helpers ----------
-- security definer so a policy can read profiles without the profiles policies
-- recursing back into this function.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- Raises unless the caller may write. The write functions run as the table
-- owner and bypass RLS, so this check is what actually enforces the role there.
create function public.assert_can_write()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  jwt_role text := coalesce(auth.jwt() ->> 'role', 'server');
begin
  -- 'server' = no JWT at all, i.e. the SQL editor (how data.sql runs).
  if jwt_role in ('server', 'service_role') then
    return;
  end if;
  if jwt_role = 'anon' or auth.uid() is null then
    raise exception 'Please sign in first' using errcode = '42501';
  end if;
  if not public.is_admin() then
    raise exception 'Your account is view-only. An admin can change stock.'
      using errcode = '42501';
  end if;
end;
$$;

-- ---------- Next ID for a category code ----------
create function public.next_item_id(p_code text)
returns text
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  n int;
begin
  -- p_code goes into a regex and into the ID, so it is checked, not trusted.
  if p_code !~ '^[A-Z]{3}$' then
    raise exception 'Invalid category code: %', p_code;
  end if;

  select coalesce(max((split_part(id, '-', 3))::int), 0) + 1
    into n
    from public.items
   where id ~ ('^SAI-' || p_code || '-[0-9]{3}$');
  return 'SAI-' || p_code || '-' || lpad(n::text, 3, '0');
end;
$$;

-- ---------- Who is acting, taken from the session and not from the client ----------
create function public.current_actor()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select coalesce(full_name, email) from public.profiles where id = auth.uid()),
    'system'
  );
$$;

-- ---------- Keep unit of measure and tracking mode consistent ----------
-- Switching a product between pcs and m/kg changes how it is tracked, so it is
-- refused once the product has units or stock that the switch would strand.
create function public.items_keep_tracking_honest()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.unit is distinct from old.unit
     and (new.unit = 'pcs') is distinct from (old.unit = 'pcs') then

    if exists (select 1 from public.units where item_id = old.id) then
      raise exception
        'Cannot switch % to %: it already has individual units on record. Add a new product instead.',
        old.name, new.unit
        using errcode = '22023';
    end if;

    if old.quantity <> 0 then
      raise exception
        'Cannot switch % to % while it still has stock. Bring the balance to zero first.',
        old.name, new.unit
        using errcode = '22023';
    end if;

    new.tracking := case when new.unit = 'pcs' then 'serialized' else 'bulk' end;
  end if;

  return new;
end;
$$;

create trigger items_tracking_guard
  before update on public.items
  for each row execute function public.items_keep_tracking_honest();

-- ---------- Mint N new physical units for a serialized item ----------
-- Sequence numbers never repeat for an item, even after units are scrapped, so
-- a unit ID always refers to one physical thing for good.
create function public.mint_units(
  p_item_id      text,
  p_count        int,
  p_unit_cost    numeric default null,
  p_manufacturer text default null,
  p_year         int default null
)
returns text[]
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  next_seq int;
  made     text[] := '{}';
  i        int;
  new_id   text;
begin
  if p_count is null or p_count <= 0 then
    return made;
  end if;

  select coalesce(max(seq), 0) + 1 into next_seq
    from public.units where item_id = p_item_id;

  for i in 0 .. p_count - 1 loop
    new_id := p_item_id || '-' || lpad((next_seq + i)::text, 2, '0');
    insert into public.units (id, item_id, seq, unit_cost, manufacturer, manufacturing_year)
    values (new_id, p_item_id, next_seq + i, p_unit_cost, p_manufacturer, p_year);
    made := made || new_id;
  end loop;

  return made;
end;
$$;

-- ---------- Add a category ----------
create function public.create_category(p_name text, p_code text)
returns public.categories
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rec public.categories;
begin
  perform public.assert_can_write();

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Category name is required';
  end if;
  if p_code !~ '^[A-Z]{3}$' then
    raise exception 'Code must be exactly 3 uppercase letters';
  end if;
  if exists (select 1 from public.categories where name = trim(p_name)) then
    raise exception 'That category already exists';
  end if;
  if exists (select 1 from public.categories where code = p_code) then
    raise exception '% is already used by another category', p_code;
  end if;

  insert into public.categories (name, code) values (trim(p_name), p_code)
  returning * into rec;
  return rec;
end;
$$;

-- ---------- Create item + opening-stock movement, atomically ----------
create function public.create_item(
  p_name              text,
  p_category          text,
  p_unit              text,
  p_quantity          numeric,
  p_reorder_threshold numeric,
  p_unit_cost         numeric,
  p_notes             text
) returns public.items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_id   text;
  v_code   text;
  rec      public.items;
  v_track  text;
  v_units  text[] := '{}';
begin
  perform public.assert_can_write();

  select code into v_code from public.categories where name = p_category;
  if v_code is null then
    raise exception 'Unknown category: % — add it first', p_category;
  end if;

  v_track := case when coalesce(p_unit, 'pcs') = 'pcs' then 'serialized' else 'bulk' end;

  -- One unit row per piece, so a countable balance must be whole — otherwise
  -- 2.5 would be stored as the balance while 3 units were minted.
  if v_track = 'serialized' and coalesce(p_quantity, 0) <> trunc(coalesce(p_quantity, 0)) then
    raise exception 'A product counted in pcs needs a whole number';
  end if;

  -- Two people adding a burner at the same moment must not get the same ID.
  perform pg_advisory_xact_lock(hashtext('sai_item_id_' || v_code));

  new_id := public.next_item_id(v_code);

  -- A countable product has no single price — each unit carries its own — so
  -- the opening cost goes onto the units. Only measured stock keeps a
  -- product-level (average) cost.
  insert into public.items (id, name, category, unit, tracking, quantity,
                            reorder_threshold, unit_cost, notes)
  values (new_id, p_name, p_category, coalesce(p_unit, 'pcs'), v_track,
          coalesce(p_quantity, 0), coalesce(p_reorder_threshold, 0),
          case when v_track = 'bulk' then p_unit_cost end,
          p_notes)
  returning * into rec;

  if v_track = 'serialized' then
    v_units := public.mint_units(rec.id, coalesce(p_quantity, 0)::int, p_unit_cost);
  end if;

  -- day-one balance lives in the history log, not as an un-logged number
  insert into public.movements (item_id, item_name, category, type, quantity,
                                reason, note, actor, actor_id, unit_ids, balance_after)
  values (rec.id, rec.name, rec.category, 'in', coalesce(p_quantity, 0),
          'Opening Stock', null, public.current_actor(), auth.uid(), v_units,
          coalesce(p_quantity, 0));

  return rec;
end;
$$;

-- ---------- Apply a stock movement, atomically ----------
-- BULK items (cable, coil) move by amount.
--
-- SERIALIZED items move by naming the physical units:
--   in        + unit ids  -> those units come back from a job into the store
--   in        no unit ids -> that many brand-new units are minted (a purchase)
--   out       + unit ids  -> those units go out to p_job_id
--   adjust    + unit ids  -> the units listed are the ones actually found in the
--                            store during a count; anything else that was
--                            supposed to be in the store is marked missing
--   condition + unit ids  -> p_reason says what happened to them (see below)
--
-- A bulk condition entry naming a job is a write-off at that site: it comes off
-- what the job still has out, not off the store balance, which gave the stock
-- up when it was issued.
--
-- Whatever the path, the balance and the ledger entry are written together in
-- one transaction, so they cannot disagree.
create function public.apply_movement(
  p_item_id      text,
  p_type         text,
  p_quantity     numeric,
  p_reason       text,
  p_note         text,
  p_job_id       uuid default null,
  p_unit_ids     text[] default '{}',
  p_unit_cost    numeric default null,
  p_manufacturer text default null,
  p_year         int default null
) returns public.items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rec        public.items;
  new_qty    numeric;
  delta      numeric;
  v_units    text[] := coalesce(p_unit_ids, '{}');
  v_touched  int;
  v_from_job uuid;
  v_avg_cost numeric;
  v_to       text;
  v_from     text[];
  v_at_job   numeric;
begin
  perform public.assert_can_write();

  select * into rec from public.items where id = p_item_id for update;
  if not found then
    raise exception 'Item % not found', p_item_id;
  end if;

  if p_type not in ('in','out','adjust','condition') then
    raise exception 'Unknown movement type %', p_type;
  end if;

  if p_job_id is not null and not exists (select 1 from public.jobs where id = p_job_id) then
    raise exception 'That job does not exist';
  end if;

  -- Applies to both tracking modes: cable and coil sent to a job need the job
  -- recorded too, not just equipment.
  if p_type = 'out' and p_reason = 'Issued to Job' and p_job_id is null then
    raise exception 'Which job is this going to?';
  end if;

  -- A returned unit already knows its job; returned cable and coil do not, so
  -- the job has to be named or the return never shows up in that job's history.
  if p_type = 'in' and p_reason = 'Return from Job' and rec.tracking = 'bulk' and p_job_id is null then
    raise exception 'Which job is this coming back from?';
  end if;

  -- Damage / loss: what happened decides which units it can apply to and
  -- where they end up. "Used at Job" is cable/coil only — installed or used up
  -- at a job in the ordinary way, not a loss — and always names the job, since
  -- there is no such thing as cable used up while sitting in the store.
  if p_type = 'condition' then
    select t.to_status, t.from_statuses into v_to, v_from
      from (values
        ('Damaged',      'damaged',  array['in_store']),
        ('Missing',      'missing',  array['in_store','at_job']),
        ('Scrapped',     'scrapped', array['in_store','at_job','damaged','missing']),
        ('Repaired',     'in_store', array['damaged']),
        ('Found',        'in_store', array['missing']),
        ('Used at Job',  'scrapped', array['at_job'])
      ) as t(reason, to_status, from_statuses)
     where t.reason = p_reason;
    if v_to is null then
      raise exception 'Say what happened: Damaged, Missing, Scrapped, Repaired, Found or Used at Job';
    end if;
    if p_reason = 'Used at Job' then
      if rec.tracking = 'serialized' then
        raise exception 'Equipment cannot be marked used up — mark it Scrapped if it is beyond repair';
      end if;
      if p_job_id is null then
        raise exception 'Which job was this used at?';
      end if;
    end if;
  end if;

  -- Every named unit must belong to this item — no moving a burner by quoting a
  -- pump's unit id.
  if cardinality(v_units) > 0 then
    if rec.tracking <> 'serialized' then
      raise exception '% is tracked by amount, not by unit', rec.name;
    end if;
    if exists (
      select 1 from unnest(v_units) as u(id)
       where not exists (select 1 from public.units
                          where id = u.id and item_id = p_item_id)
    ) then
      raise exception 'Those units do not belong to %', rec.name;
    end if;

    -- Which job the units are leaving, captured before anything clears it, so a
    -- return or a loss at site is recorded against that job. If they span two
    -- jobs there is no single answer, so it stays null.
    select case when count(distinct job_id) = 1
                then (array_agg(distinct job_id))[1] end
      into v_from_job
      from public.units
     where id = any(v_units) and job_id is not null;
  end if;

  -- ---------------- serialized ----------------
  if rec.tracking = 'serialized' then

    if p_type = 'in' then
      if cardinality(v_units) > 0 then
        update public.units
           set status = 'in_store', job_id = null, updated_at = now()
         where id = any(v_units) and item_id = p_item_id and status = 'at_job';
        get diagnostics v_touched = row_count;
        if v_touched = 0 then
          raise exception 'None of those units are out at a job';
        end if;
      else
        if p_quantity is null or p_quantity <= 0 or p_quantity <> trunc(p_quantity) then
          raise exception 'How many new units are you receiving? It must be a whole number.';
        end if;
        v_units := public.mint_units(p_item_id, p_quantity::int, p_unit_cost, p_manufacturer, p_year);
        v_touched := cardinality(v_units);
      end if;
      new_qty := rec.quantity + v_touched;

    elsif p_type = 'out' then
      if cardinality(v_units) = 0 then
        raise exception 'Choose which units of % are going out', rec.name;
      end if;
      update public.units
         set status = 'at_job', job_id = p_job_id, updated_at = now()
       where id = any(v_units) and item_id = p_item_id and status = 'in_store';
      get diagnostics v_touched = row_count;
      if v_touched = 0 then
        raise exception 'None of those units are in the store right now';
      end if;
      new_qty := rec.quantity - v_touched;

    elsif p_type = 'adjust' then
      -- A physical count of the shelf. Units out at a job are not on the shelf,
      -- so a count never touches them — otherwise counting the store would
      -- quietly recall equipment from a site. Damaged units come back only
      -- through Repaired. So only in_store <-> missing moves here.
      update public.units
         set status = 'missing', updated_at = now()
       where item_id = p_item_id
         and status = 'in_store'
         and not (id = any(v_units));

      update public.units
         set status = 'in_store', updated_at = now()
       where item_id = p_item_id
         and id = any(v_units)
         and status = 'missing';

      select count(*) into new_qty
        from public.units where item_id = p_item_id and status = 'in_store';

    else
      if cardinality(v_units) = 0 then
        raise exception 'Choose which units of % this applies to', rec.name;
      end if;
      if exists (select 1 from public.units
                  where id = any(v_units) and not (status = any(v_from))) then
        raise exception 'Some of those units cannot be marked %', lower(p_reason);
      end if;
      update public.units
         set status = v_to, job_id = null, updated_at = now()
       where id = any(v_units) and item_id = p_item_id;

      select count(*) into new_qty
        from public.units where item_id = p_item_id and status = 'in_store';
    end if;

  -- ---------------- bulk ----------------
  else
    if p_quantity is null or p_quantity < 0 then
      raise exception 'Quantity must be zero or more';
    end if;

    if p_type = 'in' then
      -- A return can only bring back what that job actually has.
      if p_reason = 'Return from Job' then
        select quantity into v_at_job from public.job_stock
         where job_id = p_job_id and item_id = p_item_id
           for update;
        if p_quantity > coalesce(v_at_job, 0) then
          raise exception 'Only % % of % is out at that job',
            coalesce(v_at_job, 0), rec.unit, rec.name;
        end if;
        if p_quantity = v_at_job then
          delete from public.job_stock where job_id = p_job_id and item_id = p_item_id;
        else
          update public.job_stock set quantity = quantity - p_quantity
           where job_id = p_job_id and item_id = p_item_id;
        end if;
      end if;

      new_qty := rec.quantity + p_quantity;
      -- Cable bought across many purchases at different rates has no unit to
      -- price, so the product carries a weighted average instead.
      if p_unit_cost is not null and new_qty > 0 then
        v_avg_cost := ((rec.quantity * coalesce(rec.unit_cost, p_unit_cost))
                       + (p_quantity * p_unit_cost)) / new_qty;
      end if;
    elsif p_type in ('out', 'condition') then
      -- Cable and coil have no pieces to repair or find, so only the losses
      -- apply; anything recovered is received back in.
      if p_type = 'condition' and v_to = 'in_store' then
        raise exception '% is tracked by amount — receive recovered stock back in instead', rec.name;
      end if;

      if p_type = 'condition' and p_job_id is not null then
        -- Lost, scrapped, or used up AT A JOB. The shelf gave this up when it
        -- was issued, so taking it off the balance again would count it twice.
        -- It comes off what that job still has out, and never comes home.
        select quantity into v_at_job from public.job_stock
         where job_id = p_job_id and item_id = p_item_id
           for update;
        if p_quantity > coalesce(v_at_job, 0) then
          raise exception 'Only % % of % is out at that job',
            coalesce(v_at_job, 0), rec.unit, rec.name;
        end if;
        if p_quantity = v_at_job then
          delete from public.job_stock where job_id = p_job_id and item_id = p_item_id;
        else
          update public.job_stock set quantity = quantity - p_quantity
           where job_id = p_job_id and item_id = p_item_id;
        end if;
        new_qty := rec.quantity;
      else
        new_qty := rec.quantity - p_quantity;
        if new_qty < 0 then
          raise exception 'Cannot take out % — only % % on hand',
            p_quantity, rec.quantity, rec.unit;
        end if;
      end if;

      if p_type = 'out' and p_reason = 'Issued to Job' and p_quantity > 0 then
        insert into public.job_stock (job_id, item_id, quantity)
        values (p_job_id, p_item_id, p_quantity)
        on conflict (job_id, item_id)
          do update set quantity = public.job_stock.quantity + excluded.quantity;
      end if;
    else
      new_qty := p_quantity;
    end if;
  end if;

  if new_qty < 0 then
    raise exception 'That would leave a negative balance';
  end if;

  delta := new_qty - rec.quantity;

  update public.items
     set quantity   = new_qty,
         unit_cost  = coalesce(v_avg_cost, unit_cost),
         updated_at = now()
   where id = p_item_id
  returning * into rec;

  insert into public.movements (item_id, item_name, category, type, quantity,
                                reason, note, actor, actor_id, job_id,
                                unit_ids, balance_after)
  values (rec.id, rec.name, rec.category, p_type, delta,
          p_reason, p_note, public.current_actor(), auth.uid(),
          coalesce(p_job_id, v_from_job), v_units, new_qty);

  return rec;
end;
$$;

-- ---------- Delete a job added by mistake (admins only) ----------
-- Only a job nothing refers to can go. Once equipment has been sent to it or
-- any history names it, it stays — rename or close it instead — so the ledger
-- never loses which job an entry was for.
create function public.delete_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_can_write();

  if exists (select 1 from public.units where job_id = p_job_id) then
    raise exception 'Equipment is still out at this job — return it first';
  end if;
  if exists (select 1 from public.job_stock where job_id = p_job_id) then
    raise exception 'Cable or coil sent to this job has not all come back, so it cannot be deleted. Close it instead.';
  end if;
  if exists (select 1 from public.movements where job_id = p_job_id) then
    raise exception 'This job already has stock history, so it cannot be deleted. Close it instead.';
  end if;

  delete from public.jobs where id = p_job_id;
  if not found then
    raise exception 'That job does not exist';
  end if;
end;
$$;

-- ---------- What things cost (admins only) ----------
-- unit_cost is deliberately missing from the select grants above, so this is
-- the only way to read it. A viewer gets no rows rather than an error, and the
-- app simply shows no prices.
create function public.item_costs()
returns table (id text, unit_cost numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id, unit_cost from public.items where public.is_admin();
$$;

create function public.unit_costs()
returns table (id text, unit_cost numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id, unit_cost from public.units where public.is_admin();
$$;

-- ---------- Set someone's role (admins only) ----------
create function public.set_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_can_write();

  if p_role not in ('viewer', 'admin') then
    raise exception 'Unknown role: %', p_role;
  end if;

  -- Don't let the last admin demote themselves and lock everyone out.
  if p_role = 'viewer'
     and exists (select 1 from public.profiles where id = p_user_id and role = 'admin')
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'This is the only admin — promote someone else first';
  end if;

  update public.profiles set role = p_role where id = p_user_id;
end;
$$;

-- ---------- How much of the free plan's storage is used (admins only) ----------
-- The free Supabase plan caps the whole database at 500 MB. The ledger is the
-- only table that grows without bound, so the app uses this to warn before
-- that cap is hit, well ahead of time.
create function public.database_size_bytes()
returns bigint
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return pg_database_size(current_database());
end;
$$;

-- ---------- Clear old history, once it has been backed up (admins only) ----------
-- Deleting movements never changes any balance — quantity lives on items and
-- units, not on a sum of the ledger — so this is safe at any time. It exists
-- only so the free plan's storage does not run out; recent history stays
-- protected so a fat-fingered date cannot erase this month's work.
create function public.purge_movements(p_before timestamptz)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  perform public.assert_can_write();

  if p_before is null or p_before > now() - interval '30 days' then
    raise exception 'Can only clear movements older than 30 days, to protect recent history';
  end if;

  delete from public.movements where created_at < p_before;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- =============================================================
-- Privileges
--
-- Create the project with "Automatically expose new tables" OFF, so nothing is
-- reachable through the API until it is granted here. The grants are narrow:
--
--   * anon (signed out) gets nothing at all — the app requires a login.
--   * authenticated can READ every table except what things cost. RLS and the
--     column grants below decide the rest.
--   * NOBODY can insert into movements directly, and nobody can update
--     items.quantity directly. Both are reachable only through the functions
--     above, which log the movement and change the balance in one transaction.
-- =============================================================

-- Start from nothing. Supabase can pre-grant anon and authenticated full
-- access to new tables and EXECUTE on new functions through default
-- privileges, and `revoke ... from public` alone does not undo a grant made
-- to those roles by name. Revoking explicitly means the rules below hold no
-- matter how the project's Data API settings were left.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant usage on schema public to anon, authenticated;

-- Every column EXCEPT unit_cost: what things cost is admin-only, and column
-- grants are the only way to make that true for direct API calls as well as
-- for the screen. Admins read costs through item_costs()/unit_costs() below.
grant select (id, name, category, unit, tracking, quantity, reorder_threshold,
              notes, archived_at, created_at, updated_at)
  on public.items to authenticated;
grant select on public.movements  to authenticated;
grant select on public.profiles   to authenticated;
grant select (id, item_id, seq, manufacturer, manufacturing_year, status, job_id, created_at, updated_at)
  on public.units to authenticated;
grant select on public.jobs       to authenticated;
grant select on public.categories to authenticated;
grant select on public.job_stock  to authenticated;  -- written only by apply_movement

-- Anyone may set their own display name. Only this one column is grantable, so
-- this cannot be used to hand yourself the admin role.
grant update (full_name) on public.profiles to authenticated;

-- Jobs are just a list of places; admins add and edit them directly (RLS
-- below). Deleting goes through delete_job, which refuses a job in use.
grant insert, update on public.jobs to authenticated;

-- Cost and maker are editable directly. Status and job_id are deliberately
-- absent — those move only through apply_movement.
grant update (unit_cost, manufacturer, manufacturing_year, updated_at)
  on public.units to authenticated;

-- `quantity` is NOT in this list — stock levels move only through apply_movement.
grant update (name, category, unit, reorder_threshold, unit_cost,
              notes, archived_at, updated_at)
  on public.items to authenticated;

-- No DELETE on items. Removing a product would cascade its movement history
-- away; archiving is the supported path.

-- Only the functions the app calls are executable. mint_units, next_item_id,
-- current_actor and assert_can_write are internal helpers with no role check
-- of their own, so they stay private to the functions that use them.
grant execute on function public.create_category(text, text) to authenticated;
grant execute on function public.create_item(text, text, text, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.apply_movement(text, text, numeric, text, text, uuid, text[], numeric, text, int) to authenticated;
grant execute on function public.delete_job(uuid) to authenticated;
grant execute on function public.set_user_role(uuid, text) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.item_costs() to authenticated;
grant execute on function public.unit_costs() to authenticated;
grant execute on function public.database_size_bytes() to authenticated;
grant execute on function public.purge_movements(timestamptz) to authenticated;

-- =============================================================
-- Row level security
-- =============================================================

alter table public.profiles   enable row level security;
alter table public.items      enable row level security;
alter table public.movements  enable row level security;
alter table public.units      enable row level security;
alter table public.jobs       enable row level security;
alter table public.categories enable row level security;
alter table public.job_stock  enable row level security;

create policy job_stock_read on public.job_stock
  for select to authenticated using (true);

-- Anyone signed in can read the catalogue and the ledger.
create policy items_read on public.items
  for select to authenticated using (true);

-- New categories are added only through create_category, which checks the
-- role itself — there is no INSERT grant on this table at all.
create policy categories_read on public.categories
  for select to authenticated using (true);

create policy movements_read on public.movements
  for select to authenticated using (true);

create policy units_read on public.units
  for select to authenticated using (true);

-- Only cost and maker are grantable above, so this cannot be used to move a
-- unit between the store and a job.
create policy units_write on public.units
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy jobs_read on public.jobs
  for select to authenticated using (true);

create policy jobs_add on public.jobs
  for insert to authenticated with check (public.is_admin());

create policy jobs_edit on public.jobs
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Only admins can edit or archive a product.
create policy items_write on public.items
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- You can always see your own profile; admins can see everyone's, because the
-- admin screen lists them. Roles are changed only through set_user_role().
create policy profiles_read on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- Your own row only, and only full_name is granted above.
create policy profiles_set_name on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- There are no INSERT policies on items or movements, and no UPDATE or DELETE
-- policy on movements. The only way an entry is ever removed is
-- purge_movements, for entries older than 30 days.
