-- =============================================================
-- Sai Group Inventory — upgrade an EXISTING database
--
-- Only for a project where schema.sql has already been run. It adds the year
-- of manufacture on units, the two functions whose arguments changed to carry
-- it, lets cable be written off at the job it was sent to instead of coming
-- off the store balance twice, and shortens new item IDs to 3 digits
-- (SAI-BRN-0001 -> SAI-BRN-001), renumbering every item that already exists.
-- A fresh project needs schema.sql, not this.
--
-- Safe to run once; running it twice is harmless.
-- =============================================================

-- Stop with a clear message if this database is older than the change before
-- this one, rather than half-applying and failing somewhere in the middle.
do $mig$
begin
  if to_regclass('public.job_stock') is null
     or to_regprocedure('public.item_costs()') is null then
    raise exception 'This database is older than this script expects: job_stock or item_costs() is missing. Ask for a fuller upgrade script.';
  end if;
end;
$mig$;

-- ---------- 1. the new column ----------
alter table public.units
  add column if not exists manufacturing_year int
  check (manufacturing_year between 1950 and 2100);

-- ---------- 2. mint_units now takes the year ----------
-- Dropped rather than replaced: adding an argument creates a SECOND function of
-- the same name, and PostgREST refuses to choose between two overloads.
drop function if exists public.mint_units(text, int, numeric, text);

-- CREATE OR REPLACE, not CREATE: if this database already ran an earlier copy
-- of this migration, the 5-argument mint_units is already there, and a bare
-- CREATE would fail with "already exists". The DROP above only clears out the
-- old 4-argument shape; it is a no-op once that one is gone.
create or replace function public.mint_units(
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

-- ---------- 3. apply_movement passes the year through ----------
drop function if exists public.apply_movement(text, text, numeric, text, text, uuid, text[], numeric, text);

create or replace function public.apply_movement(
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
  -- where they end up.
  if p_type = 'condition' then
    select t.to_status, t.from_statuses into v_to, v_from
      from (values
        ('Damaged',  'damaged',  array['in_store']),
        ('Missing',  'missing',  array['in_store','at_job']),
        ('Scrapped', 'scrapped', array['in_store','at_job','damaged','missing']),
        ('Repaired', 'in_store', array['damaged']),
        ('Found',    'in_store', array['missing'])
      ) as t(reason, to_status, from_statuses)
     where t.reason = p_reason;
    if v_to is null then
      raise exception 'Say what happened: Damaged, Missing, Scrapped, Repaired or Found';
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
        -- Lost or scrapped AT A JOB. The shelf gave this up when it was issued,
        -- so taking it off the balance again would count the same loss twice.
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

-- ---------- 4. privileges ----------
-- A newly created function starts with default privileges again, so lock both
-- down and hand out only what the app actually calls.
revoke all on function public.mint_units(text, int, numeric, text, int) from public, anon, authenticated;
revoke all on function public.apply_movement(text, text, numeric, text, text, uuid, text[], numeric, text, int) from public, anon, authenticated;
grant execute on function public.apply_movement(text, text, numeric, text, text, uuid, text[], numeric, text, int) to authenticated;

-- The new column needs its own grant: the existing grants list every column by
-- name, and this one was not in that list.
grant select (manufacturing_year) on public.units to authenticated;
grant update (manufacturing_year) on public.units to authenticated;

-- ---------- 5. item IDs drop to 3 digits ----------
-- Only touches items still in the old 4-digit shape, so this is harmless to
-- run again — the second time finds nothing left to renumber.
--
-- items.id is a primary key that movements, units and job_stock all point to
-- by plain foreign key (no ON UPDATE CASCADE), so renaming it outright would
-- be rejected the moment a child row still pointed at the old value. The FKs
-- are made deferrable for this transaction only, so the check happens once
-- at commit — after every table agrees on the new id — then set back exactly
-- as schema.sql defines them.
begin;

do $mig$
declare
  fk record;
begin
  for fk in
    select conname, conrelid::regclass as tbl
      from pg_constraint
     where confrelid = 'public.items'::regclass and contype = 'f'
  loop
    execute format('alter table %s alter constraint %I deferrable initially deferred', fk.tbl, fk.conname);
  end loop;
end;
$mig$;

create temporary table item_id_renames as
select id as old_id,
       regexp_replace(id, '-[0-9]{4}$',
         '-' || lpad((regexp_replace(id, '.*-([0-9]{4})$', '\1'))::int::text, 3, '0'))
         as new_id
  from public.items
 where id ~ '-[0-9]{4}$';

update public.movements m
   set item_id = r.new_id
  from item_id_renames r
 where m.item_id = r.old_id;

update public.job_stock j
   set item_id = r.new_id
  from item_id_renames r
 where j.item_id = r.old_id;

-- Unit ids carry the item id as a prefix (SAI-BRN-0001-01), so they are
-- renamed alongside item_id, not left pointing at a prefix that no longer
-- exists on the product they belong to.
update public.units u
   set id = r.new_id || substring(u.id from length(r.old_id) + 1),
       item_id = r.new_id
  from item_id_renames r
 where u.item_id = r.old_id;

-- movements.unit_ids is a plain text[], not a foreign key, but it still
-- names units by the old prefix and would otherwise go stale silently.
update public.movements m
   set unit_ids = coalesce((
         select array_agg(
                  coalesce(
                    (select r.new_id || substring(withord.val from length(r.old_id) + 1)
                       from item_id_renames r
                      where withord.val like r.old_id || '-%'),
                    withord.val
                  ) order by withord.ord
                )
           from unnest(m.unit_ids) with ordinality as withord(val, ord)
       ), '{}')
 where exists (
   select 1 from unnest(m.unit_ids) as u(val), item_id_renames r
    where u.val like r.old_id || '-%'
 );

update public.items i
   set id = r.new_id
  from item_id_renames r
 where i.id = r.old_id;

drop table item_id_renames;

do $mig$
declare
  fk record;
begin
  for fk in
    select conname, conrelid::regclass as tbl
      from pg_constraint
     where confrelid = 'public.items'::regclass and contype = 'f'
  loop
    execute format('alter table %s alter constraint %I not deferrable initially immediate', fk.tbl, fk.conname);
  end loop;
end;
$mig$;

commit;

-- New items mint at 3 digits from here on. Replaced in place: the argument
-- list is unchanged, so there is no old overload left behind to drop.
create or replace function public.next_item_id(p_code text)
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
